import express from 'express';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ======================
   Helpers (shared)
====================== */
const LARGE_CAP_THRESHOLD = 10_000_000_000; // $10B

const normSym = (s) => String(s || '').trim().toUpperCase();

/** Sum of USD values in { coin, amount } entries */
function sumAmount(portfolio = []) {
  return portfolio.reduce((s, p) => s + (Number(p.amount) || 0), 0);
}

/** Attach % weights based on USD values */
function withPercents(portfolio = []) {
  const total = sumAmount(portfolio) || 0;
  return portfolio.map((p) => ({
    coin: p.coin,
    value: Number(p.amount) || 0,
    percent: total > 0 ? +(100 * (Number(p.amount) || 0) / total).toFixed(2) : 0,
  }));
}

/** Format USD + % (optionally include price map for display only) */
function formatPortfolioLines(pctPf = [], priceMap = null) {
  return pctPf
    .map((p) => {
      if (!priceMap) return `${p.coin}: $${p.value.toFixed(2)} (${p.percent}%)`;
      const price = Number(priceMap[p.coin]) || 0;
      return `${p.coin}: $${p.value.toFixed(2)} (${p.percent}%) @ $${price.toFixed(4)}`;
    })
    .join('\n');
}

/** Robustly classify caps; unknowns are NOT treated as small */
function classifyCaps(portfolio = [], marketCaps = {}) {
  const byCap = { large: new Set(), small: new Set(), unknown: new Set() };

  for (const p of portfolio) {
    const sym = normSym(p.coin);

    // Accept several key shapes: "SUI", "sui", or raw
    const mcapRaw =
      marketCaps[sym] ??
      marketCaps[sym.toLowerCase()] ??
      marketCaps[String(p.coin || '').toLowerCase()] ??
      marketCaps[String(p.coin || '')];

    const mcap = Number(mcapRaw);
    if (Number.isFinite(mcap)) {
      (mcap >= LARGE_CAP_THRESHOLD ? byCap.large : byCap.small).add(sym);
    } else {
      byCap.unknown.add(sym);
    }
  }

  return {
    largeCaps: Array.from(byCap.large),
    smallCaps: Array.from(byCap.small),
    unknownCaps: Array.from(byCap.unknown),
  };
}

/** Health scoring (deterministic, server-side) */
function scoreHealth(portfolioWithPercent = []) {
  const getPct = (sym) =>
    (portfolioWithPercent.find((p) => normSym(p.coin) === normSym(sym))?.percent) || 0;

  const totalMajors = getPct('ETH') + getPct('BTC');
  const ethPct = getPct('ETH');
  const btcPct = getPct('BTC');

  let score = 100;
  const reasons = [];

  // Small-cap rules require cap data; approximate: anything not BTC/ETH and < $10B would be flagged
  // BUT since we don't have caps here reliably, we let GPT list overexposed small caps.
  // We will still apply generic concentration penalties below.

  // ETH anchor
  if (ethPct < 25) { score -= 15; reasons.push('ETH below 25% Phase-2 anchor.'); }
  if (ethPct > 40) { score -= 10; reasons.push('ETH above 40% Phase-2 upper bound.'); }

  // BTC band
  if (btcPct < 10 || btcPct > 25) {
    score -= 10; reasons.push('BTC outside 10–25% band.');
  }

  // Single-name risk (non-ETH >25%)
  const bigSingles = portfolioWithPercent.filter(
    (p) => normSym(p.coin) !== 'ETH' && p.percent > 25
  );
  if (bigSingles.length) {
    score -= Math.min(20, bigSingles.length * 10);
    reasons.push('Single-name concentration >25% detected.');
  }

  // Majors underweight (ETH + BTC)
  if (totalMajors < 35) {
    score -= 10; reasons.push('ETH+BTC combined <35%.');
  }

  // Clamp
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Level mapping
  let level = 'Low';
  if (score <= 49) level = 'Critical';
  else if (score <= 69) level = 'High';
  else if (score <= 84) level = 'Medium';

  // CTA
  let callToAction = 'Portfolio looks fine for Phase 2.';
  if (level === 'Medium') callToAction = 'Tighten toward ETH/BTC targets and trim any excess single-name risk.';
  if (level === 'High') callToAction = 'This mix may underperform Phase 2 — raise ETH/BTC weight and reduce alt concentration.';
  if (level === 'Critical') callToAction = 'Rebalance now: consolidate small caps and move weight to ETH/BTC/large caps.';

  return { score, level, reasons, callToAction };
}

/* ======================
   Phase-2 policy block
====================== */
const PHASE2_POLICY = `
Phase: 2 (ETH anchor remains valid; preparing for Phase 3 but not front-running.)

Allocation Targets (Phase 2):
- ETH: 25–40% (can be near 40% if 30d momentum is strong). Do not trim ETH unless >40% and short-term momentum is cooling.
- BTC: 10–25%.
- Other large caps (each mcap ≥ $10B): collectively 20–40%; typical single-name cap ≤15%.
- Small caps / speculative (each mcap < $10B): total 0–10% — keep at most one small-cap position (≤10%). If multiple exist, consolidate to one best pick.

Momentum Interpretation (Phase 2):
- Weight 30d and 7d most. 1h/24h influences urgency only.
- Breakout: 30d ≥ +20% AND 7d ≥ +5%.
- Cooling: 30d < +10% OR (7d < 0% after a strong 30d run).

Sentiment (must be exactly one of: Strong Buy, Buy, Hold-Buy, Hold, Hold-Sell, Sell, Strong Sell):
- Strong Buy: Large-cap, underweighted vs target band, and showing breakout.
- Buy / Hold-Buy: Large-cap, improving/solid momentum, below target mid.
- Hold: Within target band, mixed/flat momentum.
- Hold-Sell: Above target upper bound OR momentum cooling.
- Sell / Strong Sell: Any coin >33% with flat/down momentum, or small caps violating the one-slot ≤10% rule.
- Never label small caps as Strong Buy in Phase 2.

Rotation Sizing (percent-based, scale to portfolio):
- Compute target range from policy. Let targetMid be the midpoint of the appropriate band for this coin.
- BaseMove = PortfolioValue × |current% − targetMid| × 0.8
- min$ floor:
    • If PortfolioValue < $5,000: min$ = max($50, 1% of PortfolioValue)
    • Else:                      min$ = max($100, 1% of PortfolioValue)
- max$ ceiling: min($25,000, 10% of this coin's current USD value)
- Urgency multiplier: ×1.8 if breakout; ×1.4 if momentum improving (but not breakout); ×1.2 default; ×0.8 if liquidity concerns (small caps).
- MoveAmount = clamp(BaseMove × urgency, min$, max$), rounded to the nearest $25.
- Never move more than 40% of a coin's USD value in a single suggestion, and never exceed 20% of total portfolio across all suggestions in one response.

Large-cap threshold: $10B market cap.`;

/* ======================
   /analysis (single coin)
====================== */
router.post('/analysis', async (req, res) => {
  const { coin, percentChanges, portfolio, marketCaps } = req.body || {};

  if (!coin || !percentChanges || !portfolio) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const sym = normSym(coin);
  const totalValue = sumAmount(portfolio);
  const portfolioWithPercent = withPercents(portfolio);

  const current = portfolioWithPercent.find((p) => normSym(p.coin) === sym);
  const coinPercent = current ? current.percent : 0;
  const coinValue = current ? current.value : 0;

  if (!current) {
    portfolioWithPercent.push({ coin: sym, value: 0, percent: 0 });
  }

  // Normalize mcap for this coin; keep "unknown" if not found
  const mcapRaw =
    marketCaps?.[sym] ??
    marketCaps?.[sym.toLowerCase()] ??
    marketCaps?.[String(coin).toLowerCase()] ??
    marketCaps?.[String(coin)];
  const mcapNum = Number(mcapRaw);
  const isLargeCap = Number.isFinite(mcapNum) ? mcapNum >= LARGE_CAP_THRESHOLD : undefined;

  const { largeCaps, smallCaps, unknownCaps } = classifyCaps(portfolio, marketCaps || {});

  const policyBlock = PHASE2_POLICY;

  const coinBlock = `Coin: ${sym}
Portfolio %: ${coinPercent}%
Value: $${coinValue}
IsLargeCap: ${isLargeCap === undefined ? 'unknown' : isLargeCap ? 'true' : 'false'}
LargeCapsInPortfolio: ${largeCaps.length ? largeCaps.join(', ') : 'none'}
SmallCapsInPortfolio: ${smallCaps.length ? smallCaps.join(', ') : 'none'}
UnknownCapsInPortfolio: ${unknownCaps.length ? unknownCaps.join(', ') : 'none'}`;

  const perfBlock = `Performance Data:
1h: ${percentChanges['1h']}%
24h: ${percentChanges['24h']}%
7d: ${percentChanges['7d']}%
30d: ${percentChanges['30d']}%
90d: ${percentChanges['90d']}%
1y: ${percentChanges['1y']}%`;

  const portfolioBlock = `Full Portfolio (USD and %):\n${formatPortfolioLines(portfolioWithPercent)}`;

  const taskBlock = `TASK:
Using the Phase-2 policy below, output strict JSON only in this format:
{
  "sentiment": "",
  "reason": "",
  "rotationSuggestion": [
    { "to": "", "amount": 0, "why": "", "source": "" }
  ],
  "urgency": ""
}
Rules:
- Respect the Phase-2 allocation targets and small-cap one-slot ≤10% rule.
- Prefer large caps. Do not front-run Phase 3 categories.
- If this coin exceeds its target or violates small-cap rule, recommend trimming (rotation OUT).
- If this coin is a large-cap and under target with decent momentum, recommend adding (rotation INTO).
- Treat caps marked "unknown" as unknown; do NOT assume they are small.
- Size any $ amounts using the Rotation Sizing formula described in the policy. PortfolioValue = ${totalValue}.
- Enforce the floors exactly as described (no amounts below the min$ after rounding). Round to the nearest $25.
- For "source", cite either "Phase-2 allocation policy" or "Over/under vs target" and mention momentum if applicable.`;

  const prompt = [policyBlock, coinBlock, perfBlock, portfolioBlock, taskBlock].join('\n\n');

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() || '{}';
    const cleaned = raw.replace(/^```json|```$/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return res.json(parsed);
  } catch (err) {
    console.error('AI analysis failed:', err);
    return res.status(500).json({ error: 'AI analysis failed' });
  }
});

/* ======================
   /analysis/portfolio
====================== */
router.post('/analysis/portfolio', async (req, res) => {
  const { portfolio, priceMap, marketCaps } = req.body || {};
  if (!portfolio || !priceMap) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const portfolioWithPercent = withPercents(portfolio);
  const totalValue = sumAmount(portfolio);
  const formatted = formatPortfolioLines(portfolioWithPercent, priceMap);

  const { largeCaps, smallCaps, unknownCaps } = classifyCaps(portfolio, marketCaps || {});

  const policyBlock = PHASE2_POLICY;
  const contextBlock = `Context:
PortfolioValue: $${totalValue}
LargeCapsDetected: ${largeCaps.length ? largeCaps.join(', ') : 'none'}
SmallCapsDetected: ${smallCaps.length ? smallCaps.join(', ') : 'none'}
UnknownCapsDetected: ${unknownCaps.length ? unknownCaps.join(', ') : 'none'}`;

  const taskBlock = `You are a portfolio analyst for a Phase-2 altseason investor.
Return ONLY valid JSON in the following format:
{
  "overexposed": [
    { "coin": "ETH", "percent": "39.6%", "reason": "Dominant position but acceptable for Phase 2." }
  ],
  "underweighted": [
    { "coin": "BTC", "percent": "8.0%", "reason": "Below Phase-2 target band for large caps." }
  ],
  "rotationMoves": [
    "Trim over-target positions (e.g., ETH >40% or single-name >25%) and consolidate small caps to one ≤10% bet; reweight BTC/ETH/large caps toward targets. Size each move via the Rotation Sizing formula."
  ],
  "strategicTake": "Phase-2 bias to large caps; maintain ETH anchor; watch for Phase-3 signals but avoid front-running."
}
Guidance:
- **Overexposed**: >40% ETH, >25% any single large cap, small caps total >10% or more than one small cap.
- **Underweighted**: BTC/ETH/large caps below their lower target bounds.
- **Unknown caps**: Flag as unknown; do not infer small. Recommend verifying market cap data before acting.
- **Rotation Moves**: Consolidate small caps into a single ≤10% slot; reweight majors to targets; size amounts using Rotation Sizing with PortfolioValue = ${totalValue}. Enforce floors (no amounts below min$). Round to $25; never exceed caps.
- **Strategic Take**: Reinforce Phase-2 stance and monitoring for Phase-3.
- Prefer large caps; do not nudge into AI/DePIN/Gaming for now.`;

  const prompt = [policyBlock, contextBlock, `User Portfolio:\n${formatted}`, taskBlock].join('\n\n');

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() || '{}';
    const cleaned = raw.replace(/^```json|```$/g, '').trim();
    const parsed = JSON.parse(cleaned);

    // === Add server-side health scoring ===
    const health = scoreHealth(portfolioWithPercent);

    return res.json({ summary: parsed, health });
  } catch (err) {
    console.error('Portfolio summary AI call failed:', err);
    return res.status(500).json({ error: 'Portfolio summary failed.' });
  }
});

export default router;
