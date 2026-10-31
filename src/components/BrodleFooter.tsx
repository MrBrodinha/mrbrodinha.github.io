import { Link } from 'react-router-dom';
import BrodleIcon from './BrodleIcon';

export default function BrodleFooter({ creatorLink = true }: { creatorLink?: boolean }) {
  return (
    <footer className="brodle-footer">
      {creatorLink && <div className="brodle-content creator-invite">
        <div><strong>Have a tune in mind?</strong><p>Want to create your own?</p></div>
        <Link to="/brodle/create" className="creator-link"><BrodleIcon name="music" />Create a melody<span aria-hidden="true">↗</span></Link>
      </div>}
      <div className="brodle-content footer-content">
        <Link to="/" className="footer-brand">MrBrodinha</Link>
        <p className="sound-credits">
          Piano: <a href="https://github.com/sfzinstruments/SplendidGrandPiano">Splendid Grand / AKAI</a>
          <span aria-hidden="true"> · </span>Electric: <a href="https://github.com/sfzinstruments/GregSullivan.E-Pianos">Greg Sullivan / kinwie</a>
          {' '}(<a href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</a>)
          <span aria-hidden="true"> · </span>via <a href="https://github.com/danigb/smplr">smplr</a>
        </p>
      </div>
    </footer>
  );
}
