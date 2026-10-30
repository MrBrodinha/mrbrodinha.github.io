import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

const colors = ['#15803d', '#9333ea', '#facc15', '#2563eb', '#ec4899', '#fb923c'];
const pieces = Array.from({ length: 72 }, (_, index) => ({
  left: `${(index * 37 + 11) % 100}%`,
  backgroundColor: colors[index % colors.length],
  animationDelay: `${(index * 53) % 650}ms`,
  animationDuration: `${2600 + (index * 71) % 800}ms`,
  '--confetti-drift': `${(index * 47) % 240 - 120}px`,
  '--confetti-turn': `${index % 2 === 0 ? 720 : -720}deg`,
} as CSSProperties));

function WinConfetti() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 4200);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="win-confetti" aria-hidden="true">
      {pieces.map((style, index) => <span className="confetti-piece" key={index} style={style} />)}
    </div>
  );
}

export default WinConfetti;
