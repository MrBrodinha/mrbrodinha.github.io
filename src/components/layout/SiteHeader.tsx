import { Link } from 'react-router-dom';
import AccountControls from '../../auth/AccountControls';
import BrodleNavigation from '../brodle/components/BrodleNavigation';

export default function SiteHeader({ home, light, brodle }: { home: boolean; light: boolean; brodle: boolean }) {
  return <header className="site-header">
    <div className="site-header-inner">
      {!home && <Link to="/" className="site-home-link"><span aria-hidden="true">←</span>MrBrodinha</Link>}
      {brodle && <BrodleNavigation />}
      <AccountControls theme={light ? 'light' : 'dark'} />
    </div>
  </header>;
}
