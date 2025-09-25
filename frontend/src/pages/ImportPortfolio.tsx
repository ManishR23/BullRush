import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

type Holding = {
  coin: string;
  amount: string;
};

export default function ImportPortfolio() {
  const [holdings, setHoldings] = useState<Holding[]>([{ coin: '', amount: '' }]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleChange = (index: number, field: keyof Holding, value: string) => {
    const updated = [...holdings];
    updated[index][field] = value;
    setHoldings(updated);
  };

  const handleAddRow = () => {
    setHoldings([...holdings, { coin: '', amount: '' }]);
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const filteredHoldings = holdings
        .filter(h => h.coin && h.amount)
        .map(h => ({ coin: h.coin, amount: parseFloat(h.amount) }));

      const res = await axios.post('http://localhost:5000/api/portfolio', {
        holdings: filteredHoldings,
      });

      if (res.status === 200 || res.status === 201) {
        setMessage('✅ Portfolio saved successfully!');
        navigate('/dashboard');
      } else {
        setMessage('❌ Unexpected response. Try again.');
      }
    } catch (err) {
      console.error(err);
      setMessage('❌ Failed to save portfolio.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 pb-20 flex flex-col items-center">
      {/* BULLRUSH Logo */}
      <div className="text-center mb-12">
        <img
          src="/bullrush.png"
          alt="BullRush Logo"
          className="mx-auto w-[320px] sm:w-[420px] md:w-[500px] drop-shadow-2xl"
        />
      </div>


      <div className="text-center mb-8">
        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-300 to-cyan-400">
          📥 Import Your Portfolio
        </h1>
        <p className="mt-2 text-cyan-100 italic tracking-wide">
          Add the coins you're holding to get your custom altseason strategy.
        </p>
      </div>

      <div className="w-full max-w-2xl space-y-4">
        {holdings.map((row, idx) => (
          <div key={idx} className="flex gap-4">
            <input
              className="bg-gray-800 p-3 rounded-xl text-white w-1/2 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              placeholder="Coin (e.g. XRP)"
              value={row.coin}
              onChange={e => handleChange(idx, 'coin', e.target.value.toUpperCase())}
            />
            <input
              className="bg-gray-800 p-3 rounded-xl text-white w-1/2 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-400"
              placeholder="Amount"
              type="number"
              value={row.amount}
              onChange={e => handleChange(idx, 'amount', e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="flex gap-4 mt-6">
        <button
          onClick={handleAddRow}
          className="bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-500 hover:to-blue-600 text-white px-5 py-2 rounded-xl font-medium shadow-md"
        >
          + Add Coin
        </button>

        <button
          onClick={handleSubmit}
          className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white px-5 py-2 rounded-xl font-medium shadow-md"
          disabled={loading}
        >
          {loading ? 'Saving...' : '💾 Save Portfolio'}
        </button>
      </div>

      {message && (
        <p className="mt-6 text-lg font-medium text-yellow-300">{message}</p>
      )}
    </div>
  );
}
