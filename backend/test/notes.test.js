import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ctx, setupTestServer, registerUser, auth, createNote, share } from './helpers.js';

setupTestServer();

describe('notes CRUD', () => {
  it('creates, reads, updates and lists notes', async () => {
    const alice = await registerUser('Alice');
    const note = await createNote(alice, { title: 'Groceries', content: '<p>Milk and eggs</p>' });
    assert.equal(note.version, 1);
    assert.equal(note.permission, 'owner');

    const upd = await ctx.api
      .put(`/api/notes/${note.id}`)
      .set(auth(alice))
      .send({ title: 'Groceries v2', content: '<p>Milk, eggs, bread</p>', baseVersion: 1 })
      .expect(200);
    assert.equal(upd.body.note.version, 2);
    assert.equal(upd.body.note.title, 'Groceries v2');

    const got = await ctx.api.get(`/api/notes/${note.id}`).set(auth(alice)).expect(200);
    assert.equal(got.body.note.content, '<p>Milk, eggs, bread</p>');

    const list = await ctx.api.get('/api/notes?filter=mine&q=bread').set(auth(alice)).expect(200);
    assert.equal(list.body.notes.length, 1);
    assert.match(list.body.notes[0].preview, /bread/);
  });

  it('sanitizes dangerous HTML', async () => {
    const alice = await registerUser('Alice');
    const note = await createNote(alice, { title: 'x', content: '<p onclick="evil()">hi</p><script>alert(1)</script><img src=x onerror=alert(1)>' });
    assert.equal(note.content, '<p>hi</p>');
  });

  it('sorts notes alphabetically and by date', async () => {
    const alice = await registerUser('Alice');
    await createNote(alice, { title: 'banana', content: '' });
    await createNote(alice, { title: 'Apple', content: '' });
    await createNote(alice, { title: 'cherry', content: '' });
    const alpha = await ctx.api.get('/api/notes?sort=alpha').set(auth(alice)).expect(200);
    assert.deepEqual(alpha.body.notes.map((n) => n.title), ['Apple', 'banana', 'cherry']);
    const oldest = await ctx.api.get('/api/notes?sort=oldest').set(auth(alice)).expect(200);
    assert.equal(oldest.body.notes[0].title, 'banana');
    await ctx.api.get('/api/notes?sort=bogus').set(auth(alice)).expect(400);
  });

  it('deletes notes (owner only) and returns 404 afterwards', async () => {
    const alice = await registerUser('Alice');
    const bob = await registerUser('Bob');
    const note = await createNote(alice);
    await share(alice, note.id, bob, 'editor').expect(201);
    await ctx.api.delete(`/api/notes/${note.id}`).set(auth(bob)).expect(403);
    await ctx.api.delete(`/api/notes/${note.id}`).set(auth(alice)).expect(204);
    await ctx.api.get(`/api/notes/${note.id}`).set(auth(alice)).expect(404);
  });

  it('requires baseVersion and rejects invalid ids', async () => {
    const alice = await registerUser('Alice');
    const note = await createNote(alice);
    await ctx.api.put(`/api/notes/${note.id}`).set(auth(alice)).send({ title: 'x' }).expect(400);
    await ctx.api.get('/api/notes/not-an-id').set(auth(alice)).expect(400);
  });

  it('toggles per-user favorites without bumping the version', async () => {
    const alice = await registerUser('Alice');
    const bob = await registerUser('Bob');
    const note = await createNote(alice);
    await share(alice, note.id, bob, 'viewer').expect(201);
    await ctx.api.patch(`/api/notes/${note.id}/favorite`).set(auth(bob)).send({ favorite: true }).expect(200);

    const bobFavs = await ctx.api.get('/api/notes?filter=favorites').set(auth(bob)).expect(200);
    assert.equal(bobFavs.body.notes.length, 1);
    const aliceFavs = await ctx.api.get('/api/notes?filter=favorites').set(auth(alice)).expect(200);
    assert.equal(aliceFavs.body.notes.length, 0);
    const got = await ctx.api.get(`/api/notes/${note.id}`).set(auth(alice)).expect(200);
    assert.equal(got.body.note.version, 1);

    await ctx.api.patch(`/api/notes/${note.id}/favorite`).set(auth(bob)).send({ favorite: false }).expect(200);
    const after = await ctx.api.get('/api/notes?filter=favorites').set(auth(bob)).expect(200);
    assert.equal(after.body.notes.length, 0);
  });
});

describe('version conflicts', () => {
  it('rejects a save based on a stale version with 409 and returns the latest note', async () => {
    const alice = await registerUser('Alice');
    const bob = await registerUser('Bob');
    const note = await createNote(alice, { title: 'Plan', content: '<p>v1</p>' });
    await share(alice, note.id, bob, 'editor').expect(201);

    await ctx.api.put(`/api/notes/${note.id}`).set(auth(alice)).send({ content: '<p>alice edit</p>', baseVersion: 1 }).expect(200);
    const conflict = await ctx.api
      .put(`/api/notes/${note.id}`)
      .set(auth(bob))
      .send({ content: '<p>bob edit</p>', baseVersion: 1 })
      .expect(409);
    assert.equal(conflict.body.conflict, true);
    assert.equal(conflict.body.note.version, 2);
    assert.equal(conflict.body.note.content, '<p>alice edit</p>');

    // Bob resolves the conflict explicitly by rebasing on the latest version.
    const resolved = await ctx.api
      .put(`/api/notes/${note.id}`)
      .set(auth(bob))
      .send({ content: '<p>bob edit</p>', baseVersion: 2 })
      .expect(200);
    assert.equal(resolved.body.note.version, 3);
  });

  it('only one of two concurrent saves on the same version succeeds', async () => {
    const alice = await registerUser('Alice');
    const note = await createNote(alice);
    const [a, b] = await Promise.all([
      ctx.api.put(`/api/notes/${note.id}`).set(auth(alice)).send({ content: '<p>a</p>', baseVersion: 1 }),
      ctx.api.put(`/api/notes/${note.id}`).set(auth(alice)).send({ content: '<p>b</p>', baseVersion: 1 }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  });
});
