import 'dotenv/config';

const isTest = process.env.NODE_ENV === 'test';

if (!process.env.JWT_SECRET && !isTest) {
  throw new Error('JWT_SECRET environment variable is required');
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  isTest,
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/collaborative-notes',
  jwtSecret: process.env.JWT_SECRET || 'test-only-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX) || (isTest ? 1000 : 20),
  serveFrontend: process.env.SERVE_FRONTEND === 'true',
};
