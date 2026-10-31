import BrodleIcon from './BrodleIcon';
import { PIANO_SOUNDS } from './pianoSounds';
import type { PianoSound } from './pianoSounds';
import type { NoteNaming } from './musicGame';
import type { usePianoAudio } from './usePianoAudio';

type Props = { audio: ReturnType<typeof usePianoAudio>; naming: NoteNaming; onNaming: (value: NoteNaming) => void };

export default function PianoControls({ audio, naming, onNaming }: Props) {
  return <>
    <div className="piano-toolbar">
      <div className="note-naming-control" role="group" aria-label="Note names">
        <button type="button" aria-label="Use A–G note names" aria-pressed={naming === 'letters'} onClick={() => onNaming('letters')}>A–G</button>
        <button type="button" aria-label="Use Dó–Si note names" aria-pressed={naming === 'solfege'} onClick={() => onNaming('solfege')}>Dó–Si</button>
      </div>
      <div className="piano-sound">
        <label htmlFor="piano-sound">Instrument</label>
        <select id="piano-sound" value={audio.sound} onChange={(event) => audio.setSound(event.currentTarget.value as PianoSound)}>
          {Object.entries(PIANO_SOUNDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <div className="piano-volume">
        <label htmlFor="piano-volume" title="Volume"><BrodleIcon name="volume" size={17} /><span className="sr-only">Volume</span></label>
        <input id="piano-volume" type="range" min="0" max="100" step="1" value={audio.volume}
          aria-valuetext={audio.volume + '%'} onChange={(event) => audio.setVolume(Number(event.currentTarget.value))} />
        <output htmlFor="piano-volume">{audio.volume}%</output>
      </div>
    </div>
    {audio.soundStatus === 'loading' && <div className="sound-status" role="status">
      <span>Loading {PIANO_SOUNDS[audio.sound]}… {audio.soundProgress}%</span>
      <progress value={audio.soundProgress} max="100" aria-label={'Loading ' + PIANO_SOUNDS[audio.sound]} />
    </div>}
    {audio.soundStatus === 'error' && <div className="sound-status sound-error" role="alert">
      <span>This sound couldn’t load. Try again or choose Synth.</span>
      <button type="button" className="brodle-button" onClick={audio.retrySound}>Retry sound</button>
    </div>}
  </>;
}
