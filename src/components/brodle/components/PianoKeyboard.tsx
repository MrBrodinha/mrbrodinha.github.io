import { useEffect, useRef } from 'react';
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
  onNote: (midi: number) => void;
};

export default function PianoKeyboard({ minMidi = PIANO_MIN_MIDI, maxMidi = PIANO_MAX_MIDI, chordNotes, highlightedNotes, naming, onNote, playing, pressedNotes, startNote, releaseNote, playNotes }: Props) {
  const { whiteKeys, blackKeys } = keyboardKeys(minMidi, maxMidi);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const midi = playing && pressedNotes.size ? pressedNotes.values().next().value : highlightedNotes?.[0];
    if (midi === undefined) return;
    const area = scroll.current;
    const key = area?.querySelector<HTMLButtonElement>('[data-midi="' + midi + '"]');
    if (!area || !key) return;
    const bounds = area.getBoundingClientRect();
    const note = key.getBoundingClientRect();
    if (note.left < bounds.left + 8) area.scrollLeft += note.left - bounds.left - 8;
    else if (note.right > bounds.right - 8) area.scrollLeft += note.right - bounds.right + 8;
  }, [playing, pressedNotes, highlightedNotes]);

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
      <div className="piano-keyboard" style={{ minWidth: Math.max(968, whiteKeys.length * 44) }}>
        {whiteKeys.map(({ midi }) => (
          <button key={midi} type="button" data-midi={midi} className={'piano-key piano-white' + (pressedNotes.has(midi) ? ' is-held' : '') + (chordNotes?.includes(midi) ? ' is-chord-note' : '') + (highlightedNotes?.includes(midi) ? ' is-selected-note' : '')}
            aria-pressed={chordNotes ? chordNotes.includes(midi) : highlightedNotes?.includes(midi)} aria-label={(chordNotes ? 'Select ' : 'Play ') + noteName(midi, naming)} {...handlers(midi)}><span className="key-label">{noteName(midi, naming)}</span></button>
        ))}
        {blackKeys.map(({ midi, position }) => (
          <button key={midi} type="button" data-midi={midi} className={'piano-key piano-black' + (pressedNotes.has(midi) ? ' is-held' : '') + (chordNotes?.includes(midi) ? ' is-chord-note' : '') + (highlightedNotes?.includes(midi) ? ' is-selected-note' : '')}
            style={{ left: position / whiteKeys.length * 100 + '%', width: 60 / whiteKeys.length + '%' }}
            aria-pressed={chordNotes ? chordNotes.includes(midi) : highlightedNotes?.includes(midi)} aria-label={(chordNotes ? 'Select ' : 'Play ') + noteName(midi, naming)} {...handlers(midi)}><span className="key-label">{noteName(midi, naming)}</span></button>
        ))}
      </div>
    </div>
  );
}
