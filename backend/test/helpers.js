import { after, before, beforeEach } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { io as ioClient } from 'socket.io-client';
import { connectDB, disconnectDB } from '../src/db.js';
import { createServer } from '../src/server.js';
import { closeSocket } from '../src/socket/index.js';

export const ctx = { server: null, url: '', api: null };

let memoryServer = null;

export function setupTestServer() {
  before(async () => {
    let uri = process.env.MONGODB_URI_TEST;
    if (!uri) {
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      memoryServer = await MongoMemoryServer.create();
      uri = memoryServer.getUri('collab-notes-test');
    }
    await connectDB(uri);
    await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
    ctx.server = createServer();
    await new Promise((resolve) => ctx.server.listen(0, resolve));
    ctx.url = `http://127.0.0.1:${ctx.server.address().port}`;
    ctx.api = request(ctx.server);
  });

  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  });

  after(async () => {
    await closeSocket();
    await new Promise((resolve) => ctx.server.close(resolve));
    await mongoose.connection.dropDatabase();
    await disconnectDB();
    if (memoryServer) await memoryServer.stop();
  });
}

let counter = 0;
export async function registerUser(name = 'User') {
  counter += 1;
  const body = { name, email: `${name.toLowerCase()}${counter}@example.com`, password: 'password123' };
  const res = await ctx.api.post('/api/auth/register').send(body).expect(201);
  return { ...res.body.user, token: res.body.token, password: body.password };
}

export const auth = (user) => ({ Authorization: `Bearer ${user.token}` });

export async function createNote(user, fields = { title: 'Test note', content: '<p>Hello</p>' }) {
  const res = await ctx.api.post('/api/notes').set(auth(user)).send(fields).expect(201);
  return res.body.note;
}

export function share(owner, noteId, invitee, permission) {
  return ctx.api.post(`/api/notes/${noteId}/collaborators`).set(auth(owner)).send({ email: invitee.email, permission });
}

export function connectSocket(token) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(ctx.url, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => {
      socket.close();
      reject(err);
    });
  });
}

export const emitAck = (socket, event, data) => new Promise((resolve) => socket.emit(event, data, resolve));

export function waitFor(socket, event, predicate = () => true, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeout);
    function handler(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }
    socket.on(event, handler);
  });
}

export function expectNoEvent(socket, event, ms = 300) {
  return new Promise((resolve, reject) => {
    const handler = () => {
      clearTimeout(timer);
      reject(new Error(`Unexpected ${event} event`));
    };
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve();
    }, ms);
    socket.once(event, handler);
  });
}
