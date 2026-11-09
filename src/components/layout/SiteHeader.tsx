import { Link } from 'react-router-dom';
import AccountControls from '../../auth/AccountControls';
import BrodleSiteHeader from '../brodle/components/BrodleSiteHeader';
import type { BrodleSiteHeaderProps } from '../brodle/components/BrodleSiteHeader';

export default function SiteHeader({ home, light, brodle, brodleMenu }: { home: boolean; light: boolean; brodle: boolean; brodleMenu: BrodleSiteHeaderProps }) {
  if (brodle) return <BrodleSiteHeader {...brodleMenu} />;
  return <header className="site-header">
    <div className="site-header-inner">
      {!home && <Link to="/" className="site-home-link"><span aria-hidden="true">←</span>MrBrodinha</Link>}
      <AccountControls theme={light ? 'light' : 'dark'} />
    </div>
  </header>;
}
