import dotenv from 'dotenv';
dotenv.config();

import { validateEnv } from './env';
import { logger } from './logger';

// Validate env BEFORE importing modules that depend on env vars (encryption, store)
const isVercel = process.env.VERCEL === '1' || !!process.env.VERCEL_ENV;
validateEnv();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import auctionsRouter from './routes/auctions';
import userRouter from './routes/user';
import { startBackgroundSync } from './sync';
import { fetchCurrentHeight } from './explorer';
import { getOverviewStats, getRecentActivity, getStorageType } from './store';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// --- Middleware ---

// CORS: explicit allowlist only
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
        logger.warn(`CORS blocked request from origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: false,
  })
);

// Security headers
app.use(helmet());

// Global rate limit for GET endpoints: 100 requests/min per IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(globalLimiter);

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
    storage: getStorageType(),
  });
});

// GET /api/stats/overview — aggregate platform stats
app.get('/api/stats/overview', async (_req, res) => {
  try {
    const stats = await getOverviewStats();
    res.json(stats);
  } catch (err) {
    logger.error('GET /api/stats/overview failed:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/stats/activity — recent event stream
app.get('/api/stats/activity', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
    const events = await getRecentActivity(limit);
    res.json({ events, total: events.length });
  } catch (err) {
    logger.error('GET /api/stats/activity failed:', err);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

// GET /api/health — alias for /health with storage info
app.get('/api/health', async (_req, res) => {
  let blockHeight = 0;
  try {
    blockHeight = await fetchCurrentHeight();
  } catch {
    // Non-critical
  }
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    storage: getStorageType(),
    block_height: blockHeight,
  });
});

app.use('/api/auctions', auctionsRouter);
app.use('/api/my', userRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // CORS errors return 403
  if (err.message === 'Not allowed by CORS') {
    res.status(403).json({ error: 'Origin not allowed' });
    return;
  }
  logger.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// --- Start ---

if (!isVercel) {
  app.listen(PORT, () => {
    logger.info(`Obscura Auction API running on http://localhost:${PORT}`);
    logger.info(`Health check: http://localhost:${PORT}/health`);
    startBackgroundSync();
  });
}

export default app;
