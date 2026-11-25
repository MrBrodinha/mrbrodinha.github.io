import BrodleIcon from './BrodleIcon';
import { PIANO_SOUNDS } from '../lib/pianoSounds';
import type { PianoSound } from '../lib/pianoSounds';
import type { NoteNaming } from '../lib/musicGame';
import type { usePianoAudio } from '../hooks/usePianoAudio';
import { useId } from 'react';

type Props = {
  audio: ReturnType<typeof usePianoAudio>;
  naming: NoteNaming;
  onNaming: (value: NoteNaming) => void;
  freePlay?: { enabled: boolean; onToggle: () => void; description?: string };
  compact?: boolean;
  allowInstrumentChange?: boolean;
};

export default function PianoControls({ audio, naming, onNaming, freePlay, compact = false, allowInstrumentChange = true }: Props) {
  const id = useId();
  const namingControl = <div className="note-naming-control" role="group" aria-label="Note names">
    <button type="button" aria-label="Use A–G note names" aria-pressed={naming === 'letters'} onClick={() => onNaming('letters')}>A–G</button>
    <button type="button" aria-label="Use Dó–Si note names" aria-pressed={naming === 'solfege'} onClick={() => onNaming('solfege')}>Dó–Si</button>
  </div>;
  const soundStatus = audio.soundStatus === 'loading' ? <div className="sound-status" role="status">
    <span>Loading {PIANO_SOUNDS[audio.sound]}… {audio.soundProgress}%</span>
    <progress value={audio.soundProgress} max="100" aria-label={'Loading ' + PIANO_SOUNDS[audio.sound]} />
  </div> : audio.soundStatus === 'error' ? <div className="sound-status sound-error" role="alert">
    <span>{audio.usingSynthFallback
      ? `${PIANO_SOUNDS[audio.sound]} couldn’t load. Using Synth so you can keep playing.`
      : allowInstrumentChange ? 'This sound couldn’t load. Try again or choose Synth.' : 'This sound couldn’t load. Try loading Grand piano again.'}</span>
    <button type="button" className="brodle-button" onClick={audio.retrySound}>Retry sound</button>
    {allowInstrumentChange && <button type="button" className="brodle-button" onClick={() => audio.setSound('synth')}>Use Synth</button>}
  </div> : null;
  const settings = <div className="piano-settings-controls">
      {namingControl}
      <div className="piano-sound">
        {allowInstrumentChange ? <><label htmlFor={`${id}-sound`}>Instrument</label>
        <select id={`${id}-sound`} value={audio.sound} onChange={(event) => audio.setSound(event.currentTarget.value as PianoSound)}>
          {Object.entries(PIANO_SOUNDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></> : <><span>Instrument</span><strong>{audio.usingSynthFallback ? 'Synth (backup)' : PIANO_SOUNDS[audio.sound]}</strong></>}
      </div>
      <div className="piano-volume">
        <label htmlFor={`${id}-volume`} title="Volume"><BrodleIcon name="volume" size={17} /><span className="sr-only">Volume</span></label>
        <input id={`${id}-volume`} type="range" min="0" max="100" step="1" value={audio.volume}
          aria-valuetext={audio.volume + '%'} onChange={(event) => audio.setVolume(Number(event.currentTarget.value))} />
        <output htmlFor={`${id}-volume`}>{audio.volume}%</output>
      </div>
    </div>;
  return <>
    <div data-tour="settings" className={'piano-toolbar' + (freePlay ? ' has-free-play' : '') + (compact ? ' is-compact' : '')}>
      {freePlay && <div className="piano-note-controls">
        <button type="button" className="brodle-button piano-free-play" aria-pressed={freePlay.enabled}
          aria-describedby="piano-mode-status" onClick={freePlay.onToggle}
          title={freePlay.description ?? 'Try piano notes without changing your guess.'}>
          <BrodleIcon name={freePlay.enabled ? 'check' : 'music'} />Free play{freePlay.enabled && <span>On</span>}
        </button>
      </div>}
      {settings}
    </div>
    {soundStatus}
  </>;
}
