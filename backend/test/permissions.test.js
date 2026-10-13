import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ctx, setupTestServer, registerUser, auth, createNote, share } from './helpers.js';

setupTestServer();

describe('sharing and permissions', () => {
  it('notes are private by default', async () => {
    const alice = await registerUser('Alice');
    const mallory = await registerUser('Mallory');
    const note = await createNote(alice);
    await ctx.api.get(`/api/notes/${note.id}`).set(auth(mallory)).expect(404);
    await ctx.api.put(`/api/notes/${note.id}`).set(auth(mallory)).send({ title: 'pwned', baseVersion: 1 }).expect(404);
    await ctx.api.delete(`/api/notes/${note.id}`).set(auth(mallory)).expect(404);
    await ctx.api.patch(`/api/notes/${note.id}/favorite`).set(auth(mallory)).send({ favorite: true }).expect(404);
    const list = await ctx.api.get('/api/notes').set(auth(mallory)).expect(200);
    assert.equal(list.body.notes.length, 0);
  });

  it('viewer can read but cannot edit, share or delete', async () => {
    const alice = await registerUser('Alice');
    const bob = await registerUser('Bob');
    const carol = await registerUser('Carol');
    const note = await createNote(alice);
    await share(alice, note.id, bob, 'viewer').expect(201);

    const got = await ctx.api.get(`/api/notes/${note.id}`).set(auth(bob)).expect(200);
    assert.equal(got.body.note.permission, 'viewer');
    await ctx.api.put(`/api/notes/${note.id}`).set(auth(bob)).send({ title: 'nope', baseVersion: 1 }).expect(403);
    await share(bob, note.id, carol, 'viewer').expect(403);
    await ctx.api.delete(`/api/notes/${note.id}`).set(auth(bob)).expect(403);

    const shared = await ctx.api.get('/api/notes?filter=shared').set(auth(bob)).expect(200);
    assert.equal(shared.body.notes.length, 1);
    const mine = await ctx.api.get('/api/notes?filter=mine').set(auth(bob)).expect(200);
    assert.equal(mine.body.notes.length, 0);
  });

  it('editor can edit but cannot manage collaborators', async () => {
    const alice = await registerUser('Alice');
    const bob = await registerUser('Bob');
    const carol = await registerUser('Carol');
    const note = await createNote(alice);
    await share(alice, note.id, bob, 'editor').expect(201);
    await ctx.api.put(`/api/notes/${note.id}`).set(auth(bob)).send({ title: 'Edited by Bob', baseVersion: 1 }).expect(200);
    await share(bob, note.id, carol, 'viewer').expect(403);
    await ctx.api.patch(`/api/notes/${note.id}/collaborators/${bob.id}`).set(auth(bob)).send({ permission: 'viewer' }).expect(403);
  });

  it('owner can change permissions and remove collaborators', async () => {
    const alice = await registerUser('Alice');
    const bob = await registerUser('Bob');
    const note = await createNote(alice);
    await share(alice, note.id, bob, 'editor').expect(201);

    const changed = await ctx.api
      .patch(`/api/notes/${note.id}/collaborators/${bob.id}`)
      .set(auth(alice))
      .send({ permission: 'viewer' })
      .expect(200);
    assert.equal(changed.body.note.collaborators[0].permission, 'viewer');
    await ctx.api.put(`/api/notes/${note.id}`).set(auth(bob)).send({ title: 'x', baseVersion: 1 }).expect(403);

    await ctx.api.delete(`/api/notes/${note.id}/collaborators/${bob.id}`).set(auth(alice)).expect(200);
    await ctx.api.get(`/api/notes/${note.id}`).set(auth(bob)).expect(404);
  });

  it('validates share requests', async () => {
    const alice = await registerUser('Alice');
    const bob = await registerUser('Bob');
    const note = await createNote(alice);
    await ctx.api.post(`/api/notes/${note.id}/collaborators`).set(auth(alice)).send({ email: 'ghost@example.com' }).expect(404);
    await ctx.api.post(`/api/notes/${note.id}/collaborators`).set(auth(alice)).send({ email: alice.email }).expect(400);
    await share(alice, note.id, bob, 'admin').expect(400);
    await share(alice, note.id, bob, 'viewer').expect(201);
    await share(alice, note.id, bob, 'editor').expect(409);
  });
});
