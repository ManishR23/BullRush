# BullRush

**AI-Powered Crypto Portfolio Optimizer**  
Built with Node.js, Express, React, and the CoinGecko API

## Overview

BullRush is a full-stack crypto analytics platform that dynamically recommends optimized portfolio allocations across 60+ cryptocurrencies. By analyzing price momentum and market data, BullRush helps users rotate into high-upside tokens using real-time insights.

---

## Tech Stack

| Layer         | Tools & Frameworks                          |
|---------------|---------------------------------------------|
| Frontend      | React, Axios                                |
| Backend       | Node.js, Express, REST APIs                 |
| Data & APIs   | CoinGecko API, OpenAI API                   |

---

## Features

- **1) Live Portfolio Dashboard**  
  Allows users to enter in their portfolios and shows them a dashboard of relative value.

- **2) Recommendations for Reallocations**  
  Suggest rebalancing from low-performing into high-performing assets based on market data and alt-season phase.

- **3) Low-Latency Backend**  
  Fast API calls using CoinGecko data, served via Express and cached with memory maps.

- **4) Portfolio Summary & Grade**  
  Takes portfolio and coin weightage to determine a grade of how well portfolio is likely to perform in the coming months.

- **5) Planned OpenAI Integration**  
  Extract sentiment signals from crypto news, Reddit, and Twitter using GPT-based summarization.
---


## Local Setup

### Clone the Repo

```bash
git clone https://github.com/ManishR23/BullRush.git
cd BullRush

### Backend setup
cd backend
npm install
npm run dev

### Frontend setup
cd frontend
npm install
npm run dev

