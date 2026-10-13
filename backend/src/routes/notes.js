import { Router } from 'express';
import { Note } from '../models/Note.js';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { HttpError, asyncHandler } from '../utils/httpError.js';
import { accessibleNotesQuery, canEdit, canView, getPermission } from '../utils/access.js';
import { htmlToText, sanitizeContent } from '../utils/sanitize.js';
import { EMAIL_RE, PERMISSIONS, assertObjectId, normalizeEmail, validateNoteFields } from '../utils/validate.js';
import { serializeNote } from '../utils/serialize.js';
import { emitToNote, revokeUserFromNote } from '../socket/index.js';

const router = Router();
router.use(requireAuth);

const POPULATE = [
  { path: 'owner', select: 'name email' },
  { path: 'collaborators.user', select: 'name email' },
  { path: 'lastEditedBy', select: 'name email' },
];

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function loadNote(req, { require = 'view' } = {}) {
  assertObjectId(req.params.id, 'note id');
  const note = await Note.findById(req.params.id).populate(POPULATE);
  const perm = getPermission(note, req.user._id);
  // Return 404 for both "missing" and "no access" so private note ids are not leaked.
  if (!note || !canView(perm)) throw new HttpError(404, 'Note not found');
  if (require === 'edit' && !canEdit(perm)) throw new HttpError(403, 'You have view-only access to this note');
  if (require === 'owner' && perm !== 'owner') throw new HttpError(403, 'Only the owner can perform this action');
  return note;
}

const socketIdOf = (req) => req.get('x-socket-id') || undefined;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const uid = req.user._id;
    const filter = String(req.query.filter || 'all');
    const sort = String(req.query.sort || 'updated');
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';

    const conditions = [];
    if (filter === 'mine') conditions.push({ owner: uid });
    else if (filter === 'shared') conditions.push({ 'collaborators.user': uid });
    else if (filter === 'favorites') conditions.push(accessibleNotesQuery(uid), { favoritedBy: uid });
    else if (filter === 'all') conditions.push(accessibleNotesQuery(uid));
    else throw new HttpError(400, 'filter must be one of all, mine, shared, favorites');

    if (q) {
      const re = new RegExp(escapeRegex(q), 'i');
      conditions.push({ $or: [{ title: re }, { contentText: re }] });
    }

    const sortSpec = { updated: { updatedAt: -1 }, oldest: { updatedAt: 1 }, alpha: { title: 1, updatedAt: -1 } }[sort];
    if (!sortSpec) throw new HttpError(400, 'sort must be one of updated, oldest, alpha');

    const notes = await Note.find({ $and: conditions })
      .collation({ locale: 'en', strength: 2 })
      .sort(sortSpec)
      .limit(500)
      .select('-content')
      .populate({ path: 'owner', select: 'name email' });
    res.json({ notes: notes.map((n) => serializeNote(n, uid, { full: false })) });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const fields = validateNoteFields(req.body || {});
    const content = sanitizeContent(fields.content);
    const note = await Note.create({
      title: fields.title,
      content,
      contentText: htmlToText(content),
      owner: req.user._id,
      lastEditedBy: req.user._id,
    });
    await note.populate(POPULATE);
    res.status(201).json({ note: serializeNote(note, req.user._id) });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const note = await loadNote(req);
    res.json({ note: serializeNote(note, req.user._id) });
  }),
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const note = await loadNote(req, { require: 'edit' });
    const fields = validateNoteFields(req.body || {}, { partial: true });
    if (fields.title === undefined && fields.content === undefined) {
      throw new HttpError(400, 'Nothing to update: provide title and/or content');
    }
    const baseVersion = Number(req.body.baseVersion);
    if (!Number.isInteger(baseVersion) || baseVersion < 1) {
      throw new HttpError(400, 'baseVersion (the version your edit is based on) is required');
    }

    const update = { lastEditedBy: req.user._id };
    if (fields.title !== undefined) update.title = fields.title;
    if (fields.content !== undefined) {
      update.content = sanitizeContent(fields.content);
      update.contentText = htmlToText(update.content);
    }

    // Optimistic concurrency: only apply if nobody saved since the client's base version.
    const updated = await Note.findOneAndUpdate(
      { _id: note._id, version: baseVersion },
      { $set: update, $inc: { version: 1 } },
      { returnDocument: 'after' },
    ).populate(POPULATE);

    if (!updated) {
      const current = await Note.findById(note._id).populate(POPULATE);
      if (!current) throw new HttpError(404, 'Note not found');
      throw new HttpError(409, 'This note was changed by someone else since you last loaded it', {
        conflict: true,
        note: serializeNote(current, req.user._id),
      });
    }

    const payload = serializeNote(updated, req.user._id);
    emitToNote(
      updated._id,
      'note:updated',
      {
        noteId: payload.id,
        title: payload.title,
        content: payload.content,
        version: payload.version,
        updatedAt: payload.updatedAt,
        updatedBy: { id: req.user._id.toString(), name: req.user.name },
      },
      socketIdOf(req),
    );
    res.json({ note: payload });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const note = await loadNote(req, { require: 'owner' });
    await note.deleteOne();
    emitToNote(note._id, 'note:deleted', { noteId: note._id.toString(), by: req.user.name }, socketIdOf(req));
    res.status(204).end();
  }),
);

router.patch(
  '/:id/favorite',
  asyncHandler(async (req, res) => {
    const note = await loadNote(req);
    const favorite = req.body?.favorite;
    if (typeof favorite !== 'boolean') throw new HttpError(400, 'favorite must be a boolean');
    const op = favorite ? { $addToSet: { favoritedBy: req.user._id } } : { $pull: { favoritedBy: req.user._id } };
    // Favorites are per-user metadata and must not bump the note's version or updatedAt.
    await Note.updateOne({ _id: note._id }, op, { timestamps: false });
    res.json({ noteId: note._id.toString(), isFavorite: favorite });
  }),
);

function parsePermission(value) {
  if (!PERMISSIONS.includes(value)) throw new HttpError(400, 'permission must be "viewer" or "editor"');
  return value;
}

async function respondWithCollaborators(res, noteId, userId, status = 200) {
  const fresh = await Note.findById(noteId).populate(POPULATE);
  const serialized = serializeNote(fresh, userId);
  emitToNote(noteId, 'note:collaborators', { noteId: serialized.id, collaborators: serialized.collaborators });
  res.status(status).json({ note: serialized });
}

router.post(
  '/:id/collaborators',
  asyncHandler(async (req, res) => {
    const note = await loadNote(req, { require: 'owner' });
    const email = normalizeEmail(req.body?.email);
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'A valid email is required');
    const permission = parsePermission(req.body?.permission ?? 'viewer');
    const invitee = await User.findOne({ email });
    if (!invitee) throw new HttpError(404, 'No registered user with that email');
    if (invitee._id.equals(req.user._id)) throw new HttpError(400, 'You already own this note');

    const result = await Note.updateOne(
      { _id: note._id, 'collaborators.user': { $ne: invitee._id } },
      { $push: { collaborators: { user: invitee._id, permission } } },
      { timestamps: false },
    );
    if (result.modifiedCount === 0) throw new HttpError(409, 'That user is already a collaborator');
    await respondWithCollaborators(res, note._id, req.user._id, 201);
  }),
);

router.patch(
  '/:id/collaborators/:userId',
  asyncHandler(async (req, res) => {
    const note = await loadNote(req, { require: 'owner' });
    assertObjectId(req.params.userId, 'user id');
    const permission = parsePermission(req.body?.permission);
    const result = await Note.updateOne(
      { _id: note._id, 'collaborators.user': req.params.userId },
      { $set: { 'collaborators.$.permission': permission } },
      { timestamps: false },
    );
    if (result.matchedCount === 0) throw new HttpError(404, 'Collaborator not found');
    emitToNote(note._id, 'note:permission-changed', { noteId: note._id.toString(), userId: req.params.userId, permission });
    await respondWithCollaborators(res, note._id, req.user._id);
  }),
);

router.delete(
  '/:id/collaborators/:userId',
  asyncHandler(async (req, res) => {
    const note = await loadNote(req, { require: 'owner' });
    assertObjectId(req.params.userId, 'user id');
    const result = await Note.updateOne(
      { _id: note._id },
      { $pull: { collaborators: { user: req.params.userId }, favoritedBy: req.params.userId } },
      { timestamps: false },
    );
    if (result.modifiedCount === 0) throw new HttpError(404, 'Collaborator not found');
    await revokeUserFromNote(note._id, req.params.userId);
    await respondWithCollaborators(res, note._id, req.user._id);
  }),
);

export default router;
