import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

export default function LoginSignup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const endpoint = isSignup ? '/api/auth/signup' : '/api/auth/login';
      const res = await axios.post(`http://localhost:5000${endpoint}`, {
        email,
        password,
      });

      const { token } = res.data;
      localStorage.setItem('bullrush_token', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      // 🔍 Try to fetch existing portfolio but handle 404 silently
      let holdings = [];

      try {
        const portfolioRes = await axios.get('http://localhost:5000/api/portfolio/user');
        holdings = portfolioRes.data?.holdings ?? [];
      } catch (portfolioErr: any) {
        if (portfolioErr?.response?.status !== 404) {
          throw portfolioErr; // Only throw real errors
        }
      }

      navigate('/dashboard');
    } catch (err: any) {
      console.error('Login/Signup or Portfolio Error:', err.response?.data || err.message || err);
      setError(err?.response?.data?.error || 'Something went wrong');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col justify-center items-center p-6">
      <h1 className="text-4xl font-extrabold mb-6 bg-gradient-to-r from-cyan-300 to-blue-500 text-transparent bg-clip-text">
        {isSignup ? 'Sign Up' : 'Log In'} to BullRush
      </h1>

      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <input
          type="email"
          placeholder="Email"
          value={email}
          required
          onChange={e => setEmail(e.target.value)}
          className="w-full p-3 rounded-xl bg-gray-800 text-white focus:ring-2 focus:ring-blue-400 outline-none"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          required
          onChange={e => setPassword(e.target.value)}
          className="w-full p-3 rounded-xl bg-gray-800 text-white focus:ring-2 focus:ring-blue-400 outline-none"
        />
        <button
          type="submit"
          className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 py-3 rounded-xl font-semibold shadow-md"
        >
          {isSignup ? 'Create Account' : 'Log In'}
        </button>
      </form>

      <button
        onClick={() => setIsSignup(!isSignup)}
        className="mt-4 text-sm text-cyan-300 hover:underline"
      >
        {isSignup ? 'Already have an account? Log in' : 'Need an account? Sign up'}
      </button>

      {error && <p className="mt-4 text-red-400 text-sm">{error}</p>}
    </div>
  );
}
