const paths = {
  music: 'M9 18V5l12-2v13M9 9l12-2M9 18c0 1.7-1.8 3-4 3s-3-1-3-2.5S3.8 16 6 16s3 1 3 2Zm12-2c0 1.7-1.8 3-4 3s-3-1-3-2.5S15.8 14 18 14s3 1 3 2Z',
  play: 'm9 5 11 7-11 7V5Z',
  stop: 'M6 6h12v12H6Z',
  share: 'M12 15V3m-4 4 4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6',
  restart: 'M3 10a9 9 0 1 1 2 8M3 4v6h6',
  undo: 'm9 5-6 6 6 6M3 11h11a6 6 0 0 1 6 6',
  close: 'm6 6 12 12M6 18 18 6',
  check: 'm5 12 4 4L19 6',
  up: 'M12 20V4m-6 6 6-6 6 6',
  down: 'M12 4v16m-6-6 6 6 6-6',
  home: 'm10 5-7 7 7 7M3 12h18',
  volume: 'm11 4-6 4H2v8h3l6 4V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  sparkle: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
} as const;

type BrodleIconProps = { name: keyof typeof paths; size?: number };

function BrodleIcon({ name, size = 16 }: BrodleIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={paths[name]} />
    </svg>
  );
}

export default BrodleIcon;
