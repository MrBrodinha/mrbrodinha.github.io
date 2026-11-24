// Pitched clefs supported by this experimental editor. MIDI never transposes.
export const CLEFS = {
  treble: { label: 'Treble', bottomMidi: 64, minimum: 53 },
  bass: { label: 'Bass', bottomMidi: 43, minimum: 29 },
  alto: { label: 'Alto', bottomMidi: 53, minimum: 43 },
  tenor: { label: 'Tenor', bottomMidi: 50, minimum: 40 },
} as const;
export type Clef = keyof typeof CLEFS;
export const isClef = (value: unknown): value is Clef =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(CLEFS, value);
