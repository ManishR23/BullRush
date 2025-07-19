import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';


type Holding = {
  coin: string;
  amount: string; // keeping as string for input handling
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
        userId: 'medha123',
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
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <h1 className="text-3xl font-bold mb-4">📥 Import Your Portfolio</h1>

      {holdings.map((row, idx) => (
        <div key={idx} className="flex gap-4 mb-2">
          <input
            className="bg-gray-800 p-2 rounded-md text-white w-40"
            placeholder="Coin (e.g. XRP)"
            value={row.coin}
            onChange={e => handleChange(idx, 'coin', e.target.value.toUpperCase())}
          />
          <input
            className="bg-gray-800 p-2 rounded-md text-white w-40"
            placeholder="Amount"
            type="number"
            value={row.amount}
            onChange={e => handleChange(idx, 'amount', e.target.value)}
          />
        </div>
      ))}

      <button
        onClick={handleAddRow}
        className="bg-blue-600 px-4 py-2 rounded-md mt-2 mr-4 hover:bg-blue-500"
      >
        + Add Coin
      </button>

      <button
        onClick={handleSubmit}
        className="bg-green-600 px-4 py-2 rounded-md mt-2 hover:bg-green-500"
        disabled={loading}
      >
        {loading ? 'Saving...' : 'Save Portfolio'}
      </button>

      {message && <p className="mt-4 text-lg">{message}</p>}
    </div>
  );
}
