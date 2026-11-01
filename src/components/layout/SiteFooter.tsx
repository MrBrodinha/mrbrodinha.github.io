import { Link } from 'react-router-dom';
import MusicCredits from '../brodle/components/MusicCredits';

export default function SiteFooter({ brodle }: { brodle: boolean }) {
  return <footer className="site-footer">
    <div className="site-footer-inner">
      <div className="site-footer-branding"><Link to="/" className="site-footer-brand"><img className="site-footer-face" src="/media/icon.gif" width="34" height="42" alt="Spinning face" decoding="async" /><span>mrbrodinha</span></Link><a className="site-github-link" href="https://github.com/MrBrodinha" target="_blank" rel="noopener noreferrer">GitHub <span aria-hidden="true">↗</span></a></div>
      {brodle && <MusicCredits />}
    </div>
  </footer>;
}
