import { Link } from 'react-router-dom';
import { displayDate } from '../lib/melodyLibrary';

export type ChallengeNavigationProps = {
  date?: string; previousDate: string | null; nextDate: string | null; archive: boolean;
};

export default function ChallengeNavigation({ date, previousDate, nextDate, archive }: ChallengeNavigationProps) {
  return <nav className="challenge-navigation brodle-content" aria-label="Other Brodle days">
    <div className="challenge-navigation-copy">
      <h2>Play other days</h2>
      <p>{date ? displayDate(date) : 'Past puzzles will appear here once published.'}</p>
    </div>
    <div className="challenge-navigation-actions">
      {previousDate
        ? <Link to={'/brodle?date=' + previousDate} aria-label={'Play previous puzzle: ' + displayDate(previousDate)} title={displayDate(previousDate)}><span aria-hidden="true">←</span> Earlier</Link>
        : <button type="button" disabled aria-label="No earlier puzzle"><span aria-hidden="true">←</span> Earlier</button>}
      {nextDate
        ? <Link to={'/brodle?date=' + nextDate} aria-label={'Play next puzzle: ' + displayDate(nextDate)} title={displayDate(nextDate)}>Later <span aria-hidden="true">→</span></Link>
        : <button type="button" disabled aria-label="No later published puzzle">Later <span aria-hidden="true">→</span></button>}
      {archive && <Link to="/brodle" className="challenge-today-link">Today’s puzzle</Link>}
    </div>
  </nav>;
}
