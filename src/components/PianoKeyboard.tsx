import { useEffect, useRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { whiteKeys, blackKeys, noteName } from './musicGame';
import type { NoteNaming } from './musicGame';
import type { usePianoAudio } from './usePianoAudio';

type Props = Pick<ReturnType<typeof usePianoAudio>, 'playing' | 'pressedNotes' | 'startNote' | 'releaseNote' | 'playNotes'> & {
  naming: NoteNaming;
  onNote: (midi: number) => void;
};

export default function PianoKeyboard({ naming, onNote, playing, pressedNotes, startNote, releaseNote, playNotes }: Props) {
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!playing || !pressedNotes.size) return;
    const area = scroll.current;
    const midi = pressedNotes.values().next().value;
    const key = area?.querySelector<HTMLButtonElement>('[data-midi="' + midi + '"]');
    if (!area || !key) return;
    const bounds = area.getBoundingClientRect();
    const note = key.getBoundingClientRect();
    if (note.left < bounds.left + 8) area.scrollLeft += note.left - bounds.left - 8;
    else if (note.right > bounds.right - 8) area.scrollLeft += note.right - bounds.right + 8;
  }, [playing, pressedNotes]);

  function handlers(midi: number): ButtonHTMLAttributes<HTMLButtonElement> {
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

  return (
    <div ref={scroll} className="piano-scroll" tabIndex={0} role="region" aria-label="Scrollable piano keyboard">
      <div className="piano-keyboard">
        {whiteKeys.map(({ midi }) => (
          <button key={midi} type="button" data-midi={midi} className={'piano-key piano-white' + (pressedNotes.has(midi) ? ' is-held' : '')}
            aria-label={'Play ' + noteName(midi, naming)} {...handlers(midi)}><span className="key-label">{noteName(midi, naming)}</span></button>
        ))}
        {blackKeys.map(({ midi, position }) => (
          <button key={midi} type="button" data-midi={midi} className={'piano-key piano-black' + (pressedNotes.has(midi) ? ' is-held' : '')}
            style={{ left: position / whiteKeys.length * 100 + '%', width: 60 / whiteKeys.length + '%' }}
            aria-label={'Play ' + noteName(midi, naming)} {...handlers(midi)}><span className="key-label">{noteName(midi, naming)}</span></button>
        ))}
      </div>
    </div>
  );
}
