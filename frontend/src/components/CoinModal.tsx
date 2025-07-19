import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface CoinModalProps {
  symbol: string;
  coinId: string;
  onClose: () => void;
}

interface CoinData {
  name: string;
  image: {
    small: string;
  };
  market_data: {
    price_change_percentage_1h_in_currency: { usd: number };
    price_change_percentage_24h_in_currency: { usd: number };
    price_change_percentage_7d_in_currency: { usd: number };
    price_change_percentage_30d_in_currency: { usd: number };
    price_change_percentage_90d_in_currency: { usd: number };
    price_change_percentage_1y_in_currency: { usd: number };
  };
}

export default function CoinModal({ symbol, coinId, onClose }: CoinModalProps) {
  const [data, setData] = useState<CoinData | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCoinDetails = async () => {
      try {
        const [coinRes, chartRes] = await Promise.all([
          axios.get(
            `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`
          ),
          axios.get(
            `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=7`
          ),
        ]);

        setData(coinRes.data);

        const formatted = chartRes.data.prices.map((point: number[]) => ({
          time: new Date(point[0]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          price: point[1],
        }));
        setChartData(formatted);
      } catch (err) {
        console.error('Failed to fetch coin details:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCoinDetails();
  }, [coinId]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-gray-800 text-white p-6 rounded-xl w-full max-w-lg relative">
        <button
          onClick={onClose}
          className="absolute top-2 right-4 text-xl text-white hover:text-red-400"
        >
          ✖
        </button>

        {loading ? (
          <p>Loading {symbol}...</p>
        ) : data ? (
          <>
            <div className="flex items-center gap-4 mb-4">
              <img src={data.image.small} alt={symbol} className="w-8 h-8" />
              <h2 className="text-2xl font-bold">{data.name} ({symbol})</h2>
            </div>

            <div className="space-y-2 text-sm">
              <p>1h: {data.market_data.price_change_percentage_1h_in_currency?.usd?.toFixed(2)}%</p>
              <p>24h: {data.market_data.price_change_percentage_24h_in_currency?.usd?.toFixed(2)}%</p>
              <p>7d: {data.market_data.price_change_percentage_7d_in_currency?.usd?.toFixed(2)}%</p>
              <p>30d: {data.market_data.price_change_percentage_30d_in_currency?.usd?.toFixed(2)}%</p>
              <p>90d: {data.market_data.price_change_percentage_90d_in_currency?.usd?.toFixed(2)}%</p>
              <p>1y: {data.market_data.price_change_percentage_1y_in_currency?.usd?.toFixed(2)}%</p>
            </div>

            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-2">📈 Last 7 Days</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                  <Line type="monotone" dataKey="price" stroke="#4ade80" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <p>Failed to load coin data.</p>
        )}
      </div>
    </div>
  );
}
