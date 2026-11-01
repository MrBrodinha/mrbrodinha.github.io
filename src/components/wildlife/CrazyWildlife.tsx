import { useEffect } from 'react';

export default function CrazyWildlife() {
  useEffect(() => {
    const previous = document.title;
    document.title = 'Crazy Wildlife · MrBrodinha';
    return () => { document.title = previous; };
  }, []);
  return <main className="wildlife-page"><iframe className="wildlife-player" src="/CrazyWildlife/player.html" title="Crazy Wildlife game" allowFullScreen /></main>;
}
