import express from 'express'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import cors from 'cors'

import portfolioRoutes from './routes/portfolio.js'
import aiRoutes from './routes/ai.js'
import pricesRoute from './routes/prices.js';
import newsRoutes from './routes/news.js';



dotenv.config()
const app = express()

app.use(cors())
app.use(express.json())

app.use('/api/portfolio', portfolioRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api', pricesRoute);
app.use('/api/news', newsRoutes);



const PORT = process.env.PORT || 5000

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => app.listen(PORT, () => console.log(`Backend running on ${PORT}`)))
  .catch((err) => console.error(err))
