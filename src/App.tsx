import { lazy, Suspense } from 'react';
import { Navigate, Routes, Route } from 'react-router-dom';
import Home from './components/home/Home';
import { AuthProvider } from './auth/AuthProvider';
import SiteLayout from './components/layout/SiteLayout';
import './App.css';

const Redbull = lazy(() => import('./components/redbull/Redbull'));
const AuthPage = lazy(() => import('./auth/AuthPage'));
const AuthReturn = lazy(() => import('./auth/AuthReturn'));
const AccountPage = lazy(() => import('./auth/AccountPage'));
const Mvg = lazy(() => import('./components/mvg/Mvg'));
const CrazyWildlife = lazy(() => import('./components/wildlife/CrazyWildlife'));
const Brodle = lazy(() => import('./components/brodle/Brodle'));
const BrodlePractice = lazy(() => import('./components/brodle/BrodlePractice'));
const MyMelodies = lazy(() => import('./components/brodle/library/MyMelodies'));
const BrodleAdmin = lazy(() => import('./components/brodle/admin/BrodleAdmin'));
const MelodyCreator = lazy(() => import('./components/brodle/creator/MelodyCreator'));

function App() {
  return (
    <AuthProvider><SiteLayout>
      <Suspense fallback={<main className="route-loading" role="status">Loading…</main>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<AuthPage key="login" mode="login" />} />
          <Route path="/signup" element={<AuthPage key="signup" mode="signup" />} />
          <Route path="/forgot-password" element={<AuthPage key="forgot" mode="forgot" />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/auth/callback" element={<AuthReturn />} />
          <Route path="/auth/reset-password" element={<AuthReturn reset />} />
          <Route path="/mvg" element={<Mvg />} />
          <Route path="/crazy-wildlife" element={<CrazyWildlife />} />
          <Route path="/CrazyWildlife/*" element={<Navigate to="/crazy-wildlife" replace />} />
          <Route path="/redbull/*" element={<Redbull />} />
          <Route path="/brodle" element={<Brodle />} />
          <Route path="/brodle/tutorial" element={<BrodlePractice />} />
          <Route path="/brodle/melodies" element={<MyMelodies />} />
          <Route path="/brodle/admin" element={<BrodleAdmin />} />
          <Route path="/brodle/create" element={<MelodyCreator />} />
          <Route path="/piano" element={<Navigate to="/brodle" replace />} />
        </Routes>
      </Suspense>
    </SiteLayout></AuthProvider>
  );
}

export default App;
