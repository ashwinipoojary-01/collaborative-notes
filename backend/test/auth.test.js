import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { ctx, setupTestServer, registerUser, auth } from './helpers.js';

setupTestServer();

describe('auth', () => {
  it('registers a user, hashes the password and returns a token', async () => {
    const res = await ctx.api
      .post('/api/auth/register')
      .send({ name: 'Alice', email: 'Alice@Example.com', password: 'password123' })
      .expect(201);
    assert.ok(res.body.token);
    assert.equal(res.body.user.email, 'alice@example.com');
    assert.equal(res.body.user.passwordHash, undefined);
    const stored = await mongoose.connection.collection('users').findOne({ email: 'alice@example.com' });
    assert.notEqual(stored.passwordHash, 'password123');
    assert.match(stored.passwordHash, /^\$2[aby]\$/);
  });

  it('validates registration input', async () => {
    const res = await ctx.api.post('/api/auth/register').send({ name: '', email: 'bad', password: '123' }).expect(400);
    assert.deepEqual(Object.keys(res.body.fields).sort(), ['email', 'name', 'password']);
  });

  it('rejects duplicate emails', async () => {
    const user = await registerUser('Dup');
    await ctx.api.post('/api/auth/register').send({ name: 'Dup2', email: user.email, password: 'password123' }).expect(409);
  });

  it('logs in with valid credentials and returns the current user', async () => {
    const user = await registerUser('Bob');
    const res = await ctx.api.post('/api/auth/login').send({ email: user.email, password: user.password }).expect(200);
    const me = await ctx.api.get('/api/auth/me').set(auth({ token: res.body.token })).expect(200);
    assert.equal(me.body.user.email, user.email);
  });

  it('rejects invalid credentials with a generic message', async () => {
    const user = await registerUser('Carol');
    const wrongPw = await ctx.api.post('/api/auth/login').send({ email: user.email, password: 'wrongpass1' }).expect(401);
    const noUser = await ctx.api.post('/api/auth/login').send({ email: 'nobody@example.com', password: 'whatever12' }).expect(401);
    assert.equal(wrongPw.body.error, noUser.body.error);
  });

  it('rejects missing or invalid tokens', async () => {
    await ctx.api.get('/api/auth/me').expect(401);
    await ctx.api.get('/api/auth/me').set('Authorization', 'Bearer not-a-token').expect(401);
    await ctx.api.get('/api/notes').expect(401);
  });
});
