import { Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import Redbull from './components/Redbull';
import './App.css';

function App() {
  return (
    <div className="principal">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/redbull" element={<Redbull />} />
      </Routes>
    </div>
  );
}

export default App;
