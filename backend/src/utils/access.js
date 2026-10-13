const idOf = (ref) => (ref && ref._id ? ref._id : ref)?.toString();

export function getPermission(note, userId) {
  const uid = userId?.toString();
  if (!note || !uid) return null;
  if (idOf(note.owner) === uid) return 'owner';
  const collab = note.collaborators.find((c) => idOf(c.user) === uid);
  return collab ? collab.permission : null;
}

export const canView = (perm) => perm === 'owner' || perm === 'editor' || perm === 'viewer';
export const canEdit = (perm) => perm === 'owner' || perm === 'editor';

export function accessibleNotesQuery(userId) {
  return { $or: [{ owner: userId }, { 'collaborators.user': userId }] };
}
