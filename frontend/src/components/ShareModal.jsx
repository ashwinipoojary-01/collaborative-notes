import { useState } from 'react';
import { Trash2, UserPlus } from 'lucide-react';
import Modal from './Modal';
import Avatar from './Avatar';
import { notesApi } from '../api/client';
import { useToast } from '../context/ToastContext';

export default function ShareModal({ open, onClose, note, onCollaboratorsChange }) {
  const toast = useToast();
  const isOwner = note.permission === 'owner';
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState('editor');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState(null);

  const invite = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setError('Enter a valid email address');
      return;
    }
    setBusy(true);
    try {
      const { note: updated } = await notesApi.share(note.id, email.trim(), permission);
      onCollaboratorsChange(updated.collaborators);
      toast.success(`Shared with ${email.trim()}`);
      setEmail('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const change = async (c, next) => {
    setRowBusy(c.id);
    try {
      const { note: updated } = await notesApi.setPermission(note.id, c.id, next);
      onCollaboratorsChange(updated.collaborators);
      toast.success(`${c.name} is now ${next === 'editor' ? 'an editor' : 'a viewer'}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRowBusy(null);
    }
  };

  const remove = async (c) => {
    setRowBusy(c.id);
    try {
      const { note: updated } = await notesApi.unshare(note.id, c.id);
      onCollaboratorsChange(updated.collaborators);
      toast.success(`Removed ${c.name}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRowBusy(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isOwner ? 'Share note' : 'People with access'}>
      {isOwner && (
        <form onSubmit={invite} className="mb-5" noValidate>
          <label htmlFor="share-email" className="label">Invite by email</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="share-email"
              type="email"
              className={`input flex-1 ${error ? 'input-error' : ''}`}
              placeholder="teammate@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'share-error' : 'share-help'}
            />
            <label htmlFor="share-permission" className="sr-only">Permission</label>
            <select id="share-permission" className="input sm:w-28" value={permission} onChange={(e) => setPermission(e.target.value)}>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <button className="btn-primary" disabled={busy}>
              <UserPlus className="h-4 w-4" aria-hidden /> {busy ? 'Inviting…' : 'Invite'}
            </button>
          </div>
          {error ? (
            <p id="share-error" className="mt-1.5 text-xs text-red-600">{error}</p>
          ) : (
            <p id="share-help" className="mt-1.5 text-xs text-slate-500">The person must already have an account.</p>
          )}
        </form>
      )}

      <ul className="space-y-1" aria-label="People with access">
        <li className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Avatar user={note.owner} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{note.owner.name}</p>
            <p className="truncate text-xs text-slate-500">{note.owner.email}</p>
          </div>
          <span className="text-xs font-medium text-slate-500">Owner</span>
        </li>
        {note.collaborators.map((c) => (
          <li key={c.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50">
            <Avatar user={c} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{c.name}</p>
              <p className="truncate text-xs text-slate-500">{c.email}</p>
            </div>
            {isOwner ? (
              <>
                <label htmlFor={`perm-${c.id}`} className="sr-only">Permission for {c.name}</label>
                <select
                  id={`perm-${c.id}`}
                  className="input w-auto py-1 text-xs"
                  value={c.permission}
                  disabled={rowBusy === c.id}
                  onChange={(e) => change(c, e.target.value)}
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button className="icon-btn h-8 w-8 hover:text-red-600" onClick={() => remove(c)} disabled={rowBusy === c.id} aria-label={`Remove ${c.name}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            ) : (
              <span className="text-xs font-medium capitalize text-slate-500">{c.permission}</span>
            )}
          </li>
        ))}
        {note.collaborators.length === 0 && (
          <li className="px-2 py-3 text-sm text-slate-500">Only you can see this note. Invite someone to collaborate.</li>
        )}
      </ul>
    </Modal>
  );
}
