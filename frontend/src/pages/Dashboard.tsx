import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { coinSymbolToId } from '../utils/coinMapper';
import CoinModal from '../components/CoinModal';

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

  const userId = 'medha123';

  useEffect(() => {
    const fetchPortfolio = async () => {
      try {
        const res = await axios.get(`http://localhost:5000/api/portfolio/user/${userId}`);
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
        const ids = holdings
          .map(h => coinSymbolToId[h.coin.toUpperCase()])
          .filter(Boolean)
          .join(',');

        if (!ids) return;

        const res = await axios.get(
          `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
        );
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
    const interval = setInterval(fetchPrices, 30000);
    return () => clearInterval(interval);
  }, [holdings]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <h1 className="text-3xl font-bold mb-6">📊 BullRush Dashboard</h1>

      {loading && <p>Loading portfolio...</p>}

      {!loading && holdings.length === 0 && (
        <p className="text-yellow-300">No holdings found. Go import them!</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {holdings.map(({ coin, amount }) => {
          const symbol = coin.toUpperCase();
          const id = coinSymbolToId[symbol];
          const price = prices[id]?.usd ?? 0;
          const value = (amount * price).toFixed(2);

          return (
            <div
              key={coin}
              onClick={() => setSelectedCoin(symbol)}
              className="bg-gray-800 p-4 rounded-xl shadow-md cursor-pointer hover:ring-2 hover:ring-blue-400 transition"
            >
              <h2 className="text-xl font-semibold">{symbol}</h2>
              <p>Amount: {amount}</p>
              <p>Price: ${price.toFixed(4)}</p>
              <p className="text-green-400 font-bold mt-2">Value: ${value}</p>
            </div>
          );
        })}
      </div>

      {!loading && holdings.length > 0 && (
        <div className="mt-8 text-xl font-bold text-cyan-300">
          💰 Total Portfolio Value: ${totalValue.toFixed(2)}
        </div>
      )}

      {selectedCoin && (
        <CoinModal
          symbol={selectedCoin}
          coinId={coinSymbolToId[selectedCoin]}
          onClose={() => setSelectedCoin(null)}
        />
      )}
    </div>
  );
}
