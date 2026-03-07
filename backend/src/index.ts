import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import auctionsRouter from './routes/auctions';
import userRouter from './routes/user';
import { startBackgroundSync } from './sync';
import { fetchCurrentHeight } from './explorer';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// --- Middleware ---

// CORS: allow frontend origins
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL.trim()] : []),
].filter(url => url.length > 0);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, curl, health checks)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // Allow all during testnet phase for demo
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

// Security headers
app.use(helmet());

// Rate limiting: 100 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(limiter);

// Parse JSON bodies
app.use(express.json({ limit: '10kb' }));

// --- Routes ---

// Health check
app.get('/health', async (_req, res) => {
  let blockHeight = 0;
  try {
    blockHeight = await fetchCurrentHeight();
  } catch {
    // Non-critical
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    network: 'aleo-testnet',
    block_height: blockHeight,
  });
});

// API routes
app.use('/api/auctions', auctionsRouter);
app.use('/api/my', userRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// --- Start ---

// Support both standalone (npm start) and Vercel serverless
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV;

if (!isVercel) {
  app.listen(PORT, () => {
    console.log(`[server] Obscura Auction API running on http://localhost:${PORT}`);
    console.log(`[server] Health check: http://localhost:${PORT}/health`);

    // Start background on-chain sync (only in standalone mode)
    startBackgroundSync();
  });
} else {
  // On Vercel, sync runs once per cold start
  startBackgroundSync();
}

export default app;
