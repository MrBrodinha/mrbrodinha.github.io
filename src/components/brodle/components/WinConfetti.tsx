import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

const colors = ['#15803d', '#9333ea', '#facc15', '#2563eb', '#ec4899', '#fb923c'];
const pieces = Array.from({ length: 180 }, (_, index) => ({
  left: `${(index * 37 + 11) % 100}%`,
  backgroundColor: colors[index % colors.length],
  animationDelay: `${(index * 53) % 650}ms`,
  animationDuration: `${2600 + (index * 71) % 800}ms`,
  '--confetti-drift': `${(index * 47) % 240 - 120}px`,
  '--confetti-turn': `${index % 2 === 0 ? 720 : -720}deg`,
} as CSSProperties));

function WinConfetti({ variant }: { variant: 'melody' | 'exact' }) {
  const [visible, setVisible] = useState(false);
  const exact = variant === 'exact';

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), exact ? 6400 : 4200);
    return () => clearTimeout(timer);
  }, [exact]);

  if (!visible) return null;

  return (
    <div className={'win-confetti' + (exact ? ' win-confetti-exact' : '')} aria-hidden="true">
      {pieces.slice(0, exact ? 180 : 72).map((style, index) => (
        <span className="confetti-piece" key={index} style={exact ? {
          ...style,
          animationDelay: `${(index * 53) % 1800}ms`,
          animationDuration: `${3400 + (index * 71) % 1100}ms`,
        } : style} />
      ))}
    </div>
  );
}

export default WinConfetti;
