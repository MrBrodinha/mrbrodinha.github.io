import { keyAccidentals } from './scoreModel';
import type { Clef } from './scoreModel';
import type { MusicalKey } from '../../brodle/lib/musicGame';

export const propertyPreviewAbc = (clef: Clef, key: MusicalKey = 'C') =>
  `X:1\nM:none\nL:1/4\nK:${key} clef=${clef}\ny4 |\n`;

export function keyDescription(key: MusicalKey) {
  const accidentals = Object.entries(keyAccidentals(key));
  if (!accidentals.length) return 'No accidentals';
  const kind = accidentals[0][1] > 0 ? 'sharp' : 'flat';
  return `${accidentals.length} ${kind}${accidentals.length === 1 ? '' : 's'}: ${accidentals.map(([letter, value]) => letter + (value > 0 ? '♯' : '♭')).join(', ')}`;
}
