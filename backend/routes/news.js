import express from 'express';
import axios from 'axios';

const router = express.Router();

router.get('/:symbol', async (req, res) => {
  const { symbol } = req.params;

  try {
    const response = await axios.get('https://cryptopanic.com/api/v1/posts/', {
    params: {
        public: 'true',
        currencies: symbol.toUpperCase(),
        auth_token: process.env.CRYPTOPANIC_API_KEY,
    },
    });


    const articles = response.data.results.map((item) => ({
    title: item.title,
    url: item.url,
    published_at: item.published_at,
    source: item.source?.title || 'Unknown',
    }));


    res.json({ articles });
  } catch (err) {
    console.error('News fetch failed:', err.message);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

export default router;
