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
import { coinSymbolToId } from '../utils/coinMapper';

interface Holding {
  coin: string;
  amount: number;
}

interface CoinModalProps {
  symbol: string;
  coinId: string;
  holdings: Holding[];
  onClose: () => void;
}

const chartRanges = [
  { label: '7d', days: '7' },
  { label: '30d', days: '30' },
  { label: '90d', days: '90' },
  { label: '1y', days: '365' },
];

/** =======================
 *  Caching + Throttling
 *  ======================= */
type CacheEntry = { data: any; t: number; ttl: number };

// in-memory cache
const mem = new Map<string, CacheEntry>();
// in-flight requests (dedupe)
const inflight = new Map<string, Promise<any>>();
// crude per-host throttle
let lastCallTs = 0;
const MIN_SPACING_MS = 900; // ~1 req/sec to be nice to CG

function sleep(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}

async function throttle() {
  const now = Date.now();
  const delta = now - lastCallTs;
  if (delta < MIN_SPACING_MS) {
    await sleep(MIN_SPACING_MS - delta);
  }
  lastCallTs = Date.now();
}

function lsKey(url: string) {
  return `cg:${url}`;
}

function readLS(url: string): CacheEntry | undefined {
  try {
    const raw = localStorage.getItem(lsKey(url));
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    return parsed;
  } catch { return; }
}

function writeLS(url: string, entry: CacheEntry) {
  try {
    localStorage.setItem(lsKey(url), JSON.stringify(entry));
  } catch { /* ignore quota errors */ }
}

function getFresh(entry?: CacheEntry) {
  if (!entry) return false;
  return Date.now() - entry.t < entry.ttl;
}

async function fetchWithBackoff(url: string, tries = 3, baseDelay = 800) {
  let attempt = 0;
  while (attempt < tries) {
    try {
      await throttle();
      const res = await axios.get(url);
      return res.data;
    } catch (err: any) {
      const status = err?.response?.status;
      attempt += 1;
      if (attempt >= tries) throw err;
      // Retry on 429, 5xx, or network errors
      if (!status || status === 429 || (status >= 500 && status < 600)) {
        const delay = Math.round(baseDelay * Math.pow(1.8, attempt - 1));
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  // unreachable
}

async function getCached(url: string, ttlMs: number) {
  // 1) fresh in-memory?
  const memHit = mem.get(url);
  if (getFresh(memHit)) return memHit!.data;

  // 2) fresh localStorage?
  const lsHit = readLS(url);
  if (getFresh(lsHit)) {
    // promote to memory
    mem.set(url, lsHit!);
    return lsHit!.data;
  }

  // 3) dedupe concurrent fetches
  if (inflight.has(url)) return inflight.get(url)!;

  const p = (async () => {
    const data = await fetchWithBackoff(url);
    const entry: CacheEntry = { data, t: Date.now(), ttl: ttlMs };
    mem.set(url, entry);
    writeLS(url, entry);
    inflight.delete(url);
    return data;
  })();

  inflight.set(url, p);
  return p;
}

/** TTLs tuned to reduce 429s without feeling stale */
const TTL = {
  details: 12 * 60 * 60 * 1000, // 12h
  chart:   6  * 60 * 60 * 1000, // 6h
  price:   2  * 60 * 1000,      // 2m
};

export default function CoinModal({ symbol, coinId, holdings, onClose }: CoinModalProps) {
  const [data, setData] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeRange, setActiveRange] = useState('7');
  const [aiSentiment, setAiSentiment] = useState('');
  const [aiReason, setAiReason] = useState('');
  const [aiRotation, setAiRotation] = useState<{ to: string; amount: number; why: string }[]>([]);
  const [aiUrgency, setAiUrgency] = useState('');
  const [percentChanges, setPercentChanges] = useState<Record<string, number | undefined>>({});

  const fetchChart = async (days: string) => {
    try {
      const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`;
      const res = await getCached(url, TTL.chart);
      const formatted = res.prices.map((p: number[]) => ({
        time: new Date(p[0]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        price: p[1],
      }));
      setChartData(formatted);
    } catch (err) {
      console.error('Chart fetch error:', err);
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const coinUrl = `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;
        const res = await getCached(coinUrl, TTL.details);
        if (!alive) return;
        setData(res);
      } catch (err) {
        console.error('Detail fetch error:', err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [coinId, symbol]);

  useEffect(() => {
    fetchChart(activeRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRange, coinId]);

  useEffect(() => {
    const fetchSentiment = async () => {
      if (!data) return;

      const pctChanges = {
        '1h': data.market_data.price_change_percentage_1h_in_currency?.usd,
        '24h': data.market_data.price_change_percentage_24h_in_currency?.usd,
        '7d': data.market_data.price_change_percentage_7d_in_currency?.usd,
        '30d': data.market_data.price_change_percentage_30d_in_currency?.usd,
        '90d': data.market_data.price_change_percentage_90d_in_currency?.usd,
        '1y': data.market_data.price_change_percentage_1y_in_currency?.usd,
      };
      setPercentChanges(pctChanges);

      // price map for entire portfolio (dedup ids)
      const ids = Array.from(new Set(holdings.map(h => coinSymbolToId[h.coin.toUpperCase()]).filter(Boolean)));
      if (ids.length === 0) return;

      const priceUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`;
      const priceMap = await getCached(priceUrl, TTL.price);

      const fullPortfolio = holdings.map((h) => {
        const id = coinSymbolToId[h.coin.toUpperCase()];
        const price = priceMap[id]?.usd || 0;
        return { coin: h.coin, amount: +(h.amount * price).toFixed(2) };
      });

      try {
        const res = await axios.post('http://localhost:5000/api/ai/analysis', {
          coin: symbol,
          percentChanges: pctChanges,
          portfolio: fullPortfolio,
        });
        setAiSentiment(res.data.sentiment);
        setAiReason(res.data.reason);
        setAiRotation(res.data.rotationSuggestion || []);
        setAiUrgency(res.data.urgency || '');
      } catch (err) {
        console.error('AI sentiment error:', err);
      }
    };

    fetchSentiment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, holdings, symbol]);

  const renderPercent = (label: string, value?: number) => {
    if (value === undefined || isNaN(value)) return <p className="text-gray-400 italic">{label}: —</p>;
    const color = value >= 0 ? 'text-green-400' : 'text-red-400';
    return <p className={`${color} font-semibold`}>{label}: {value.toFixed(2)}%</p>;
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity duration-300"
    >
      <div
        className="bg-gray-800 text-white p-6 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto relative transform transition-all duration-300 ease-out animate-fadeIn modal-scrollbar"
      >
        <button onClick={onClose} className="absolute top-2 right-4 text-xl text-white hover:text-red-400">✖</button>

        {loading ? (
          <p>Loading {symbol}...</p>
        ) : data ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <img src={data.image.small} alt={symbol} className="w-8 h-8" />
                <h2 className="text-2xl font-bold">{data.name} ({symbol})</h2>
              </div>
              {aiSentiment && (
                <div className="text-right">
                  <span className="text-sm text-gray-300">Sentiment</span>
                  <div className="text-xl font-bold text-cyan-400">{aiSentiment}</div>
                </div>
              )}
            </div>

            <div className="space-y-2 text-sm">
              {renderPercent('1h', percentChanges['1h'])}
              {renderPercent('24h', percentChanges['24h'])}
              {renderPercent('7d', percentChanges['7d'])}
              {renderPercent('30d', percentChanges['30d'])}
              {renderPercent('90d', percentChanges['90d'])}
              {renderPercent('1y', percentChanges['1y'])}
            </div>

            {aiReason && (
              <div className="mt-4 text-sm text-gray-300 italic border-l-4 border-cyan-500 pl-3">
                🧠 {aiReason}
              </div>
            )}

            {aiRotation.length > 0 && (
              <div className="mt-4 text-sm text-amber-400 border-l-4 border-yellow-500 pl-3">
                🔄 {['Strong Buy', 'Buy', 'Hold-Buy'].includes(aiSentiment)
                  ? 'Rotation (toward Phase-2 targets):'
                  : 'Rotation Suggestions:'}
                <ul className="list-disc ml-5 mt-1">
                  {aiRotation.map((r, idx) => (
                    <li key={idx}>
                      Rotate ${r.amount} into {r.to}
                      <span className="text-gray-400"> — {r.why}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {aiUrgency && (
              <div className="mt-2 text-sm text-orange-400 italic">
                ⚠️ Urgency: {aiUrgency}
              </div>
            )}

            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-2">📈 Price Chart</h3>
              <div className="flex gap-2 mb-4">
                {chartRanges.map(r => (
                  <button
                    key={r.label}
                    onClick={() => setActiveRange(r.days)}
                    className={`px-3 py-1 rounded-full text-sm font-medium border ${
                      activeRange === r.days
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
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
