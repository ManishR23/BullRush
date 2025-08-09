import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ImportPortfolio from './pages/ImportPortfolio';
import Dashboard from './pages/Dashboard';
import LoginSignup from './pages/LoginSignup';
import axios from 'axios';
import { useEffect, useState } from 'react';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('bullrush_token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setIsAuthenticated(true);
    }
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginSignup />} />
        <Route path="/" element={isAuthenticated ? <ImportPortfolio /> : <Navigate to="/login" />} />
        <Route path="/dashboard" element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
