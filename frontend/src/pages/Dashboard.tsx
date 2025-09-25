import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { coinSymbolToId } from '../utils/coinMapper';
import CoinModal from '../components/CoinModal';
import { useNavigate } from 'react-router-dom';

type SummarySection = {
  overexposed: { coin: string; percent: string; reason: string }[];
  underweighted: { coin: string; percent: string; reason: string }[];
  rotationMoves: string[];
  strategicTake: string;
};

type Health = {
  score: number;
  level: 'Low' | 'Medium' | 'High' | 'Critical';
  reasons: string[];
  callToAction: string;
};

type Holding = {
  coin: string;
  amount: number;
};

type PriceMap = {
  [coinId: string]: { usd: number };
};

export default function Dashboard() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [prices, setPrices] = useState<PriceMap>({});
  const [loading, setLoading] = useState(true);
  const [totalValue, setTotalValue] = useState(0);
  const [selectedCoin, setSelectedCoin] = useState<string | null>(null);
  const [portfolioSummary, setPortfolioSummary] = useState<SummarySection | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // inline edit state: symbol -> draft amount
  const [editing, setEditing] = useState<{ [symbol: string]: number | undefined }>({});

  const navigate = useNavigate();
  
  useEffect(() => {
    const fetchPortfolio = async () => {
      try {
        // Set token from localStorage
        const token = localStorage.getItem('bullrush_token');
        if (token) {
          axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        }

        const res = await axios.get('http://localhost:5000/api/portfolio/user');
        setHoldings(res.data.holdings);
      } catch (err) {
        console.error('Failed to fetch holdings:', err);
      }
    };

    fetchPortfolio();
  }, []);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const ids = [...new Set(
          holdings.map(h => coinSymbolToId[h.coin.toUpperCase()]).filter(Boolean)
        )].join(',');

        if (!ids) return;

        const res = await axios.get(`http://localhost:5000/api/prices?ids=${ids}`);
        setPrices(res.data);

        const total = holdings.reduce((acc, h) => {
          const id = coinSymbolToId[h.coin.toUpperCase()];
          const price = res.data[id]?.usd ?? 0;
          return acc + h.amount * price;
        }, 0);
        setTotalValue(total);
      } catch (err) {
        console.error('Failed to fetch prices:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 120000);
    return () => clearInterval(interval);
  }, [holdings]);

  const handleFetchSummary = async () => {
    setShowSummary(true);
    setPortfolioSummary(null);
    setHealth(null);
    setSummaryLoading(true);
    try {
      const portfolioData = holdings.map(h => ({
        coin: h.coin.toUpperCase(),
        amount: h.amount * (prices[coinSymbolToId[h.coin.toUpperCase()]]?.usd ?? 0)
      }));
      const priceMap: Record<string, number> = {};
      for (const h of holdings) {
        const id = coinSymbolToId[h.coin.toUpperCase()];
        priceMap[h.coin.toUpperCase()] = prices[id]?.usd ?? 0;
      }

      const res = await axios.post('http://localhost:5000/api/ai/analysis/portfolio', {
        portfolio: portfolioData,
        priceMap
      });
      setPortfolioSummary(res.data.summary);
      setHealth(res.data.health || null);

    } catch (err) {
      console.error('Failed to fetch portfolio summary:', err);
      setPortfolioSummary(null);
      setHealth(null);
    } finally {
      setSummaryLoading(false);
    }
  };

  // ---- Edit/Delete helpers ----
  const startEdit = (sym: string, amt: number) =>
    setEditing(prev => ({ ...prev, [sym]: amt }));

  const cancelEdit = (sym: string) =>
    setEditing(prev => { const p = { ...prev }; delete p[sym]; return p; });

  const saveEdit = async (sym: string) => {
    try {
      const amount = Number(editing[sym] ?? 0);
      await axios.patch('http://localhost:5000/api/portfolio/holdings', { coin: sym, amount });
      setHoldings(h =>
        amount > 0
          ? h.map(x => x.coin.toUpperCase() === sym ? ({ ...x, amount }) : x)
          : h.filter(x => x.coin.toUpperCase() !== sym)
      );
      cancelEdit(sym);
    } catch (e) {
      console.error('Failed to save edit:', e);
    }
  };

  const deleteCoin = async (sym: string) => {
    try {
      await axios.delete(`http://localhost:5000/api/portfolio/holdings/${sym}`);
      setHoldings(h => h.filter(x => x.coin.toUpperCase() !== sym));
      // also clear any edit state
      cancelEdit(sym);
    } catch (e) {
      console.error('Failed to delete coin:', e);
    }
  };

  const healthColor = (level: Health['level']) => {
    if (level === 'Critical') return 'bg-red-800 border-red-500 text-red-100';
    if (level === 'High') return 'bg-orange-800 border-orange-500 text-orange-100';
    if (level === 'Medium') return 'bg-yellow-800 border-yellow-500 text-yellow-100';
    return 'bg-emerald-900 border-emerald-500 text-emerald-100';
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-blue-500">
          BullRush Dashboard
        </h1>
        <p className="mt-2 text-base text-cyan-100 italic tracking-wide">
          Your Guide to the Alt Szn
        </p>
      </div>

      {loading && <p>Loading portfolio...</p>}

      {!loading && holdings.length === 0 && (
        <div className="flex flex-col items-center justify-center mt-10">
          <p className="text-yellow-300 mb-4">No holdings found.</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold"
          >
            Go Import Them
          </button>
        </div>
      )}

      {!loading && holdings.length > 0 && (
        <div className="mt-10">
          <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-300 to-cyan-400 mb-4">
            Your Portfolio
          </h2>

          {/* Health banner (shown after summary fetch if present) */}
          {showSummary && health && (
            <div className={`mb-6 border rounded-xl p-4 ${healthColor(health.level)}`}>
              <div className="flex items-center justify-between">
                <div className="text-lg font-semibold">
                  Portfolio Health: {health.level} <span className="opacity-80">(Score {health.score})</span>
                </div>
                <div className="text-sm opacity-90">{health.callToAction}</div>
              </div>
              {health.reasons?.length > 0 && (
                <ul className="mt-2 list-disc list-inside text-sm opacity-90">
                  {health.reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {holdings.map(({ coin, amount }) => {
              const symbol = coin.toUpperCase();
              const id = coinSymbolToId[symbol];
              const price = prices[id]?.usd ?? 0;
              const value = amount * price;
              const displayPrice = price < 0.01 ? price.toFixed(8) : price.toFixed(4);
              const valueDisplay = value < 0.01 ? value.toFixed(8) : value.toFixed(2);
              const percent = totalValue ? ((value / totalValue) * 100).toFixed(1) : '0.0';

              const isEditing = editing[symbol] !== undefined;

              return (
                <div
                  key={coin}
                  onClick={() => !isEditing && setSelectedCoin(symbol)}
                  className="bg-gray-800 p-4 rounded-xl shadow-md cursor-pointer hover:ring-2 hover:ring-blue-400 transition relative"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-xl font-semibold">{symbol}</h2>

                    {!isEditing ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); startEdit(symbol, amount); }}
                          className="text-sm px-2 py-1 rounded bg-gray-700 hover:bg-gray-600"
                          title="Edit amount"
                        >
                          ✎
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteCoin(symbol); }}
                          className="text-sm px-2 py-1 rounded bg-red-600 hover:bg-red-500"
                          title="Delete"
                        >
                          🗑
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); saveEdit(symbol); }}
                          className="text-sm px-2 py-1 rounded bg-green-600 hover:bg-green-500"
                          title="Save"
                        >
                          ✓
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); cancelEdit(symbol); }}
                          className="text-sm px-2 py-1 rounded bg-gray-600 hover:bg-gray-500"
                          title="Cancel"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mt-1">
                    {!isEditing ? (
                      <p>Amount: {amount}</p>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-300">Amount:</span>
                        <input
                          type="number"
                          step="any"
                          className="w-28 px-2 py-1 rounded bg-gray-700 border border-gray-600"
                          value={editing[symbol]}
                          onChange={(e) =>
                            setEditing(s => ({ ...s, [symbol]: Number(e.target.value) }))
                          }
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    )}
                    <p>Price: ${displayPrice}</p>
                    <p className="text-green-400 font-bold mt-2">Value: ${valueDisplay}</p>
                    <p className="text-sm text-cyan-400 mt-1">📊 {percent}% of Portfolio</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-center gap-4 mt-6">
            <button
              onClick={() => navigate('/')}
              className="bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-500 hover:to-blue-600 text-white px-5 py-2 rounded-xl font-medium shadow-md"
            >
              + Add Coin
            </button>
          </div>
        </div>
      )}

      {!loading && holdings.length > 0 && (
        <>
          <div className="mt-8 text-xl font-bold text-cyan-300 text-center">
            💰 Total Portfolio Value: ${totalValue.toFixed(2)}
          </div>

          <div className="mt-6 flex justify-center">
            <button
              onClick={handleFetchSummary}
              className="bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-500 hover:to-blue-600 text-white py-2 px-6 rounded-xl font-medium shadow-lg"
            >
              📋 View Portfolio Summary
            </button>
          </div>

          {showSummary && (
            <div className="mt-6 bg-gray-800 p-4 rounded-xl text-sm text-white space-y-4">
              {summaryLoading ? (
                <p className="text-cyan-400 animate-pulse">⏳ Generating summary...</p>
              ) : portfolioSummary ? (
                <>
                  <div>
                    <h2 className="text-lg font-bold text-cyan-300">Overexposed</h2>
                    <ul className="list-disc list-inside text-white">
                      {portfolioSummary.overexposed.map((item, idx) => (
                        <li key={idx}>
                          <span className="font-semibold text-yellow-400">
                            {item.coin} ({item.percent})
                          </span>{' '}
                          — {item.reason}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h2 className="text-lg font-bold text-cyan-300">Underweighted</h2>
                    <ul className="list-disc list-inside text-white">
                      {portfolioSummary.underweighted.map((item, idx) => (
                        <li key={idx}>
                          <span className="font-semibold text-green-400">
                            {item.coin} ({item.percent})
                          </span>{' '}
                          — {item.reason}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h2 className="text-lg font-bold text-cyan-300">Rotation Moves</h2>
                    <ul className="list-disc list-inside text-white">
                      {portfolioSummary.rotationMoves.map((move, idx) => (
                        <li key={idx}>{move}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h2 className="text-lg font-bold text-cyan-300">Strategic Take</h2>
                    <p className="text-white">{portfolioSummary.strategicTake}</p>
                  </div>
                </>
              ) : (
                <p className="text-red-400">❌ Failed to load summary.</p>
              )}
            </div>
          )}

          {selectedCoin && (
            <CoinModal
              symbol={selectedCoin}
              coinId={coinSymbolToId[selectedCoin]}
              holdings={holdings}
              onClose={() => setSelectedCoin(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
