import { MUSICAL_KEYS, TIME_SIGNATURES, PIANO_MIN_MIDI, PIANO_MAX_MIDI } from '../lib/musicGame';
import type { MusicalKey, TimeSignature } from '../lib/musicGame';
import { restoreVictoryNotes } from '../lib/victoryMusic';
import type { ComposerDraft } from './melodyComposer';

// Read the exported constants as data. Never evaluate user-supplied JavaScript.
class LiteralReader {
  position = 0;
  constructor(readonly text: string) {}
  fail(message: string): never {
    const line = this.text.slice(0, this.position).split('\n').length;
    throw new Error(`${message} (line ${line}).`);
  }
  space() {
    const match = this.text.slice(this.position).match(/^(?:\s|\/\/[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*/)!;
    this.position += match[0].length;
  }
  take(token: string) {
    this.space();
    if (!this.text.startsWith(token, this.position)) return false;
    this.position += token.length;
    return true;
  }
  literal(depth = 0): unknown {
    this.space();
    if (depth > 8) this.fail('The data is nested too deeply');
    if (this.take('[')) {
      const array: unknown[] = [];
      while (!this.take(']')) {
        if (array.length >= 512) this.fail('Use at most 512 entries per part');
        array.push(this.literal(depth + 1));
        if (!this.take(',')) { if (!this.take(']')) this.fail('Expected a comma or ]'); else return array; }
      }
      return array;
    }
    if (this.take('{')) {
      const object: Record<string, unknown> = Object.create(null);
      while (!this.take('}')) {
        this.space();
        const key = this.text.slice(this.position).match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0];
        const name = key ?? this.literal(depth + 1);
        if (key) this.position += key.length;
        if (typeof name !== 'string' || !['midi', 'beats', 'pitches', 'length', 'rhythm'].includes(name)) this.fail('Unknown note field');
        if (Object.prototype.hasOwnProperty.call(object, name)) this.fail(`Duplicate ${name} field`);
        if (!this.take(':')) this.fail('Expected : after the field name');
        object[name] = this.literal(depth + 1);
        if (!this.take(',')) { if (!this.take('}')) this.fail('Expected a comma or }'); else return object; }
      }
      return object;
    }
    const quote = this.text[this.position];
    if (quote === "'" || quote === '"') {
      this.position++;
      let value = '';
      while (this.position < this.text.length) {
        const character = this.text[this.position++];
        if (character === quote) return value;
        if (character === '\n' || character === '\r') this.fail('Close the string before the end of the line');
        if (character !== '\\') { value += character; continue; }
        const escape = this.text[this.position++];
        const escapes: Record<string, string> = { n: '\n', r: '\r', t: '\t', '\\': '\\', "'": "'", '"': '"' };
        if (!Object.prototype.hasOwnProperty.call(escapes, escape)) this.fail('Unsupported string escape');
        value += escapes[escape];
      }
      this.fail('Unclosed string');
    }
    const number = this.text.slice(this.position).match(/^-?(?:\d+(?:\.\d+)?|\.\d+)\b/)?.[0];
    if (number) { this.position += number.length; return Number(number); }
    if (this.take('null')) return null;
    return this.fail('Use literal numbers, strings, arrays, objects, or null');
  }
}

export function parseMelodyCode(code: string): Omit<ComposerDraft, 'title' | 'source' | 'hint'> {
  if (code.length > 250_000) throw new Error('The code is too long. Use up to 256 challenge steps and 512 steps per victory part.');
  const reader = new LiteralReader(code);
  const constants: Record<string, unknown> = Object.create(null);
  const allowed = ['BPM', 'KEY', 'FINAL_BPM', 'FINAL_KEY', 'TIME_SIGNATURE', 'MELODY', 'MELODY_FINAL', 'MELODY_FINAL_BASS', 'FINAL_CLEF', 'FINAL_BASS_CLEF'];
  reader.space();
  while (reader.position < code.length) {
    const declaration = code.slice(reader.position).match(/^(?:export\s+)?const\s+([A-Z_]+)\s*(?::[A-Za-z0-9_\s[\]{}()?;|&:'"-]*)?=/) ?? reader.fail('Expected one of the exported melody constants');
    if (!allowed.includes(declaration[1])) reader.fail('Expected one of the exported melody constants');
    const name = declaration[1];
    if (Object.prototype.hasOwnProperty.call(constants, name)) reader.fail(`Duplicate ${name}`);
    reader.position += declaration[0].length;
    constants[name] = reader.literal();
    reader.take(';');
    reader.space();
  }
  for (const required of ['BPM', 'KEY', 'TIME_SIGNATURE', 'MELODY']) {
    if (!Object.prototype.hasOwnProperty.call(constants, required)) throw new Error(`Missing ${required}. Keep all four required constants.`);
  }
  if (!Number.isInteger(constants.BPM) || Number(constants.BPM) < 20 || Number(constants.BPM) > 400) throw new Error('BPM must be an integer from 20 to 400.');
  if (!MUSICAL_KEYS.includes(constants.KEY as MusicalKey)) throw new Error('Choose a supported KEY, such as C, F, or Am.');
  if (constants.FINAL_BPM !== undefined && (!Number.isInteger(constants.FINAL_BPM) || Number(constants.FINAL_BPM) < 20 || Number(constants.FINAL_BPM) > 400)) throw new Error('FINAL_BPM must be an integer from 20 to 400.');
  if (constants.FINAL_KEY !== undefined && !MUSICAL_KEYS.includes(constants.FINAL_KEY as MusicalKey)) throw new Error('Choose a supported FINAL_KEY, such as C, F, or Am.');
  if (!TIME_SIGNATURES.includes(constants.TIME_SIGNATURE as TimeSignature)) throw new Error('Choose a supported TIME_SIGNATURE, such as 4/4 or 6/8.');
  const part = (name: string, limit: number, challenge = false) => {
    try {
      const notes = restoreVictoryNotes(Object.prototype.hasOwnProperty.call(constants, name) ? constants[name] : [], limit);
      if (challenge && notes.some((step) => step.pitches)) throw new Error();
      return notes;
    } catch { throw new Error(`${name}: use up to ${limit} entries with midi ${PIANO_MIN_MIDI}–${PIANO_MAX_MIDI} or null, and supported beats (.125, .1875, .25, .375, .5, .75, 1, 1.5, 2, 3, 4, 6).${challenge ? ' Chords are only allowed in victory parts.' : ' Chord pitches must contain 2–8 ascending, unique notes; midi must equal the first pitch.'}`); }
  };
  for (const name of ['FINAL_CLEF', 'FINAL_BASS_CLEF']) {
    if (constants[name] !== undefined && constants[name] !== 'treble' && constants[name] !== 'bass') throw new Error(`${name} must be 'treble' or 'bass'.`);
  }
  return {
    bpm: Number(constants.BPM), key: constants.KEY as MusicalKey, timeSignature: constants.TIME_SIGNATURE as TimeSignature,
    ...(constants.FINAL_BPM !== undefined ? { finalBpm: Number(constants.FINAL_BPM) } : {}),
    ...(constants.FINAL_KEY !== undefined ? { finalKey: constants.FINAL_KEY as MusicalKey } : {}),
    melody: part('MELODY', 256, true), finalMelody: part('MELODY_FINAL', 512), finalBass: part('MELODY_FINAL_BASS', 512),
    finalClef: (constants.FINAL_CLEF ?? 'treble') as 'treble' | 'bass', finalBassClef: (constants.FINAL_BASS_CLEF ?? 'bass') as 'treble' | 'bass',
  };
}
