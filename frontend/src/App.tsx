import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ImportPortfolio from './pages/ImportPortfolio';
import Dashboard from './pages/Dashboard';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ImportPortfolio />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
