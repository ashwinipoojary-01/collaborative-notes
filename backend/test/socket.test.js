import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ctx, setupTestServer, registerUser, auth, createNote, share, connectSocket, emitAck, waitFor, expectNoEvent,
} from './helpers.js';

setupTestServer();

describe('socket.io', () => {
  it('rejects connections without a valid token', async () => {
    await assert.rejects(connectSocket(undefined), /Authentication required/);
    await assert.rejects(connectSocket('garbage'), /Invalid or expired token/);
  });

  it('prevents unauthorized users from joining private note rooms', async () => {
    const alice = await registerUser('Alice');
    const mallory = await registerUser('Mallory');
    const note = await createNote(alice);
    const socket = await connectSocket(mallory.token);
    try {
      const res = await emitAck(socket, 'note:join', { noteId: note.id });
      assert.equal(res.ok, false);
      const updated = expectNoEvent(socket, 'note:updated');
      await ctx.api.put(`/api/notes/${note.id}`).set(auth(alice)).send({ title: 'secret', baseVersion: 1 }).expect(200);
      await updated;
    } finally {
      socket.close();
    }
  });

  it('broadcasts real-time updates and presence between two users', async () => {
    const alice = await registerUser('Alice');
    const bob = await registerUser('Bob');
    const note = await createNote(alice);
    await share(alice, note.id, bob, 'editor').expect(201);

    const aSock = await connectSocket(alice.token);
    const bSock = await connectSocket(bob.token);
    try {
      const aJoin = await emitAck(aSock, 'note:join', { noteId: note.id });
      assert.equal(aJoin.ok, true);
      const presence = waitFor(aSock, 'presence:update', (p) => p.users.length === 2);
      const bJoin = await emitAck(bSock, 'note:join', { noteId: note.id });
      assert.equal(bJoin.permission, 'editor');
      const { users } = await presence;
      assert.deepEqual(users.map((u) => u.name).sort(), ['Alice', 'Bob']);

      // Alice saves; Bob receives it, Alice's own socket (sender) does not get an echo.
      const bobGets = waitFor(bSock, 'note:updated');
      const noEcho = expectNoEvent(aSock, 'note:updated');
      await ctx.api
        .put(`/api/notes/${note.id}`)
        .set(auth(alice))
        .set('x-socket-id', aSock.id)
        .send({ content: '<p>live!</p>', baseVersion: 1 })
        .expect(200);
      const evt = await bobGets;
      assert.equal(evt.content, '<p>live!</p>');
      assert.equal(evt.version, 2);
      assert.equal(evt.updatedBy.name, 'Alice');
      await noEcho;

      // Bob disconnects; Alice sees presence drop back to one user.
      const drop = waitFor(aSock, 'presence:update', (p) => p.users.length === 1);
      bSock.close();
      await drop;
    } finally {
      aSock.close();
      bSock.close();
    }
  });

  it('notifies and evicts a collaborator when their access is revoked', async () => {
    const alice = await registerUser('Alice');
    const bob = await registerUser('Bob');
    const note = await createNote(alice);
    await share(alice, note.id, bob, 'viewer').expect(201);
    const bSock = await connectSocket(bob.token);
    try {
      assert.equal((await emitAck(bSock, 'note:join', { noteId: note.id })).ok, true);
      const revoked = waitFor(bSock, 'note:access-revoked');
      await ctx.api.delete(`/api/notes/${note.id}/collaborators/${bob.id}`).set(auth(alice)).expect(200);
      await revoked;
      const noMore = expectNoEvent(bSock, 'note:updated');
      await ctx.api.put(`/api/notes/${note.id}`).set(auth(alice)).send({ title: 'after', baseVersion: 1 }).expect(200);
      await noMore;
    } finally {
      bSock.close();
    }
  });

  it('broadcasts deletion to connected collaborators', async () => {
    const alice = await registerUser('Alice');
    const bob = await registerUser('Bob');
    const note = await createNote(alice);
    await share(alice, note.id, bob, 'viewer').expect(201);
    const bSock = await connectSocket(bob.token);
    try {
      await emitAck(bSock, 'note:join', { noteId: note.id });
      const deleted = waitFor(bSock, 'note:deleted');
      await ctx.api.delete(`/api/notes/${note.id}`).set(auth(alice)).expect(204);
      assert.equal((await deleted).noteId, note.id);
    } finally {
      bSock.close();
    }
  });
});
