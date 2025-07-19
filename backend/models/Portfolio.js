// models/Portfolio.js
import mongoose from 'mongoose';

const HoldingSchema = new mongoose.Schema({
  coin: String,
  amount: Number,
});

const PortfolioSchema = new mongoose.Schema({
  userId: String, // optional if you later add auth
  holdings: [HoldingSchema],
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Portfolio', PortfolioSchema);
