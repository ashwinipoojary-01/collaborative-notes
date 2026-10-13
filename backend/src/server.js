import http from 'node:http';
import { createApp } from './app.js';
import { initSocket } from './socket/index.js';
import { config } from './config.js';

export function createServer() {
  const app = createApp();
  const server = http.createServer(app);
  initSocket(server, { origins: config.clientOrigins });
  return server;
}
