import { Link } from 'react-router-dom';
import AccountControls from '../../../auth/AccountControls';
import BrodleIcon from './BrodleIcon';
import '../Brodle.css';
import './BrodleSiteHeader.css';

export type BrodleSiteHeaderProps = { menuId: string; menuOpen: boolean; onToggleMenu: () => void };

export default function BrodleSiteHeader({ menuId, menuOpen, onToggleMenu }: BrodleSiteHeaderProps) {
  return <header className="site-header brodle-site-header">
      <div className="site-header-inner">
        <div className="brodle-header-navigation">
          <button type="button" id={menuId + '-toggle'} className="brodle-button brodle-menu-trigger" aria-expanded={menuOpen} aria-controls={menuId}
            onClick={onToggleMenu}>
            <BrodleIcon name="menu" size={20} /><span>Menu</span>
          </button>
        </div>
        <div className="brodle-site-brand">
          <Link to="/brodle" aria-label="Brodle home"><span className="brodle-mark"><BrodleIcon name="music" size={25} /></span><span>Brodle</span></Link>
          <p>Find the melody. We’ll take care of the rhythm.</p>
        </div>
        <AccountControls />
      </div>
    </header>;
}
