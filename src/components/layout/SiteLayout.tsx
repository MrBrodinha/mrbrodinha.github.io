import type { MouseEvent, ReactNode } from 'react';
import { useCallback, useEffect, useId, useState } from 'react';
import { useLocation } from 'react-router-dom';
import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';
import { BEFORE_SITE_NAVIGATION } from './navigation';
import { HOME_BACKGROUNDS } from '../home/homeBackgrounds';
import BrodleSideMenu from '../brodle/components/BrodleSideMenu';
import './SiteLayout.css';

export default function SiteLayout({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  const home = pathname === '/';
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    document.getElementById(menuId + '-toggle')?.focus({ preventScroll: true });
  }, [menuId]);
  useEffect(() => { setMenuOpen(false); }, [pathname, search]);
  const [homeBackground] = useState(() => HOME_BACKGROUNDS[Math.floor(Math.random() * HOME_BACKGROUNDS.length)]);
  const brodle = pathname === '/brodle' || pathname.startsWith('/brodle/');
  const mvg = /^\/mvg\/?$/i.test(pathname);
  const light = mvg || pathname.startsWith('/redbull');
  function beforeNavigation(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
    const destination = new URL(link.href, window.location.href);
    if (destination.origin !== window.location.origin || destination.pathname + destination.search === window.location.pathname + window.location.search) return;
    if (!window.dispatchEvent(new Event(BEFORE_SITE_NAVIGATION, { cancelable: true }))) event.preventDefault();
  }
  const page = <div className={'principal site-layout' + (light ? ' site-layout-light' : '') + (home ? ' site-layout-home' : '')} style={home ? { background: homeBackground } : undefined} onClickCapture={brodle ? undefined : beforeNavigation}>
    {!mvg && <SiteHeader home={home} light={light} brodle={brodle} brodleMenu={{ menuId, menuOpen, onToggleMenu: () => setMenuOpen((previous) => !previous) }} />}
    <div className="site-content">{children}</div>
    {!mvg && <SiteFooter brodle={brodle} />}
  </div>;
  return brodle ? <div className={'brodle-site-shell' + (menuOpen ? ' is-menu-open' : '')} onClickCapture={beforeNavigation}>
    <BrodleSideMenu id={menuId} open={menuOpen} onClose={closeMenu} />
    {page}
  </div> : page;
}
