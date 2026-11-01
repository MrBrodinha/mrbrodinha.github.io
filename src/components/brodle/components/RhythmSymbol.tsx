import type { DurationId } from '../creator/melodyComposer';

type Props = { duration: DurationId; rest?: boolean; dotted?: boolean };

function RhythmGlyph({ duration, rest = false, dotted = false }: Props) {
  return <>
    {rest ? <g data-symbol="rest" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {duration === 'whole' && <><path d="M-8 -7.75H8" /><rect x="-6" y="-7.75" width="12" height="4" stroke="none" /></>}
      {duration === 'half' && <><path d="M-8 0H8" /><rect x="-6" y="-4" width="12" height="4" stroke="none" /></>}
      {duration === 'quarter' && <path d="m-2 -14 6 7-7 7 5 5c-8-4-11 3-5 7" fill="none" strokeWidth="2.6" />}
      {(duration === 'eighth' || duration === 'sixteenth' || duration === 'thirty-second') && <><path d="m5 -12-7 24M-5 -7c4 4 7 2 9-1" fill="none" /><circle cx="-5" cy="-7" r="2.5" stroke="none" />
        {(duration === 'sixteenth' || duration === 'thirty-second') && <><path d="M-7 1c4 4 7 2 9-1" fill="none" /><circle cx="-7" cy="1" r="2.5" stroke="none" /></>}
        {duration === 'thirty-second' && <><path d="M-9 9c4 4 7 2 9-1" fill="none" /><circle cx="-9" cy="9" r="2.5" stroke="none" /></>}</>}
    </g> : <g data-symbol="note">
      <ellipse cx="0" cy="0" rx={duration === 'whole' ? 6 : 5} ry="3.4" transform="rotate(-20)"
        fill={duration === 'whole' || duration === 'half' ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth="1.5" />
      {duration !== 'whole' && <path d="M4.5 -1V-28" stroke="currentColor" strokeWidth="1.5" />}
      {(duration === 'eighth' || duration === 'sixteenth' || duration === 'thirty-second') && <path d="M4.5 -28c0 7 11 8 6 17" fill="none" stroke="currentColor" strokeWidth="1.8" />}
      {(duration === 'sixteenth' || duration === 'thirty-second') && <path d="M4.5 -20c0 7 11 8 6 17" fill="none" stroke="currentColor" strokeWidth="1.8" />}
      {duration === 'thirty-second' && <path d="M4.5 -12c0 7 11 8 6 17" fill="none" stroke="currentColor" strokeWidth="1.8" />}
    </g>}
    {dotted && <circle data-symbol="dot" cx="12" cy="0" r="2" fill="currentColor" />}
  </>;
}

export default function RhythmSymbol(props: Props) {
  return <svg width="28" height="30" viewBox="-12 -32 34 46" aria-hidden="true"><RhythmGlyph {...props} /></svg>;
}
