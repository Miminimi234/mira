# MIRA - AI-Powered Prediction Market Terminal

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)

Real-time AI-powered prediction market interface with live trading analytics and neural network visualizations.

## Features

### AI Agent System
- Multiple AI models for diverse trading strategies
- Real-time decision making and market analysis
- Performance tracking and analytics

### Prediction Market Integration
- Polymarket API integration
- Real-time market data
- Category filtering and search

### Trading Interface
- Interactive bubble visualization
- Zoom and pan controls
- Real-time position tracking
- Trade execution on Solana

### Agent Builder
- 3-step wizard interface
- Strategy configuration
- Risk management settings
- Live testing and deployment

## AI Agent Decision-Making Flowchart

The following flowchart illustrates how AI agents analyze markets and make trading decisions:.

```mermaid
flowchart TD
    A[Agent Cycle Starts] --> B[Fetch Markets & News<br/>from Polymarket API]
    B --> C[Check Cache<br/>for Recent Trades]
    C -->|Cache Hit| D[Return Cached Trades]
    C -->|Cache Miss| E[Filter Candidate Markets<br/>Volume, Liquidity, Category]
    E --> F[Score Each Market<br/>Volume, Liquidity, Price, News, Probability]
    F --> G[Sort by Score<br/>Take Top Markets]
    G --> H[For Each Top Market]
    H --> I{Score >= 8?}
    I -->|No| J[Skip Market]
    I -->|Yes| K[Search Web<br/>for Market Info]
    K --> L{AI API<br/>Configured?}
    L -->|No| M[Use Deterministic<br/>Fallback Logic]
    L -->|Yes| N{Check AI Cache<br/>5min TTL}
    N -->|Cache Hit| O[Use Cached<br/>AI Decision]
    N -->|Cache Miss| P[Call AI API<br/>GPT-5, Claude, GROK, etc.]
    P --> Q[Parse AI Response<br/>Side, Confidence, Reasoning]
    Q --> R[Cache AI Decision]
    R --> S[Apply Personality Rules<br/>Agent-Specific Adjustments]
    O --> S
    M --> S
    S --> T[Calculate Position Size<br/>Based on Risk, Confidence, Score]
    T --> U[Generate Trade<br/>Side, Confidence, Investment]
    U --> V{Reached<br/>Max Trades?}
    V -->|No| H
    V -->|Yes| W[Cache All Trades<br/>30s TTL]
    W --> X[Return Trades]
    J --> V
    D --> X
```

### Flow Explanation

1. **Agent Cycle Starts**: Each agent runs its trading cycle independently
2. **Fetch Markets & News**: Agent fetches all available markets from Polymarket API and latest news articles
3. **Check Cache**: System checks if trades were recently generated (30s cache) to avoid redundant AI calls
4. **Filter Candidate Markets**: Markets are filtered by:
   - Minimum volume (agent-specific: $50k-$200k)
   - Minimum liquidity (agent-specific: $10k-$50k)
   - Category preferences (if agent has focus categories)
5. **Score Each Market**: Markets are scored using weighted components:
   - Volume score (trading activity)
   - Liquidity score (market depth)
   - Price movement score (24h change)
   - News score (recent relevant news)
   - Probability score (current market probability)
6. **Sort by Score**: Markets are sorted by total weighted score, top markets selected
7. **For Each Top Market**: Agent analyzes each high-scoring market
8. **Score Threshold Check**: Markets with score < 8 are skipped
9. **Search Web**: Agent searches the web for market-specific information to inform decision
10. **AI Decision Path**:
    - **If AI API configured**: Check AI cache (5min TTL), if miss call AI API (GPT-5, Claude, GROK, Gemini, DeepSeek, or Qwen)
    - **If AI API fails/unconfigured**: Use deterministic fallback based on market data
11. **Parse AI Response**: Extract side (YES/NO), confidence (0-1), and reasoning from AI
12. **Apply Personality Rules**: Agent-specific adjustments based on personality (risk tolerance, category preferences, etc.)
13. **Calculate Position Size**: Investment amount calculated from:
    - Base risk budget (LOW: $80, MEDIUM: $150, HIGH: $250)
    - Confidence multiplier (0.5x to 2.5x)
    - Market score multiplier (0.4x to 2.0x)
    - Personality adjustments
14. **Generate Trade**: Create trade object with side, confidence, investment, reasoning
15. **Check Max Trades**: Continue until agent reaches max trades limit (varies by agent: 3-10 trades)
16. **Cache All Trades**: Generated trades are cached for 30 seconds to avoid regeneration
17. **Return Trades**: Agent returns all generated trades for display and execution

## Tech Stack

- **Frontend:** React + TypeScript + Vite
- **Backend:** Express.js + Node.js
- **UI:** shadcn/ui + Tailwind CSS
- **Blockchain:** Solana Web3.js
- **Deployment:** Railway

## Development

### Prerequisites
- Node.js 18+
- npm

### Installation

```bash
npm install
```

### Run Development Server

Start both frontend and backend:
```bash
npm run dev:all
```

Or separately:
```bash
# Terminal 1: Backend
npm run server

# Terminal 2: Frontend
npm run dev
```

The application will be available at:
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3002`

### Build

Build for production:
```bash
npm run build
```

## Environment Variables

### Backend (Railway/Server)

Required:
- `PORT` - Server port (auto-set by Railway)
- `NODE_ENV` - Environment (production/development)

Optional:
- `REDIS_URL` - Redis connection URL for session storage (highly recommended for production)
  - **How to get:** Add Redis addon in Railway dashboard → Your Service → "+ New" → "Database" → "Add Redis"
  - Railway will automatically set this variable when you add the Redis addon
  - Without Redis, sessions are stored in memory (lost on restart, won't work across multiple instances)
- `ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins
- `CSRF_SECRET` - Secret for CSRF token generation (recommended for production)
- `SESSION_SECRET` - Secret for session management (required for Google OAuth, recommended for production)
- `GOOGLE_CLIENT_ID` - Google OAuth Client ID (required for Google login)
- `GOOGLE_CLIENT_SECRET` - Google OAuth Client Secret (required for Google login)
- `GOOGLE_CALLBACK_URL` - Google OAuth callback URL (defaults to `https://mira.tech/api/auth/google/callback` in production)
- `NEWS_API_KEY` - NewsAPI.org API key
- `NEWSDATA_API_KEY` - NewsData.io API key
- `GNEWS_API_KEY` - GNews API key
- `POLYMARKET_API_KEY` - Polymarket API key
- `POLYMARKET_SECRET` - Polymarket API secret
- `POLYMARKET_PASSPHRASE` - Polymarket API passphrase
- `SMTP_HOST` - SMTP server host
- `SMTP_PORT` - SMTP server port
- `SMTP_USER` - SMTP username
- `SMTP_PASS` - SMTP password
- `NOTIFICATION_EMAIL` - Email for waitlist notifications

### Frontend

Optional:
- `VITE_API_BASE_URL` - Custom API base URL (defaults to relative URLs in production)

## Project Structure

```
aura-predict/
├── src/
│   ├── components/     # React components
│   │   ├── ui/         # shadcn/ui components
│   │   └── ...         # Feature components
│   ├── pages/          # Page components
│   ├── hooks/          # Custom React hooks
│   ├── lib/            # Utility libraries and API clients
│   └── types/          # TypeScript type definitions
├── server/
│   ├── services/       # Business logic services
│   ├── utils/          # Utility functions
│   └── index.js        # Express server
├── public/             # Static assets
└── dist/               # Production build output
```

## Google OAuth Setup

To enable Google login:

1. **Create Google OAuth Credentials:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Enable the Google+ API
   - Go to "Credentials" → "Create Credentials" → "OAuth client ID"
   - Choose "Web application"
   - Add authorized redirect URIs:
     - Production: `https://mira.tech/api/auth/google/callback`
     - Development: `http://localhost:3002/api/auth/google/callback`

2. **Set Environment Variables:**
   ```bash
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   SESSION_SECRET=your-session-secret  # Generate with: openssl rand -base64 32
   ```

3. **Deploy:**
   - Add these variables to your Railway project settings
   - The OAuth flow will work automatically once configured

## Security

The application includes comprehensive security features:
- CSRF protection
- Rate limiting
- Input validation
- Security headers (Helmet.js)
- CORS configuration
- Error sanitization
- Google OAuth authentication
- Secure session management

## License

This project is private and proprietary.

## Contact

For inquiries about MIRA, please contact dev@mira.tech

---

**Built for the prediction market community**

