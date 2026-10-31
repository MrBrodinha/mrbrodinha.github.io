import { Navigate, Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import Mvg from './components/Mvg';
// Keep Redbull.tsx out of the browser bundle while the ratings page is paused.
import RedbullUnavailable from './components/RedbullUnavailable';
import Brodle from './components/Brodle';
import MelodyCreator from './components/MelodyCreator';
import './App.css';

function App() {
  return (
    <div className="principal">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/mvg" element={<Mvg />} />
        <Route path="/redbull/*" element={<RedbullUnavailable />} />
        <Route path="/brodle" element={<Brodle />} />
        <Route path="/brodle/create" element={<MelodyCreator />} />
        <Route path="/piano" element={<Navigate to="/brodle" replace />} />
      </Routes>
    </div>
  );
}

export default App;
