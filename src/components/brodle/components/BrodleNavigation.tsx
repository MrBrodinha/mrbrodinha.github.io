import { NavLink } from 'react-router-dom';
import { useAuth } from '../../../auth/authContext';
import { useBrodleAdmin } from '../hooks/useBrodleAdmin';

export default function BrodleNavigation() {
  const { user } = useAuth();
  const { admin } = useBrodleAdmin();
  return <nav className="brodle-library-nav" aria-label="Melody library">
    <NavLink to="/brodle/create?new=1" className="new-melody-link">Create a melody</NavLink>
    {user && <NavLink to="/brodle/melodies">My melodies</NavLink>}
    {admin && <NavLink to="/brodle/admin">Manage Brodle</NavLink>}
    <NavLink to="/brodle" end className="play-brodle-link">Brodle</NavLink>
  </nav>;
}
