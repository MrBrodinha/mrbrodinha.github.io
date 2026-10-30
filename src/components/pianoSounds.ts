import type { LoadProgress, Smplr } from 'smplr';

export const PIANO_SOUNDS = {
  grand: 'Grand piano',
  electric: 'Electric piano',
  synth: 'Synth',
} as const;

export type PianoSound = keyof typeof PIANO_SOUNDS;
export type SampledPianoSound = Exclude<PianoSound, 'synth'>;

export async function createSampledPiano(
  context: AudioContext,
  output: GainNode,
  sound: SampledPianoSound,
  onLoadProgress: (progress: LoadProgress) => void,
): Promise<Smplr> {
  const { SplendidGrandPiano, ElectricPiano, SampleLoader } = await import('smplr');
  if (context.state === 'closed') throw new Error('Audio context closed.');

  const baseLoader = SampleLoader(context);
  const loader: Smplr['loader'] = {
    async load(preset, options) {
      const buffers = typeof options === 'function'
        ? await baseLoader.load(preset, options)
        : await baseLoader.load(preset, options);
      const expected = new Set(preset.groups.flatMap((group) => group.regions.map((region) => region.sample)));
      // smplr otherwise silently skips samples that failed to download/decode.
      if (!buffers.size || buffers.size !== expected.size) throw new Error('Some piano samples could not load.');
      return buffers;
    },
  };
  const options = {
    destination: output,
    volume: 100,
    velocity: 80,
    loader,
    onLoadProgress,
    notesToLoad: {
      notes: Array.from({ length: 37 }, (_, index) => 48 + index),
      velocityRange: [80, 80] as [number, number],
      fallback: 'nearest' as const,
    },
  };
  return sound === 'grand'
    ? SplendidGrandPiano(context, { ...options, decayTime: .1 })
    : ElectricPiano(context, { ...options, instrument: 'WurlitzerEP200' });
}
