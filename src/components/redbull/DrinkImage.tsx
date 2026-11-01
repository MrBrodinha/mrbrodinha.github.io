import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { REDBULL_IMAGE_BUCKET } from './redbullData';
import type { RedbullDrink } from './redbullData';

export default function DrinkImage({ drink }: { drink: RedbullDrink }) {
  const container = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(drink.image_url);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false); setUrl(drink.image_url);
    if (!drink.image_path || !supabase || !container.current) return;
    let active = true;
    let objectUrl: string | null = null;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void supabase!.storage.from(REDBULL_IMAGE_BUCKET).download(drink.image_path!).then(({ data, error }) => {
        if (!active) return;
        if (error || !data) { setFailed(true); return; }
        objectUrl = URL.createObjectURL(data); setUrl(objectUrl);
      }).catch(() => { if (active) setFailed(true); });
    }, { rootMargin: '200px' });
    observer.observe(container.current);
    return () => { active = false; observer.disconnect(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [drink.image_path, drink.image_url]);
  return <div ref={container} className="drink-visual">{url && !failed ? <img className="drink-image" src={url} alt={drink.name} loading="lazy" onError={() => setFailed(true)} /> : <span className="drink-image-placeholder">{failed ? 'Image unavailable' : 'Red Bull'}</span>}</div>;
}
