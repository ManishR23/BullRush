import express from 'express';
import Portfolio from '../models/Portfolio.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// 🔄 POST /api/portfolio → Save or update user's portfolio (merge-add)
router.post('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { holdings: newHoldings } = req.body;

    const existing = await Portfolio.findOne({ userId });

    let mergedHoldings = newHoldings;

    if (existing) {
      const coinMap = new Map();

      // Load existing holdings
      for (const h of existing.holdings) {
        coinMap.set(h.coin.toUpperCase(), h.amount);
      }

      // Merge new holdings
      for (const h of newHoldings) {
        const coin = h.coin.toUpperCase();
        const newAmount = h.amount;

        if (coinMap.has(coin)) {
          // Add amount to existing
          coinMap.set(coin, coinMap.get(coin) + newAmount);
        } else {
          coinMap.set(coin, newAmount);
        }
      }

      mergedHoldings = Array.from(coinMap.entries()).map(([coin, amount]) => ({ coin, amount }));
    }

    const updated = await Portfolio.findOneAndUpdate(
      { userId },
      { holdings: mergedHoldings },
      { new: true, upsert: true }
    );

    res.status(200).json(updated);
  } catch (err) {
    console.error('Save error:', err);
    res.status(500).json({ error: 'Failed to save portfolio.' });
  }
});

// PATCH /api/portfolio/holdings
router.patch('/holdings', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { coin, amount } = req.body;

    if (!coin || typeof amount !== 'number') {
      return res.status(400).json({ error: 'coin and numeric amount are required' });
    }

    const sym = String(coin).toUpperCase();

    const pf = await Portfolio.findOne({ userId });
    if (!pf) {
      if (amount <= 0) return res.status(200).json({ holdings: [] });
      const created = await Portfolio.create({ userId, holdings: [{ coin: sym, amount }] });
      return res.json(created);
    }

    if (amount <= 0) {
      pf.holdings = (pf.holdings || []).filter(h => String(h.coin).toUpperCase() !== sym);
    } else {
      const idx = (pf.holdings || []).findIndex(h => String(h.coin).toUpperCase() === sym);
      if (idx >= 0) pf.holdings[idx].amount = amount;
      else pf.holdings.push({ coin: sym, amount });
    }

    await pf.save();
    return res.json({ holdings: pf.holdings });
  } catch (err) {
    console.error('Patch holding error:', err);
    res.status(500).json({ error: 'Failed to update holding.' });
  }
});

// DELETE /api/portfolio/holdings/:coin → Remove one coin
router.delete('/holdings/:coin', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const sym = String(req.params.coin || '').toUpperCase();

    const updated = await Portfolio.findOneAndUpdate(
      { userId },
      { $pull: { holdings: { coin: sym } } },
      { new: true }
    );

    if (!updated) return res.status(404).json({ error: 'portfolio not found' });
    res.json({ holdings: updated.holdings });
  } catch (err) {
    console.error('Delete holding error:', err);
    res.status(500).json({ error: 'Failed to delete holding.' });
  }
});

// GET /api/portfolio/user → Fetch current user's portfolio
router.get('/user', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const portfolio = await Portfolio.findOne({ userId });

    if (!portfolio) return res.status(404).json({ holdings: [] });
    res.json(portfolio);
  } catch (err) {
    console.error('Fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
