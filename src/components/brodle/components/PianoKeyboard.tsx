import { useEffect, useRef, useState } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { keyboardKeys, noteName, PIANO_MIN_MIDI, PIANO_MAX_MIDI } from '../lib/musicGame';
import type { NoteNaming } from '../lib/musicGame';
import type { usePianoAudio } from '../hooks/usePianoAudio';

type Props = Pick<ReturnType<typeof usePianoAudio>, 'playing' | 'pressedNotes' | 'startNote' | 'releaseNote' | 'playNotes'> & {
  naming: NoteNaming;
  minMidi?: number;
  maxMidi?: number;
  chordNotes?: readonly number[];
  highlightedNotes?: readonly number[];
  availableRange?: { minMidi: number; maxMidi: number };
  fitToWidth?: boolean;
  octaveNavigation?: boolean;
  playbackMode?: boolean;
  onNote: (midi: number) => void;
};

export default function PianoKeyboard({ minMidi = PIANO_MIN_MIDI, maxMidi = PIANO_MAX_MIDI, chordNotes, highlightedNotes, availableRange, fitToWidth = false, octaveNavigation = false, playbackMode = false, naming, onNote, playing, pressedNotes, startNote, releaseNote, playNotes }: Props) {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 700px)').matches);
  const firstOctave = Math.floor(minMidi / 12) * 12;
  const lastOctave = Math.floor(maxMidi / 12) * 12;
  const [octave, setOctave] = useState(() => Math.floor((minMidi + maxMidi) / 24) * 12);
  const oneOctave = octaveNavigation && narrow;
  const activeOctave = Math.max(firstOctave, Math.min(lastOctave, octave));
  const visibleMin = oneOctave ? activeOctave : minMidi;
  const visibleMax = oneOctave ? activeOctave + 11 : maxMidi;
  const { whiteKeys, blackKeys } = keyboardKeys(visibleMin, visibleMax);
  const startsBlack = blackKeys[0]?.midi === visibleMin;
  const endsBlack = blackKeys[blackKeys.length - 1]?.midi === visibleMax;
  const keySlots = whiteKeys.length + Number(startsBlack) / 2 + Number(endsBlack) / 2;
  const scroll = useRef<HTMLDivElement>(null);
  const unavailable = (midi: number) => !playbackMode && (midi < Math.max(PIANO_MIN_MIDI, minMidi)
    || midi > Math.min(PIANO_MAX_MIDI, maxMidi)
    || Boolean(availableRange && (midi < availableRange.minMidi || midi > availableRange.maxMidi)));
  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)');
    const update = () => setNarrow(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const highlightedMidi = highlightedNotes?.[0];
  useEffect(() => {
    if (!oneOctave) return;
    let midi = playing && pressedNotes.size ? pressedNotes.values().next().value : highlightedMidi;
    if (!playing && midi !== undefined && availableRange && availableRange.minMidi <= availableRange.maxMidi) {
      midi = Math.max(availableRange.minMidi, Math.min(availableRange.maxMidi, midi));
    }
    if (midi !== undefined) {
      setOctave(Math.floor(midi / 12) * 12);
    } else if (availableRange && availableRange.minMidi <= availableRange.maxMidi) {
      setOctave((current) => {
        const start = Math.max(firstOctave, Math.min(lastOctave, current));
        if (start + 11 >= availableRange.minMidi && start <= availableRange.maxMidi) return current;
        return Math.floor(Math.max(minMidi, Math.min(maxMidi, availableRange.minMidi)) / 12) * 12;
      });
    }
  }, [oneOctave, playing, pressedNotes, highlightedMidi, availableRange, minMidi, maxMidi, firstOctave, lastOctave]);
  useEffect(() => {
    const centerRange = !playing && highlightedNotes?.length && availableRange
      && availableRange.minMidi <= availableRange.maxMidi
      && (availableRange.minMidi > PIANO_MIN_MIDI || availableRange.maxMidi < PIANO_MAX_MIDI);
    const midi = playing && pressedNotes.size ? pressedNotes.values().next().value
      : centerRange ? Math.round((Math.max(minMidi, availableRange.minMidi) + Math.min(maxMidi, availableRange.maxMidi)) / 2)
      : highlightedNotes?.[0];
    if (midi === undefined) return;
    const area = scroll.current;
    const key = area?.querySelector<HTMLButtonElement>('[data-midi="' + midi + '"]');
    if (!area || !key) return;
    const bounds = area.getBoundingClientRect();
    const note = key.getBoundingClientRect();
    if (centerRange) {
      area.scrollLeft += (note.left + note.right - bounds.left - bounds.right) / 2;
      return;
    }
    if (note.left < bounds.left + 8) area.scrollLeft += note.left - bounds.left - 8;
    else if (note.right > bounds.right - 8) area.scrollLeft += note.right - bounds.right + 8;
  }, [playing, pressedNotes, highlightedNotes, availableRange, minMidi, maxMidi]);

  function handlers(midi: number): ButtonHTMLAttributes<HTMLButtonElement> {
    if (unavailable(midi)) return {};
    return {
      onPointerDown: (event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        void startNote(midi, `pointer-${event.pointerId}`);
        onNote(midi);
      },
      onPointerUp: (event) => releaseNote(`pointer-${event.pointerId}`),
      onPointerCancel: (event) => releaseNote(`pointer-${event.pointerId}`, true),
      onLostPointerCapture: (event) => releaseNote(`pointer-${event.pointerId}`, true),
      onKeyDown: (event) => {
        if (event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault();
        if (event.repeat) return;
        void startNote(midi, `keyboard-${midi}-${event.key}`);
        onNote(midi);
      },
      onKeyUp: (event) => {
        if (event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault();
        releaseNote(`keyboard-${midi}-${event.key}`);
      },
      onBlur: () => {
        releaseNote(`keyboard-${midi}- `, true);
        releaseNote(`keyboard-${midi}-Enter`, true);
      },
      onClick: (event) => {
        if (event.detail !== 0) return;
        void playNotes([midi], null, [{ midi, beats: 1 }]);
        onNote(midi);
      },
    };
  }

  return <>
    {oneOctave && <div className="piano-octaves" role="group" aria-label="Piano octave">
      <button type="button" className="brodle-button" disabled={activeOctave <= firstOctave}
        aria-label={`Previous octave${activeOctave > firstOctave ? ': ' + noteName(activeOctave - 12, naming) + ' to ' + noteName(activeOctave - 1, naming) : ''}`}
        onClick={() => setOctave(activeOctave - 12)}>‹ Lower octave</button>
      <span role="status">{noteName(activeOctave, naming)}–{noteName(activeOctave + 11, naming)}</span>
      <button type="button" className="brodle-button" disabled={activeOctave >= lastOctave}
        aria-label={`Next octave${activeOctave < lastOctave ? ': ' + noteName(activeOctave + 12, naming) + ' to ' + noteName(activeOctave + 23, naming) : ''}`}
        onClick={() => setOctave(activeOctave + 12)}>Higher octave ›</button>
    </div>}
    <div ref={scroll} className="piano-scroll" tabIndex={oneOctave ? undefined : 0} role="region" aria-label={oneOctave ? 'One-octave piano keyboard' : 'Scrollable piano keyboard'}>
      <div className={'piano-keyboard' + (fitToWidth ? ' is-playback' : '')} data-dense={fitToWidth && keySlots > 14}
        style={{ minWidth: fitToWidth || oneOctave ? 0 : keySlots * 44, maxWidth: fitToWidth && !oneOctave ? keySlots * 60 : undefined }}>
        {startsBlack && <span className="piano-edge-space" aria-hidden="true" />}
        {whiteKeys.map(({ midi }) => (
          <button key={midi} type="button" data-midi={midi} disabled={unavailable(midi)} className={'piano-key piano-white' + (pressedNotes.has(midi) ? ' is-held' : '') + (chordNotes?.includes(midi) ? ' is-chord-note' : '') + (highlightedNotes?.includes(midi) ? ' is-selected-note' : '')}
            aria-pressed={chordNotes ? chordNotes.includes(midi) : highlightedNotes?.includes(midi)} aria-label={(chordNotes ? 'Select ' : 'Play ') + noteName(midi, naming)} {...handlers(midi)}><span className="key-label">{noteName(midi, naming)}</span></button>
        ))}
        {endsBlack && <span className="piano-edge-space" aria-hidden="true" />}
        {blackKeys.map(({ midi, position }) => (
          <button key={midi} type="button" data-midi={midi} disabled={unavailable(midi)} className={'piano-key piano-black' + (pressedNotes.has(midi) ? ' is-held' : '') + (chordNotes?.includes(midi) ? ' is-chord-note' : '') + (highlightedNotes?.includes(midi) ? ' is-selected-note' : '')}
            style={{ left: (position + Number(startsBlack) / 2) / keySlots * 100 + '%', width: 60 / keySlots + '%' }}
            aria-pressed={chordNotes ? chordNotes.includes(midi) : highlightedNotes?.includes(midi)} aria-label={(chordNotes ? 'Select ' : 'Play ') + noteName(midi, naming)} {...handlers(midi)}><span className="key-label">{noteName(midi, naming)}</span></button>
        ))}
      </div>
    </div>
  </>;
}
