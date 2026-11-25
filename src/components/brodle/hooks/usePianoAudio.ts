import { useCallback, useEffect, useRef, useState } from 'react';
import type { Smplr } from 'smplr';
import { BPM, MELODY, melodyForGuess } from '../lib/musicGame';
import type { MelodyStep } from '../lib/musicGame';
import { arrangementTimeline } from '../lib/victoryMusic';
import type { PlayableStep } from '../lib/victoryMusic';
import { createSampledPiano, defaultPianoSound, PIANO_SOUNDS } from '../lib/pianoSounds';
import type { PianoSound, SampledPianoSound } from '../lib/pianoSounds';

const HOLD_THRESHOLD_MS = 180;
const TAP_DECAY_SECONDS = .42;
const TAP_DURATION_SECONDS = .45;

export type ScheduledTone = { midi: number; time: number; duration: number; sustain?: boolean };
export type AudioTimeline = { events: ScheduledTone[]; totalDuration: number };

type Voice = {
  stop: (time?: number) => void;
  tap: () => void;
  sustain: () => void;
  release: () => void;
};
type InstrumentEntry = {
  instance?: Smplr;
  promise: Promise<Smplr> | null;
  ready: boolean;
  progress: number;
};
class PianoSoundError extends Error {}
type HeldNote = {
  midi: number;
  pressedAt: number;
  releasedAt?: number;
  cancelled?: boolean;
  voice?: Voice;
  holdTimer?: ReturnType<typeof setTimeout>;
};

export function usePianoAudio(defaultMelody: readonly Pick<MelodyStep, 'midi' | 'beats' | 'triplet'>[] = MELODY, defaultBpm = BPM, fixedSound?: PianoSound) {
  const audioContext = useRef<AudioContext | null>(null);
  const masterGain = useRef<GainNode | null>(null);
  const reverbEnabled = useRef(false);
  const reverbImpulse = useRef<AudioBuffer | null>(null);
  const reverbGraph = useRef<{ convolver: ConvolverNode; wet: GainNode } | null>(null);
  const volumeLevel = useRef(.6);
  const voices = useRef(new Set<Voice>());
  const sequenceVoices = useRef(new Set<Voice>());
  const heldNotes = useRef(new Map<string, HeldNote>());
  const playbackTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const sequenceNotes = useRef(new Map<number, number>());
  const playbackRequest = useRef(0);
  const audioGeneration = useRef(0);
  const nextVoiceId = useRef(0);
  const instruments = useRef(new Map<SampledPianoSound, InstrumentEntry>());
  const unavailableSounds = useRef(new Set<SampledPianoSound>());
  const [sound, setSoundState] = useState<PianoSound>(() => fixedSound ?? defaultPianoSound());
  const selectedSound = useRef<PianoSound>(sound);
  const [soundStatus, setSoundStatus] = useState<'loading' | 'ready' | 'error'>(() => sound === 'synth' ? 'ready' : 'loading');
  const [soundProgress, setSoundProgress] = useState(0);
  const [usingSynthFallback, setUsingSynthFallback] = useState(false);
  const [volume, setVolumeState] = useState(60);
  const [reverb, setReverbState] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [audioError, setAudioError] = useState('');
  const [pressedNotes, setPressedNotes] = useState<Set<number>>(new Set());

  const clearReverb = useCallback(() => {
    const graph = reverbGraph.current;
    if (!graph) return;
    masterGain.current?.disconnect(graph.convolver);
    graph.convolver.disconnect();
    graph.wet.disconnect();
    reverbGraph.current = null;
  }, []);

  const connectReverb = useCallback((context: AudioContext, output: GainNode) => {
    if (reverbGraph.current) return;
    if (!reverbImpulse.current) {
      const length = Math.ceil(context.sampleRate * .38);
      const impulse = context.createBuffer(2, length, context.sampleRate);
      for (let channel = 0; channel < 2; channel++) {
        const samples = impulse.getChannelData(channel);
        for (let index = 0; index < length; index++)
          samples[index] = (Math.random() * 2 - 1) * (1 - index / length) ** 3;
      }
      reverbImpulse.current = impulse;
    }
    const convolver = context.createConvolver(), wet = context.createGain();
    convolver.buffer = reverbImpulse.current;
    wet.gain.value = .12;
    output.connect(convolver);
    convolver.connect(wet);
    wet.connect(context.destination);
    reverbGraph.current = { convolver, wet };
  }, []);

  const setReverb = useCallback((enabled: boolean) => {
    reverbEnabled.current = enabled;
    setReverbState(enabled);
    const context = audioContext.current;
    if (!enabled) clearReverb();
    else if (context && context.state !== 'closed') connectReverb(context, masterGain.current!);
  }, [clearReverb, connectReverb]);

  const updatePressedNotes = useCallback(() => {
    const notes = new Set([...heldNotes.current.values()].map((note) => note.midi));
    sequenceNotes.current.forEach((_, midi) => notes.add(midi));
    setPressedNotes(notes);
  }, []);

  const stopSequence = useCallback(() => {
    playbackRequest.current += 1;
    playbackTimers.current.forEach(clearTimeout);
    playbackTimers.current.clear();
    sequenceNotes.current.clear();
    updatePressedNotes();
    sequenceVoices.current.forEach((voice) => voice.stop());
    sequenceVoices.current.clear();
    setPlaying(null);
  }, [updatePressedNotes]);

  const stopAudio = useCallback(() => {
    audioGeneration.current += 1;
    stopSequence();
    heldNotes.current.forEach(({ holdTimer }) => {
      if (holdTimer !== undefined) clearTimeout(holdTimer);
    });
    voices.current.forEach((voice) => voice.stop());
    voices.current.clear();
    clearReverb();
    heldNotes.current.clear();
    updatePressedNotes();
  }, [stopSequence, updatePressedNotes, clearReverb]);

  const ensureAudio = useCallback(() => {
    if (!audioContext.current) {
      audioContext.current = new AudioContext();
      masterGain.current = audioContext.current.createGain();
      masterGain.current.gain.value = volumeLevel.current;
      masterGain.current.connect(audioContext.current.destination);
    }
    if (reverbEnabled.current) connectReverb(audioContext.current, masterGain.current!);
    return { context: audioContext.current, output: masterGain.current! };
  }, [connectReverb]);

  const getInstrument = useCallback((context: AudioContext, output: GainNode, choice: SampledPianoSound): Promise<Smplr> => {
    const cached = instruments.current.get(choice);
    if (selectedSound.current === choice && audioContext.current === context) {
      setSoundStatus(cached?.ready ? 'ready' : 'loading');
      setSoundProgress(cached?.progress ?? 0);
    }
    if (cached?.promise) return cached.promise;

    const entry: InstrumentEntry = { promise: null, ready: false, progress: 0 };
    instruments.current.set(choice, entry);
    entry.promise = (async () => {
      const instrument = await createSampledPiano(context, output, choice, ({ loaded, total }) => {
        entry.progress = total ? Math.round(loaded / total * 100) : 0;
        if (audioContext.current === context && selectedSound.current === choice && instruments.current.get(choice) === entry) {
          setSoundProgress(entry.progress);
        }
      });
      entry.instance = instrument;
      if (audioContext.current !== context) {
        instrument.dispose();
        throw new Error('Audio context closed.');
      }
      await instrument.ready;
      if (audioContext.current !== context || context.state === 'closed') {
        instrument.dispose();
        throw new Error('Audio context closed.');
      }
      entry.ready = true;
      entry.progress = 100;
      if (selectedSound.current === choice && instruments.current.get(choice) === entry) {
        unavailableSounds.current.delete(choice);
        setUsingSynthFallback(false);
        setSoundStatus('ready');
        setSoundProgress(100);
        setAudioError('');
      }
      return instrument;
    })().catch(() => {
      entry.instance?.dispose();
      const error = new PianoSoundError(`${PIANO_SOUNDS[choice]} could not load. Try again or choose Synth.`);
      if (instruments.current.get(choice) === entry) {
        instruments.current.delete(choice);
        unavailableSounds.current.add(choice);
        if (audioContext.current === context && selectedSound.current === choice) {
          setUsingSynthFallback(true);
          setSoundStatus('error');
          setAudioError(error.message);
        }
      }
      throw error;
    });
    return entry.promise;
  }, []);

  const getAudio = useCallback(async () => {
    const choice = selectedSound.current;
    const { context, output } = ensureAudio();
    if (context.state !== 'running' && context.state !== 'closed') await context.resume();
    let instrument: Smplr | null = null;
    if (choice !== 'synth' && context.state !== 'closed' && !unavailableSounds.current.has(choice)) {
      try {
        instrument = await getInstrument(context, output, choice);
      } catch (error) {
        if (!(error instanceof PianoSoundError)) throw error;
        // Play this very note or melody with the built-in synth. Later notes
        // keep working without repeating failed downloads until Retry is used.
      }
    }
    return { context, output, instrument };
  }, [ensureAudio, getInstrument]);

  const createVoice = useCallback((context: AudioContext, output: GainNode, instrument: Smplr | null, midi: number, time: number, duration?: number, options: { sustain?: boolean } = {}) => {
    const gate = options.sustain ? 1 : .9;
    const cleanup = () => {
      voices.current.delete(voice);
      sequenceVoices.current.delete(voice);
    };
    // Arrangement pitches can exceed a sampler's MIDI map. Keep
    // those pitches exact with the synth instead of dropping or folding notes.
    if (instrument && midi >= 0 && midi <= 127) {
      let stopNote: (time?: number) => void = () => {};
      const voice: Voice = {
        stop: (at) => { stopNote(at); voices.current.delete(voice); sequenceVoices.current.delete(voice); },
        tap: () => stopNote(Math.max(context.currentTime, time + TAP_DURATION_SECONDS - .1)),
        sustain: () => {}, // Recorded piano notes have their own natural decay.
        release: () => stopNote(),
      };
      voices.current.add(voice);
      stopNote = instrument.start({
        note: midi, time, velocity: 80, ampRelease: options.sustain ? .015 : .1,
        duration: duration === undefined ? null : duration * gate,
        stopId: `voice-${nextVoiceId.current++}`,
        onEnded: () => { voices.current.delete(voice); sequenceVoices.current.delete(voice); },
      });
      return voice;
    }
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const voice: Voice = {
      stop: (at) => { oscillator.stop(at); cleanup(); },
      tap: () => oscillator.stop(time + TAP_DURATION_SECONDS),
      sustain: () => {
        const now = context.currentTime;
        const level = gain.gain.value;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(level, now);
        gain.gain.linearRampToValueAtTime(.12, now + .02);
      },
      release: () => {
        const now = context.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + .08);
        oscillator.stop(now + .09);
      },
    };
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440 * 2 ** ((midi - 69) / 12), time);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(.25, time + .01);
    oscillator.connect(gain);
    gain.connect(output);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      cleanup();
    };
    oscillator.start(time);
    voices.current.add(voice);
    if (duration !== undefined) {
      if (options.sustain) {
        const release = Math.min(.03, duration * .2);
        gain.gain.linearRampToValueAtTime(.18, time + Math.min(.02, duration * .2));
        gain.gain.setValueAtTime(.18, time + duration - release);
        gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
      } else gain.gain.exponentialRampToValueAtTime(.0001, time + duration * .85);
      oscillator.stop(time + duration * gate);
    } else {
      gain.gain.exponentialRampToValueAtTime(.12, time + HOLD_THRESHOLD_MS / 1000);
      gain.gain.exponentialRampToValueAtTime(.0001, time + TAP_DECAY_SECONDS);
    }
    return voice;
  }, []);

  const runTimeline = useCallback(async (build: () => AudioTimeline, id: string | null, strict = true) => {
    stopAudio();
    const request = playbackRequest.current;
    setPlaying(id);
    setAudioError('');
    try {
      const requested = build();
      // Freeze the accepted values before awaiting a sampler or resumed context.
      const timeline = { totalDuration: requested.totalDuration, events: requested.events.map(event => ({ ...event })) };
      if (
        !Number.isFinite(timeline.totalDuration) || timeline.totalDuration < 0 ||
        (strict && (timeline.totalDuration > 3600 || timeline.events.length > 4096)) ||
        timeline.events.some(event =>
          !Number.isFinite(event.time) || !Number.isFinite(event.duration) ||
          event.time < 0 || event.duration <= 0 ||
          event.time + event.duration > timeline.totalDuration + 1e-8 ||
          !Number.isFinite(event.midi) ||
          (strict && (!Number.isInteger(event.midi) || event.midi < 0 || event.midi > 127)),
        )
      ) throw new Error('Invalid audio timeline.');
      const { context, output, instrument } = await getAudio();
      if (request !== playbackRequest.current || context.state === 'closed') return;
      const schedule = (at: number, callback: () => void) => {
        // Background timers may be delayed, or the OS may pause the audio
        // clock. Keep the controls and highlights tied to actual playback.
        const checkTime = () => {
          playbackTimers.current.delete(timer);
          if (request !== playbackRequest.current || context.state === 'closed') return;
          const remaining = (at - context.currentTime) * 1000;
          if (remaining > 5) {
            timer = setTimeout(checkTime, Math.max(50, remaining));
            playbackTimers.current.add(timer);
          } else callback();
        };
        let timer = setTimeout(checkTime, Math.max(0, (at - context.currentTime) * 1000));
        playbackTimers.current.add(timer);
      };
      const highlight = (pitches: readonly number[], at: number, adding: boolean) => {
        schedule(at, () => {
          for (const pitch of pitches) {
            const count = (sequenceNotes.current.get(pitch) ?? 0) + (adding ? 1 : -1);
            if (count > 0) sequenceNotes.current.set(pitch, count); else sequenceNotes.current.delete(pitch);
          }
          updatePressedNotes();
        });
      };
      const start = context.currentTime + .03;
      const { events, totalDuration } = timeline;
      events.forEach(({ midi, time, duration, sustain }) => {
        sequenceVoices.current.add(createVoice(context, output, instrument, midi, start + time, duration, { sustain }));
        highlight([midi], start + time, true);
        highlight([midi], start + time + duration * (sustain ? 1 : .9), false);
      });
      const time = start + totalDuration;
      schedule(time, () => {
        sequenceNotes.current.clear();
        updatePressedNotes();
        setPlaying(null);
      });
    } catch (error) {
      if (request !== playbackRequest.current) return;
      stopAudio();
      setAudioError(error instanceof PianoSoundError ? error.message : 'Audio could not start. You can still enter and submit notes.');
    }
  }, [createVoice, getAudio, stopAudio, updatePressedNotes]);
  const playTimeline = useCallback((timeline: AudioTimeline, id: string | null) => runTimeline(() => timeline, id), [runTimeline]);
  const playArrangement = useCallback((parts: readonly (readonly PlayableStep[])[], id: string | null, bpm = defaultBpm) => {
    if (!parts.some(part => part.length)) { stopAudio(); return Promise.resolve(); }
    return runTimeline(() => {
      const legacy = arrangementTimeline(parts, bpm);
      return {
        totalDuration: legacy.totalDuration,
        events: legacy.events.flatMap(event => event.pitches.map(midi => ({ midi, time: event.time, duration: event.duration }))),
      };
    }, id, false);
  }, [runTimeline, defaultBpm, stopAudio]);

  const playMelody = useCallback((melody: readonly PlayableStep[], id: string | null, bpm = defaultBpm) => playArrangement([melody], id, bpm), [playArrangement, defaultBpm]);

  const playNotes = useCallback((
    notes: readonly number[], id: string | null, rhythm: readonly Pick<MelodyStep, 'midi' | 'beats' | 'triplet'>[] = defaultMelody,
  ) => playMelody(melodyForGuess(notes, rhythm), id), [playMelody, defaultMelody]);

  const startNote = useCallback(async (midi: number, source: string) => {
    if (heldNotes.current.has(source)) return;
    stopSequence();
    const generation = audioGeneration.current;
    const held: HeldNote = { midi, pressedAt: performance.now() };
    heldNotes.current.set(source, held);
    updatePressedNotes();
    setAudioError('');
    try {
      const { context, output, instrument } = await getAudio();
      // A quick tap still plays if it was released while audio was resuming.
      if (generation !== audioGeneration.current || held.cancelled || context.state === 'closed') return;
      if (held.releasedAt !== undefined && held.releasedAt - held.pressedAt >= HOLD_THRESHOLD_MS) return;
      const time = context.currentTime;
      const voice = createVoice(context, output, instrument, midi, time);
      held.voice = voice;
      if (held.releasedAt !== undefined) {
        voice.tap();
        return;
      }
      held.holdTimer = setTimeout(() => {
        held.holdTimer = undefined;
        if (heldNotes.current.get(source) !== held || context.state === 'closed') return;
        voice.sustain();
      }, HOLD_THRESHOLD_MS);
    } catch (error) {
      if (generation !== audioGeneration.current || held.cancelled) return;
      if (heldNotes.current.get(source) === held) {
        heldNotes.current.delete(source);
        updatePressedNotes();
      }
      setAudioError(error instanceof PianoSoundError ? error.message : 'Audio could not start. You can still enter and submit notes.');
    }
  }, [createVoice, getAudio, stopSequence, updatePressedNotes]);

  const releaseNote = useCallback((source: string, cancelled = false) => {
    const held = heldNotes.current.get(source);
    if (!held) return;
    held.releasedAt = performance.now();
    held.cancelled = cancelled;
    if (held.holdTimer !== undefined) clearTimeout(held.holdTimer);
    heldNotes.current.delete(source);
    updatePressedNotes();
    const context = audioContext.current;
    if (!held.voice || !context || context.state === 'closed') return;
    if (!cancelled && held.releasedAt - held.pressedAt < HOLD_THRESHOLD_MS) {
      held.voice.tap();
      return;
    }
    held.voice.release();
  }, [updatePressedNotes]);

  const releaseHeldNotes = useCallback(() => {
    // Losing focus can swallow key/pointer releases. Cancel just those notes;
    // scheduled melodies should keep playing when another tab or app opens.
    for (const source of heldNotes.current.keys()) releaseNote(source, true);
  }, [releaseNote]);

  const setVolume = useCallback((value: number) => {
    const next = Math.min(100, Math.max(0, value));
    volumeLevel.current = next / 100;
    setVolumeState(next);
    const context = audioContext.current;
    if (masterGain.current && context && context.state !== 'closed') {
      masterGain.current.gain.setTargetAtTime(volumeLevel.current, context.currentTime, .015);
    }
  }, []);

  const setSound = useCallback((choice: PianoSound) => {
    if ((fixedSound && choice !== fixedSound) || choice === selectedSound.current) return;
    stopAudio();
    selectedSound.current = choice;
    setSoundState(choice);
    if (choice !== 'synth') unavailableSounds.current.delete(choice);
    setUsingSynthFallback(false);
    setAudioError('');
    setSoundStatus(choice === 'synth' || instruments.current.get(choice)?.ready ? 'ready' : 'loading');
  }, [stopAudio, fixedSound]);

  useEffect(() => {
    if (fixedSound && selectedSound.current !== fixedSound) setSound(fixedSound);
  }, [fixedSound, setSound]);

  const retrySound = useCallback(() => {
    const choice = selectedSound.current;
    if (choice === 'synth') return;
    unavailableSounds.current.delete(choice);
    setUsingSynthFallback(false);
    setAudioError('');
    try {
      const { context, output } = ensureAudio();
      void getInstrument(context, output, choice).catch(() => {});
    } catch {
      setSoundStatus('error');
      setAudioError('Audio could not start. You can still enter and submit notes.');
    }
  }, [ensureAudio, getInstrument]);

  useEffect(() => {
    // Defer preload so React's development cleanup does not duplicate downloads.
    if (sound === 'synth') return;
    const timer = setTimeout(retrySound, 0);
    return () => clearTimeout(timer);
  }, [sound, retrySound]);

  useEffect(() => {
    const loadedInstruments = instruments.current;
    // Advancing the edited note can disable the held key before its local
    // release handler runs. Capture releases outside the piano buttons too.
    const handlePointerRelease = (event: PointerEvent) => {
      releaseNote(`pointer-${event.pointerId}`, event.type === 'pointercancel');
    };
    const handleKeyRelease = (event: KeyboardEvent) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      for (const source of heldNotes.current.keys()) {
        if (source.startsWith('keyboard-') && source.endsWith(`-${event.key}`)) releaseNote(source);
      }
    };
    const resumePlayback = () => {
      const context = audioContext.current;
      if (document.hidden || !sequenceVoices.current.size || !context || context.state === 'running' || context.state === 'closed') return;
      void context.resume().catch(() => {
        if (audioContext.current === context && sequenceVoices.current.size) {
          setAudioError('Your browser paused audio. Stop and play again to resume.');
        }
      });
    };
    const handleVisibility = () => {
      if (document.hidden) releaseHeldNotes();
      else resumePlayback();
    };
    window.addEventListener('blur', releaseHeldNotes);
    window.addEventListener('focus', resumePlayback);
    window.addEventListener('pointerup', handlePointerRelease, true);
    window.addEventListener('pointercancel', handlePointerRelease, true);
    window.addEventListener('keyup', handleKeyRelease, true);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('blur', releaseHeldNotes);
      window.removeEventListener('focus', resumePlayback);
      window.removeEventListener('pointerup', handlePointerRelease, true);
      window.removeEventListener('pointercancel', handlePointerRelease, true);
      window.removeEventListener('keyup', handleKeyRelease, true);
      document.removeEventListener('visibilitychange', handleVisibility);
      stopAudio();
      loadedInstruments.forEach(({ instance }) => instance?.dispose());
      loadedInstruments.clear();
      const context = audioContext.current;
      audioContext.current = null;
      masterGain.current = null;
      reverbImpulse.current = null;
      if (context && context.state !== 'closed') void context.close();
    };
  }, [stopAudio, releaseNote, releaseHeldNotes]);

  return { sound, setSound, soundStatus, soundProgress, usingSynthFallback, retrySound, volume, setVolume, reverb, setReverb,
    playing, audioError, setAudioError, pressedNotes, playNotes, playMelody, playArrangement, playTimeline, startNote, releaseNote, stopAudio };
}
