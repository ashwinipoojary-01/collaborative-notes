import mongoose from 'mongoose';
import { HttpError } from './httpError.js';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PERMISSIONS = ['viewer', 'editor'];
export const MAX_TITLE = 200;
export const MAX_CONTENT = 500_000;

export function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export function assertObjectId(id, label = 'id') {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(400, `Invalid ${label}`);
}

export function validateNoteFields(body, { partial = false } = {}) {
  const out = {};
  if (body.title !== undefined) {
    if (typeof body.title !== 'string') throw new HttpError(400, 'Title must be a string');
    const title = body.title.trim();
    if (title.length > MAX_TITLE) throw new HttpError(400, `Title must be at most ${MAX_TITLE} characters`);
    out.title = title;
  } else if (!partial) {
    out.title = '';
  }
  if (body.content !== undefined) {
    if (typeof body.content !== 'string') throw new HttpError(400, 'Content must be a string');
    if (body.content.length > MAX_CONTENT) throw new HttpError(413, 'Content is too large');
    out.content = body.content;
  } else if (!partial) {
    out.content = '';
  }
  return out;
}
