import express from 'express';
import Portfolio from '../models/Portfolio.js';

const router = express.Router();

// ✅ Update or insert portfolio
router.post('/', async (req, res) => {
  try {
    const { userId, holdings } = req.body;

    const updated = await Portfolio.findOneAndUpdate(
      { userId },
      { holdings },
      { new: true, upsert: true } // 🔑 Create if not exists
    );

    res.status(200).json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save portfolio.' });
  }
});

// ✅ Fetch portfolio for dashboard
router.get('/user/:userId', async (req, res) => {
  try {
    const portfolio = await Portfolio.findOne({ userId: req.params.userId });
    if (!portfolio) return res.status(404).json({ error: 'Not found' });
    res.json(portfolio);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
