import { useState } from 'react';
import type { ReactNode } from 'react';
import type { NoteNaming } from '../lib/musicGame';
import { melodyToAbc, keyName } from '../lib/musicGame';
import { recordDraft } from '../lib/melodyLibrary';
import type { MelodyRecord } from '../lib/melodyLibrary';
import type { usePianoAudio } from '../hooks/usePianoAudio';
import { victoryNotation } from '../lib/victoryMusic';
import SheetMusic from '../components/SheetMusic';
import BrodleIcon from '../components/BrodleIcon';

export default function MelodyCard({ row, audio, children, dangerAction, reviewForm, naming = 'letters' }: { naming?: NoteNaming; row: MelodyRecord; audio: ReturnType<typeof usePianoAudio>; children: ReactNode; dangerAction?: ReactNode; reviewForm?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const draft = recordDraft(row);
  const isPlaying = audio.playing === row.id;
  const isEndingPlaying = audio.playing === row.id + ':final';
  return <article className="brodle-panel melody-card" data-melody-id={row.id}>
    <div className="melody-card-header"><div><h2>{row.title || 'Untitled melody'}</h2><p className="melody-author">By {row.author_username}</p></div><span className={'melody-status status-' + row.status}>{row.status === 'rejected' ? 'Returned' : row.status}</span></div>
    <div className="melody-metadata" aria-label="Music settings"><span>{keyName(draft.key, naming)}</span><span>{draft.timeSignature}</span><span>{draft.bpm} BPM</span></div>
    {row.source && <p className="library-muted">{row.source}</p>}
    {row.hint && <p className="library-muted">Hint: {row.hint}</p>}
    <details className="melody-preview" onToggle={(event) => setOpen(event.currentTarget.open)}><summary>View sheet music</summary>
      {open && <SheetMusic abc={melodyToAbc(draft.melody, naming, draft.key, draft.bpm, draft.timeSignature)} musicalKey={draft.key} naming={naming} bpm={draft.bpm} timeSignature={draft.timeSignature} wrap />}
      {open && (draft.finalMelody?.length || draft.finalBass?.length) ? <><p className="library-muted">Victory arrangement</p><SheetMusic abc={victoryNotation(draft.finalMelody?.length ? draft.finalMelody : draft.melody, draft.finalBass ?? [], naming, draft.key, draft.bpm, draft.timeSignature, draft.finalClef, draft.finalBassClef)} musicalKey={draft.key} naming={naming} bpm={draft.bpm} timeSignature={draft.timeSignature} wrap /></> : null}
    </details>
    <div className="melody-playback" role="group" aria-label="Listen to melody"><button type="button" className={'library-button library-button--play' + (isPlaying ? ' is-playing' : '')} aria-label={isPlaying ? 'Stop melody' : 'Play melody'} onClick={() => isPlaying ? audio.stopAudio() : void audio.playMelody(draft.melody, row.id, draft.bpm)}><BrodleIcon name={isPlaying ? 'stop' : 'play'} />{isPlaying ? 'Stop melody' : 'Melody'}</button>
      {draft.finalMelody?.length || draft.finalBass?.length ? <button type="button" className={'library-button library-button--play' + (isEndingPlaying ? ' is-playing' : '')} aria-label={isEndingPlaying ? 'Stop victory melody' : 'Play victory melody'} onClick={() => isEndingPlaying ? audio.stopAudio() : void audio.playArrangement([draft.finalMelody?.length ? draft.finalMelody : draft.melody, draft.finalBass ?? []], row.id + ':final', draft.bpm)}><BrodleIcon name={isEndingPlaying ? 'stop' : 'play'} />{isEndingPlaying ? 'Stop victory' : 'Victory'}</button> : null}
    </div>
    {row.review_note && <p className="review-note">Review: {row.review_note}</p>}
    {reviewForm}
    <footer className="melody-card-footer"><div className="melody-actions">{children}</div>{dangerAction && <div className="melody-danger-action">{dangerAction}</div>}</footer>
  </article>;
}
