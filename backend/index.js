import express from 'express'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import cors from 'cors'

import portfolioRoutes from './routes/portfolio.js'
//import aiRoutes from './routes/ai.js'

dotenv.config()
const app = express()

app.use(cors())
app.use(express.json())

app.use('/api/portfolio', portfolioRoutes)
//app.use('/api/ai', aiRoutes)

const PORT = process.env.PORT || 5000

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => app.listen(PORT, () => console.log(`Backend running on ${PORT}`)))
  .catch((err) => console.error(err))
