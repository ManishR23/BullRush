import express from 'express';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

router.post('/analysis', async (req, res) => {
  const { coin, percentChanges, portfolio } = req.body;

  if (!coin || !percentChanges || !portfolio) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const totalValue = portfolio.reduce((sum, p) => sum + p.amount, 0);
  const portfolioWithPercent = portfolio.map(p => ({
    coin: p.coin,
    value: p.amount,
    percent: +(100 * p.amount / totalValue).toFixed(2)
  }));

  const current = portfolioWithPercent.find(p => p.coin.toUpperCase() === coin.toUpperCase());
  const coinPercent = current ? current.percent : 0;
  const coinValue = current ? current.value : 0;

  if (!current) {
    portfolioWithPercent.push({ coin, value: 0, percent: 0 });
  }

  const prompt = `GPT Decision Logic (Enforced in Prompt):
Altseason Phase: Phase 2 (ETH still dominant, approaching Phase 3)

Altseason Strategy Rules:
- Phase 2: BTC/ETH strength, early alts (AI, DePIN, L1s) start running. Favor rotation into high-beta alts showing strong momentum.
- Phase 3: Altcoin explosion. Get ahead by positioning into mid/low-cap alts showing growth. Exit overexposed majors if momentum slows.

1. Sentiment Rating (Required)
Must be exactly one of:
Strong Buy, Buy, Hold-Buy, Hold, Hold-Sell, Sell, Strong Sell

Evaluate based on:
- Price change momentum (short- and long-term)
- % weight in user’s portfolio
- Relevance in Phase 2–3 altseason dynamics

Sentiment Rules:

- Assign “Strong Buy” only if:
  - 30-day and 7-day price change BOTH > 20%
  - Coin is <25% of portfolio
  - It fits Phase 3 narrative

- Assign “Buy” or “Hold-Buy” if:
  - Moderate momentum (10–20% 30-day gain)
  - Coin is aligned with Phase 3 themes and underweight

- Assign “Hold” if:
  - Price is flat or mixed
  - Exposure is already optimal (15–25%)
  - No clear trend or direction

- Assign “Hold-Sell” if:
  - Momentum is cooling
  - Coin is >25% of portfolio OR not part of current altseason trend

- Assign “Sell” or “Strong Sell” if:
  - Coin is over 33% of portfolio AND momentum is flat/down
  - OR coin is speculative with poor momentum and no narrative fit

ETH/BTC Phase Handling:
- In **Phase 2**, ETH may remain dominant (up to 40%) if it shows strong 30-day momentum (>30%)
- Do NOT rotate out of ETH unless:
  - Portfolio share > 40%
  - AND momentum is slowing (e.g. 7-day < 5%)
- In **Phase 3**, apply stricter caps and favor alt rotation

Do NOT assign Strong Buy to BTC or ETH unless:
- They are severely underweighted (<10% of portfolio)
- And showing breakout-level momentum (>30% 7d + 30d)

2. Explanation ("reason")
Must include:
- Price trend interpretation
- Portfolio exposure effect
- Whether this coin fits Phase 2→3 narrative (AI, DePIN, L1s, Gaming, etc.)
- If the coin is speculative or legacy (e.g. XRP, XLM, LTC), label it “volatility-driven” or “legacy Phase 3”

3. Rotation Suggestions

Rotation OUT:
- Suggest rotation out if:
  - Coin is >25% and momentum is cooling
  - OR it’s a Phase 2 coin and user is rotating into Phase 3

Rotation INTO (this coin):
- Recommend rotating into this coin from cash or from overexposed majors if:
  - It’s a strong narrative coin (AI, DePIN, Gaming, L1)
  - Showing strong momentum
  - <25% of portfolio

Add More:
- Suggest "add more" only if:
  - Strong momentum and under 25% weight
  - User is tilting toward Phase 3 plays

Rotation Amount Logic:
- Rotate OUT:
  >33% of portfolio: $100–$300
  25–33%: $50–$150
  15–25%: $20–$50
  Never rotate more than 40% of coin’s USD value

- Rotate IN:
  <$500 portfolio: $10–$30
  $500–$2,000: $30–$100
  >$2,000: $100–$300

Use clean rounded amounts like $25, $50, $100.

Output format (valid JSON only):
{
  "sentiment": "",
  "reason": "",
  "rotationSuggestion": [
    { "to": "", "amount": 0, "why": "", "source": "" }
  ],
  "urgency": ""
}

Coin: ${coin.toUpperCase()}
Portfolio %: ${coinPercent}%
Value: $${coinValue}

Performance Data:
1h: ${percentChanges['1h']}%
24h: ${percentChanges['24h']}%
7d: ${percentChanges['7d']}%
30d: ${percentChanges['30d']}%
90d: ${percentChanges['90d']}%
1y: ${percentChanges['1y']}%

Full Portfolio:
${portfolioWithPercent.map(p => `${p.coin}: $${p.value} (${p.percent}%)`).join('\n')}
`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    });

    const raw = completion.choices[0].message.content.trim();
    const cleaned = raw.replace(/^```json|```$/g, '').trim();
    const parsed = JSON.parse(cleaned);
    res.json(parsed);
  } catch (err) {
    console.error('AI analysis failed:', err);
    res.status(500).json({ error: 'AI analysis failed' });
  }
});

router.post('/analysis/portfolio', async (req, res) => {
  const { portfolio, priceMap } = req.body;

  if (!portfolio || !priceMap) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const total = portfolio.reduce((sum, p) => sum + p.amount, 0);
  const portfolioWithPercent = portfolio.map(p => ({
    coin: p.coin,
    value: p.amount,
    percent: +(100 * p.amount / total).toFixed(2)
  }));

  const formatted = portfolioWithPercent.map(p => {
    const price = priceMap[p.coin] ?? 0;
    return `${p.coin}: $${p.value.toFixed(2)} (${p.percent}%) @ $${price.toFixed(4)}`;
  }).join('\n');

  const prompt = `You are a portfolio analyst for an altseason-focused crypto investor.

Altseason Phase: Phase 2 (ETH dominance valid, Phase 3 not yet active)

User Portfolio:
${formatted}

Your job:
1. Identify coins that are overexposed (too large a %)
2. Identify coins that are underweighted given altseason narrative (AI, Gaming, L1s, DePIN)
3. Recommend which coins to rotate out of and into
4. Write a summary that includes the following 4 sections:

---
**Overexposed**
- List coins that dominate the portfolio (>40% if ETH, >25% for others).
- ETH/BTC should be flagged only if Phase 3 is imminent OR if user is leaning high risk.

**Underweighted**
- List coins that have <10% allocation but fit strong Phase 3 narratives (AI, Gaming, L1s, DePIN).
- Optional: flag coins with <1% as irrelevant to performance.

**Rotation Moves**
- Suggest reallocation out of majors only if overexposed or near Phase 3
- Recommend small reallocations into AI/Gaming/L1s with momentum and narrative fit

**Strategic Take**
- Reinforce that ETH dominance is still appropriate in Phase 2.
- Encourage monitoring for Phase 3 signals
- Suggest measured risk if rotating early
- Use friendly tone: "Hold some ETH if you’re risk-averse. Rotate into AI if you want upside."

Return only valid JSON in the following format:
{
  "overexposed": [
    { "coin": "ETH", "percent": "39.6%", "reason": "Dominant position but acceptable for Phase 2." }
  ],
  "underweighted": [
    { "coin": "FET", "percent": "3.4%", "reason": "AI alt with strong narrative fit." }
  ],
  "rotationMoves": [
    "Consider trimming ETH slightly and rotating into RENDER and TAO to prep for Phase 3."
  ],
  "strategicTake": "Hold ETH as an anchor in Phase 2. If you're feeling aggressive, rotate into AI/Gaming altcoins showing early strength."
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
    });

    const raw = completion.choices[0].message.content.trim();
    const cleaned = raw.replace(/^```json|```$/g, '').trim();
    const parsed = JSON.parse(cleaned);
    res.json({ summary: parsed });
  } catch (err) {
    console.error('Portfolio summary AI call failed:', err);
    res.status(500).json({ error: 'Portfolio summary failed.' });
  }
});

export default router;
