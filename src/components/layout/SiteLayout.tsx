import type { MouseEvent, ReactNode } from 'react';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import { BEFORE_SITE_NAVIGATION } from './navigation';
import { HOME_BACKGROUNDS } from '../home/homeBackgrounds';
import './SiteLayout.css';

export default function SiteLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const home = pathname === '/';
  const [homeBackground] = useState(() => HOME_BACKGROUNDS[Math.floor(Math.random() * HOME_BACKGROUNDS.length)]);
  const brodle = pathname === '/brodle' || pathname.startsWith('/brodle/');
  const light = pathname === '/mvg' || pathname.startsWith('/redbull');
  function beforeNavigation(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
    const destination = new URL(link.href, window.location.href);
    if (destination.origin !== window.location.origin || destination.pathname + destination.search === window.location.pathname + window.location.search) return;
    if (!window.dispatchEvent(new Event(BEFORE_SITE_NAVIGATION, { cancelable: true }))) event.preventDefault();
  }
  return <div className={'principal site-layout' + (light ? ' site-layout-light' : '') + (home ? ' site-layout-home' : '')} style={home ? { background: homeBackground } : undefined} onClickCapture={beforeNavigation}>
    <SiteHeader home={home} light={light} brodle={brodle} />
    <div className="site-content">{children}</div>
    <SiteFooter brodle={brodle} />
  </div>;
}
