import { Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import Mvg from './components/Mvg';
import Redbull from './components/Redbull';
import Piano from './components/Piano';
import './App.css';

function App() {
  return (
    <div className="principal">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/mvg" element={<Mvg />} />
        <Route path="/redbull" element={<Redbull />} />
        <Route path="/piano" element={<Piano />} />
      </Routes>
    </div>
  );
}

export default App;
