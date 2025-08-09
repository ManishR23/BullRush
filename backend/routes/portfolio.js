import express from 'express';
import Portfolio from '../models/Portfolio.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// 🔄 POST /api/portfolio → Save or update user's portfolio
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


// 📥 GET /api/portfolio/user → Fetch current user's portfolio
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
