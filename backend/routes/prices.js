// backend/routes/prices.js
import express from 'express';
import axios from 'axios';

const router = express.Router();
const cache = new Map();

router.get('/prices', async (req, res) => {
  const idsParam = req.query.ids;
  if (!idsParam) {
    return res.status(400).json({ error: 'Missing ids parameter' });
  }

  const idsArray = [...new Set(idsParam.split(','))];
  const freshData = {};
  const now = Date.now();

  const idsToFetch = idsArray.filter(id => {
    const cached = cache.get(id);
    return !cached || now - cached.timestamp > 60000; // 60s cache
  });

  try {
    if (idsToFetch.length > 0) {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${idsToFetch.join(',')}&vs_currencies=usd`;
      const response = await axios.get(url);

      for (const id of Object.keys(response.data)) {
        cache.set(id, {
          timestamp: now,
          data: response.data[id],
        });
      }
    }

    idsArray.forEach(id => {
      const cached = cache.get(id);
      if (cached) {
        freshData[id] = cached.data;
      }
    });

    res.json(freshData);
  } catch (err) {
    console.error('Price fetch failed:', err.message);
    res.status(500).json({ error: 'Failed to fetch prices' });
  }
});

export default router;
