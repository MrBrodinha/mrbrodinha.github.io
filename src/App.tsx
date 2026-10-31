import { lazy, Suspense } from 'react';
import { Navigate, Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import './App.css';

// Keep Redbull.tsx out of the browser bundle while the ratings page is paused.
const RedbullUnavailable = lazy(() => import('./components/RedbullUnavailable'));
const Mvg = lazy(() => import('./components/Mvg'));
const Brodle = lazy(() => import('./components/Brodle'));
const MelodyCreator = lazy(() => import('./components/MelodyCreator'));

function App() {
  return (
    <div className="principal">
      <Suspense fallback={<main className="route-loading" role="status">Loading…</main>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/mvg" element={<Mvg />} />
          <Route path="/redbull/*" element={<RedbullUnavailable />} />
          <Route path="/brodle" element={<Brodle />} />
          <Route path="/brodle/create" element={<MelodyCreator />} />
          <Route path="/piano" element={<Navigate to="/brodle" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}

export default App;
