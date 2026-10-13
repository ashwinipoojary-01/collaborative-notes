import { createServer } from './server.js';
import { connectDB } from './db.js';
import { config } from './config.js';

try {
  await connectDB(config.mongoUri);
  console.log('Connected to MongoDB');
} catch (err) {
  console.error(`Failed to connect to MongoDB: ${err.message}`);
  console.error('Set MONGODB_URI in backend/.env (see .env.example). The server will not start without a database.');
  process.exit(1);
}

const server = createServer();
server.listen(config.port, () => console.log(`API listening on http://localhost:${config.port}`));

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
