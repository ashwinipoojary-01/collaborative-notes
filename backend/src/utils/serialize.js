import { getPermission } from './access.js';

const person = (u) => (u && u._id ? { id: u._id.toString(), name: u.name, email: u.email } : { id: u?.toString() });

export function serializeNote(note, userId, { full = true } = {}) {
  const uid = userId.toString();
  const base = {
    id: note._id.toString(),
    title: note.title,
    preview: (note.contentText || '').slice(0, 180),
    owner: person(note.owner),
    permission: getPermission(note, uid),
    isFavorite: note.favoritedBy.some((f) => f.toString() === uid),
    version: note.version,
    collaboratorCount: note.collaborators.length,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
  if (!full) return base;
  return {
    ...base,
    content: note.content,
    lastEditedBy: note.lastEditedBy ? person(note.lastEditedBy) : null,
    collaborators: note.collaborators.map((c) => ({
      ...person(c.user),
      permission: c.permission,
      addedAt: c.addedAt,
    })),
  };
}
