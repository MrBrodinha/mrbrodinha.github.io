import { useState } from 'react';
import PianoControls from '../../brodle/components/PianoControls';
import PianoKeyboard from '../../brodle/components/PianoKeyboard';
import type { NoteNaming } from '../../brodle/lib/musicGame';
import type { usePianoAudio } from '../../brodle/hooks/usePianoAudio';

type Props = {
  audio: ReturnType<typeof usePianoAudio>;
  locked: boolean;
  mode: 'place' | 'edit';
  selectedPitches: readonly number[];
  onNote: (midi: number) => void;
};
export default function StudioPiano({ audio, locked, mode, selectedPitches, onNote }: Props) {
  const [open, setOpen] = useState(false);
  const [freePlay, setFreePlay] = useState(false);
  const [naming, setNaming] = useState<NoteNaming>('letters');
  const auditionOnly = freePlay || locked;
  return <details className="studio-support studio-piano" open={open} onToggle={event => {
    const next = event.currentTarget.open;
    if (next === open) return;
    if (!next) audio.stopAudio();
    setOpen(next);
  }}>
    <summary>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M8 13v7m8-7v7M6 4v8h4V4m4 0v8h4V4" /></svg>
      <span>Piano</span>
    </summary>
    {open && <div className="studio-support-body">
      <PianoControls allowInstrumentChange={false} audio={audio} naming={naming} onNaming={setNaming}
        freePlay={{ enabled: freePlay, description: 'Try piano notes without changing your melody.', onToggle: () => { audio.stopAudio(); setFreePlay(value => !value); } }} />
      <p id="piano-mode-status" className="studio-piano-status" role="status">{auditionOnly
        ? locked ? 'Editing is locked. Piano keys play without changing the melody.' : 'Free play · Your melody stays unchanged.'
        : mode === 'place' ? 'Piano keys write notes at the current position using the selected duration.' : 'Select one note or rest on the sheet, then use a piano key to replace its pitch.'}</p>
      <PianoKeyboard {...audio} octaveNavigation naming={naming} highlightedNotes={auditionOnly ? undefined : selectedPitches}
        onNote={midi => { if (!auditionOnly) onNote(midi); }} />
      <p className="studio-piano-help">Hold a key to sustain. Use Space or Enter on a focused key.</p>
    </div>}
  </details>;
}
