import { Server } from 'socket.io';
import mongoose from 'mongoose';
import { Note } from '../models/Note.js';
import { User } from '../models/User.js';
import { verifyToken } from '../utils/token.js';
import { getPermission, canView } from '../utils/access.js';

let io = null;
// noteId -> Map<socketId, { id, name, permission }>
const presence = new Map();

const room = (noteId) => `note:${noteId}`;

function presenceList(noteId) {
  const sockets = presence.get(noteId.toString());
  if (!sockets) return [];
  const byUser = new Map();
  for (const p of sockets.values()) byUser.set(p.id, p);
  return [...byUser.values()];
}

function broadcastPresence(noteId) {
  io?.to(room(noteId)).emit('presence:update', { noteId: noteId.toString(), users: presenceList(noteId) });
}

function leaveNote(socket, noteId) {
  const key = noteId.toString();
  socket.leave(room(key));
  const sockets = presence.get(key);
  if (sockets?.delete(socket.id)) {
    if (sockets.size === 0) presence.delete(key);
    broadcastPresence(key);
  }
  socket.data.notes?.delete(key);
}

export function emitToNote(noteId, event, payload, exceptSocketId) {
  if (!io) return;
  let target = io.to(room(noteId));
  if (exceptSocketId) target = target.except(exceptSocketId);
  target.emit(event, payload);
}

export async function revokeUserFromNote(noteId, userId) {
  if (!io) return;
  const sockets = await io.in(room(noteId)).fetchSockets();
  for (const remote of sockets) {
    if (remote.data.user?.id === userId.toString()) {
      remote.emit('note:access-revoked', { noteId: noteId.toString() });
      const local = io.sockets.sockets.get(remote.id);
      if (local) leaveNote(local, noteId);
      else remote.leave(room(noteId));
    }
  }
}

export function initSocket(httpServer, { origins }) {
  io = new Server(httpServer, { cors: { origin: origins, credentials: true } });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));
      const payload = verifyToken(token);
      const user = await User.findById(payload.sub);
      if (!user) return next(new Error('User not found'));
      socket.data.user = { id: user._id.toString(), name: user.name };
      socket.data.notes = new Set();
      return next();
    } catch {
      return next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('note:join', async (data, ack = () => {}) => {
      try {
        const noteId = data?.noteId;
        if (!mongoose.isValidObjectId(noteId)) return ack({ ok: false, error: 'Invalid note id' });
        const note = await Note.findById(noteId).select('owner collaborators');
        const permission = getPermission(note, socket.data.user.id);
        if (!canView(permission)) return ack({ ok: false, error: 'Note not found or access denied' });
        const key = noteId.toString();
        socket.join(room(key));
        socket.data.notes.add(key);
        if (!presence.has(key)) presence.set(key, new Map());
        presence.get(key).set(socket.id, { ...socket.data.user, permission });
        ack({ ok: true, permission, users: presenceList(key) });
        broadcastPresence(key);
      } catch {
        ack({ ok: false, error: 'Could not join note' });
      }
    });

    socket.on('note:leave', (data) => {
      if (data?.noteId) leaveNote(socket, data.noteId);
    });

    socket.on('disconnect', () => {
      for (const noteId of [...(socket.data.notes || [])]) leaveNote(socket, noteId);
    });
  });

  return io;
}

export async function closeSocket() {
  if (io) {
    await new Promise((resolve) => io.close(() => resolve()));
    io = null;
    presence.clear();
  }
}
