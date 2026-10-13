import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import {
  AlertTriangle, ArrowLeft, Check, CloudOff, Eye, Loader2, Share2, Star, Trash2, WifiOff,
} from 'lucide-react';
import { notesApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import EditorToolbar from '../components/EditorToolbar';
import ShareModal from '../components/ShareModal';
import ConflictModal from '../components/ConflictModal';
import { ConfirmModal } from '../components/Modal';
import Avatar from '../components/Avatar';
import ThemeToggle from '../components/ThemeToggle';
import { FullPageSpinner } from '../components/Spinner';
import { countWords, timeAgo } from '../utils/format';

const SAVE_DEBOUNCE_MS = 800;

function SaveStatus({ status, onRetry }) {
  const map = {
    saved: { icon: <Check className="h-3.5 w-3.5" />, text: 'Saved', cls: 'text-emerald-600 dark:text-emerald-400' },
    unsaved: { icon: <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />, text: 'Unsaved changes', cls: 'text-slate-500' },
    saving: { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, text: 'Saving…', cls: 'text-slate-500' },
    error: { icon: <CloudOff className="h-3.5 w-3.5" />, text: 'Error saving', cls: 'text-red-600' },
    conflict: { icon: <AlertTriangle className="h-3.5 w-3.5" />, text: 'Conflict', cls: 'text-amber-600' },
  };
  const s = map[status];
  return (
    <span className={`flex items-center gap-1.5 text-xs font-medium ${s.cls}`} role="status" aria-live="polite">
      {s.icon}
      {s.text}
      {status === 'error' && (
        <button className="ml-1 underline hover:no-underline" onClick={onRetry}>Retry</button>
      )}
    </span>
  );
}

export default function NoteEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { socket, connected } = useSocket();
  const toast = useToast();

  const [note, setNote] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('saved');
  const [conflict, setConflict] = useState(null);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [presence, setPresence] = useState([]);
  const [wordCount, setWordCount] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [lastRemote, setLastRemote] = useState(null);

  const versionRef = useRef(1);
  const titleRef = useRef('');
  const contentRef = useRef('');
  const dirtyRef = useRef(false);
  const savedRef = useRef({ title: '', content: '' });
  const savingRef = useRef(false);
  const conflictRef = useRef(null);
  const pendingRemoteRef = useRef(null);
  const applyingRemoteRef = useRef(false);
  const timerRef = useRef(null);
  const titleInputRef = useRef(null);
  const saveRef = useRef(() => {});
  const markDirtyRef = useRef(() => {});

  const canEdit = note?.permission === 'owner' || note?.permission === 'editor';
  const isOwner = note?.permission === 'owner';

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
    ],
    content: '',
    editable: false,
    immediatelyRender: true,
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { 'aria-label': 'Note content', class: 'focus:outline-none' } },
    onUpdate: ({ editor: ed }) => {
      contentRef.current = ed.getHTML();
      setWordCount(countWords(ed.getText()));
      if (!applyingRemoteRef.current) markDirtyRef.current();
    },
  });

  const applyRemote = useCallback(
    (remote) => {
      if (editor) {
        applyingRemoteRef.current = true;
        const { from, to } = editor.state.selection;
        editor.commands.setContent(remote.content || '', { emitUpdate: false });
        const max = editor.state.doc.content.size;
        if (editor.isFocused) editor.commands.setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) });
        applyingRemoteRef.current = false;
        setWordCount(countWords(editor.getText()));
      }
      contentRef.current = remote.content || '';
      titleRef.current = remote.title || '';
      setTitle(remote.title || '');
      versionRef.current = remote.version;
      savedRef.current = { title: remote.title || '', content: remote.content || '' };
      dirtyRef.current = false;
      setNote((n) => (n ? { ...n, version: remote.version, updatedAt: remote.updatedAt || n.updatedAt } : n));
      setStatus('saved');
    },
    [editor],
  );

  const openConflict = useCallback((remote) => {
    clearTimeout(timerRef.current);
    if (conflictRef.current && conflictRef.current.version >= remote.version) return;
    conflictRef.current = remote;
    setConflict(remote);
    setStatus('conflict');
  }, []);

  const handleRemote = useCallback(
    (remote) => {
      if (remote.version <= versionRef.current) return;
      if (savingRef.current) {
        pendingRemoteRef.current = remote;
        return;
      }
      if (dirtyRef.current) openConflict(remote);
      else {
        applyRemote(remote);
        if (remote.updatedBy) setLastRemote({ name: remote.updatedBy.name, at: Date.now() });
      }
    },
    [applyRemote, openConflict],
  );

  const save = useCallback(async () => {
    clearTimeout(timerRef.current);
    if (conflictRef.current || !dirtyRef.current || savingRef.current) return;
    if (titleRef.current === savedRef.current.title && contentRef.current === savedRef.current.content) {
      dirtyRef.current = false;
      setStatus('saved');
      return;
    }
    const snapshot = { title: titleRef.current, content: contentRef.current };
    savingRef.current = true;
    dirtyRef.current = false;
    setStatus('saving');
    let ok = false;
    try {
      const { note: saved } = await notesApi.update(id, {
        title: titleRef.current,
        content: contentRef.current,
        baseVersion: versionRef.current,
      });
      versionRef.current = saved.version;
      savedRef.current = snapshot;
      setNote((n) => (n ? { ...n, version: saved.version, updatedAt: saved.updatedAt } : n));
      ok = true;
    } catch (err) {
      dirtyRef.current = true;
      if (err.status === 409 && err.body?.note) {
        const latest = err.body.note;
        openConflict({ ...latest, updatedBy: latest.lastEditedBy });
      } else if (err.status === 403) {
        setStatus('error');
        toast.error('You no longer have permission to edit this note');
        notesApi.get(id).then((d) => setNote(d.note)).catch(() => {});
      } else if (err.status === 404) {
        toast.error('This note no longer exists or you lost access');
        navigate('/', { replace: true });
      } else {
        setStatus('error');
      }
    } finally {
      savingRef.current = false;
    }

    const remote = pendingRemoteRef.current;
    pendingRemoteRef.current = null;
    if (remote && remote.version > versionRef.current) {
      if (dirtyRef.current) openConflict(remote);
      else applyRemote(remote);
    }
    if (ok && !conflictRef.current) {
      if (dirtyRef.current) {
        setStatus('unsaved');
        timerRef.current = setTimeout(() => saveRef.current(), SAVE_DEBOUNCE_MS);
      } else setStatus('saved');
    }
  }, [id, navigate, toast, openConflict, applyRemote]);

  useEffect(() => {
    saveRef.current = save;
    markDirtyRef.current = () => {
      dirtyRef.current = true;
      if (conflictRef.current) return;
      setStatus((s) => (s === 'saving' ? s : 'unsaved'));
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => saveRef.current(), SAVE_DEBOUNCE_MS);
    };
  }, [save]);

  // Load the note
  useEffect(() => {
    if (!editor) return undefined;
    let cancelled = false;
    setNote(null);
    setLoadError('');
    notesApi
      .get(id)
      .then(({ note: n }) => {
        if (cancelled) return;
        applyingRemoteRef.current = true;
        editor.commands.setContent(n.content || '', { emitUpdate: false });
        applyingRemoteRef.current = false;
        contentRef.current = n.content || '';
        titleRef.current = n.title;
        versionRef.current = n.version;
        savedRef.current = { title: n.title, content: n.content || '' };
        dirtyRef.current = false;
        conflictRef.current = null;
        setConflict(null);
        setTitle(n.title);
        setWordCount(countWords(editor.getText()));
        setStatus('saved');
        setNote(n);
      })
      .catch((err) => !cancelled && setLoadError(err.status === 404 ? 'This note does not exist or you do not have access to it.' : err.message));
    return () => {
      cancelled = true;
    };
  }, [id, editor]);

  useEffect(() => {
    if (editor && note) editor.setEditable(canEdit, false);
  }, [editor, note, canEdit]);

  useEffect(() => {
    if (note && location.state?.isNew && titleInputRef.current) titleInputRef.current.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(note)]);

  // Real-time collaboration
  const loaded = Boolean(note);
  useEffect(() => {
    if (!socket || !loaded) return undefined;

    const resync = async () => {
      try {
        const { note: latest } = await notesApi.get(id);
        setNote((n) => (n ? { ...n, permission: latest.permission, collaborators: latest.collaborators } : n));
        handleRemote({ ...latest, updatedBy: latest.lastEditedBy });
      } catch {
        /* handled by access-revoked / deleted events */
      }
    };

    let firstJoin = true;
    const join = () => {
      socket.emit('note:join', { noteId: id }, (res) => {
        if (!res?.ok) {
          toast.error(res?.error || 'Could not join live session');
          return;
        }
        setPresence(res.users);
        if (!firstJoin) resync();
        firstJoin = false;
      });
    };

    const onUpdated = (p) => p.noteId === id && handleRemote(p);
    const onPresence = (p) => p.noteId === id && setPresence(p.users);
    const onCollaborators = (p) => p.noteId === id && setNote((n) => (n ? { ...n, collaborators: p.collaborators } : n));
    const onPermission = (p) => {
      if (p.noteId !== id || p.userId !== user.id) return;
      setNote((n) => (n ? { ...n, permission: p.permission } : n));
      toast.info(p.permission === 'editor' ? 'You can now edit this note' : 'Your access was changed to view-only');
    };
    const onRevoked = (p) => {
      if (p.noteId !== id) return;
      dirtyRef.current = false;
      toast.error('Your access to this note was removed');
      navigate('/', { replace: true });
    };
    const onDeleted = (p) => {
      if (p.noteId !== id) return;
      dirtyRef.current = false;
      toast.error(`This note was deleted by ${p.by || 'its owner'}`);
      navigate('/', { replace: true });
    };

    if (socket.connected) join();
    socket.on('connect', join);
    socket.on('note:updated', onUpdated);
    socket.on('presence:update', onPresence);
    socket.on('note:collaborators', onCollaborators);
    socket.on('note:permission-changed', onPermission);
    socket.on('note:access-revoked', onRevoked);
    socket.on('note:deleted', onDeleted);
    return () => {
      socket.emit('note:leave', { noteId: id });
      socket.off('connect', join);
      socket.off('note:updated', onUpdated);
      socket.off('presence:update', onPresence);
      socket.off('note:collaborators', onCollaborators);
      socket.off('note:permission-changed', onPermission);
      socket.off('note:access-revoked', onRevoked);
      socket.off('note:deleted', onDeleted);
      setPresence([]);
    };
  }, [socket, loaded, id, user.id, handleRemote, navigate, toast]);

  // Unsaved-change protection
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (dirtyRef.current || savingRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      // Flush pending edits when navigating away inside the app.
      if (dirtyRef.current && !conflictRef.current && !savingRef.current) saveRef.current();
      clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!lastRemote) return undefined;
    const t = setTimeout(() => setLastRemote(null), 4000);
    return () => clearTimeout(t);
  }, [lastRemote]);

  const goBack = async () => {
    if (dirtyRef.current && !conflictRef.current) await saveRef.current();
    if (dirtyRef.current || savingRef.current) setLeaveOpen(true);
    else navigate('/');
  };

  const discardAndLeave = () => {
    dirtyRef.current = false;
    conflictRef.current = null;
    navigate('/');
  };

  const onTitleChange = (e) => {
    setTitle(e.target.value);
    titleRef.current = e.target.value;
    markDirtyRef.current();
  };

  const useTheirs = () => {
    const remote = conflictRef.current;
    conflictRef.current = null;
    setConflict(null);
    setConflictOpen(false);
    applyRemote(remote);
    toast.info('Loaded the latest version');
  };

  const keepMine = () => {
    versionRef.current = conflictRef.current.version;
    conflictRef.current = null;
    setConflict(null);
    setConflictOpen(false);
    dirtyRef.current = true;
    saveRef.current();
  };

  const toggleFavorite = async () => {
    const next = !note.isFavorite;
    setNote((n) => ({ ...n, isFavorite: next }));
    try {
      await notesApi.favorite(id, next);
    } catch (err) {
      setNote((n) => ({ ...n, isFavorite: !next }));
      toast.error(err.message);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await notesApi.remove(id);
      dirtyRef.current = false;
      clearTimeout(timerRef.current);
      toast.success('Note deleted');
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(err.message);
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Note unavailable</h1>
        <p className="max-w-sm text-sm text-slate-500">{loadError}</p>
        <button className="btn-secondary" onClick={() => navigate('/')}><ArrowLeft className="h-4 w-4" /> Back to dashboard</button>
      </div>
    );
  }

  const others = presence.filter((p) => p.id !== user.id);

  return (
    <div className="flex min-h-screen flex-col">
      {!note && <div className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950"><FullPageSpinner /></div>}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-2.5 sm:px-6">
          <button className="btn-ghost px-2" onClick={goBack} aria-label="Back to dashboard">
            <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Dashboard</span>
          </button>
          <div className="ml-1 hidden min-w-0 sm:block">
            {note && <SaveStatus status={status} onRetry={() => { dirtyRef.current = true; save(); }} />}
          </div>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {!connected && (
              <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300" title="Live updates paused — reconnecting">
                <WifiOff className="h-3.5 w-3.5" aria-hidden /> <span className="hidden sm:inline">Reconnecting…</span>
              </span>
            )}
            {others.length > 0 && (
              <div className="flex items-center" aria-label={`Also viewing: ${others.map((o) => o.name).join(', ')}`}>
                <div className="flex -space-x-2">
                  {others.slice(0, 4).map((p) => (
                    <span key={p.id} className="relative">
                      <Avatar user={p} ring title={`${p.name} (${p.permission}) is viewing`} />
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" aria-hidden />
                    </span>
                  ))}
                </div>
                {others.length > 4 && <span className="ml-1 text-xs text-slate-500">+{others.length - 4}</span>}
              </div>
            )}
            {note && (
              <>
                <button className="btn-secondary px-2.5 sm:px-3.5" onClick={() => setShareOpen(true)}>
                  <Share2 className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">{isOwner ? 'Share' : 'People'}</span>
                  {note.collaborators.length > 0 && <span className="rounded-full bg-slate-100 px-1.5 text-xs dark:bg-slate-800">{note.collaborators.length + 1}</span>}
                </button>
                <button
                  className={`icon-btn ${note.isFavorite ? 'text-amber-500 hover:text-amber-600' : ''}`}
                  onClick={toggleFavorite}
                  aria-pressed={note.isFavorite}
                  aria-label={note.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Star className="h-4 w-4" fill={note.isFavorite ? 'currentColor' : 'none'} />
                </button>
                {isOwner && (
                  <button className="icon-btn hover:text-red-600" onClick={() => setDeleteOpen(true)} aria-label="Delete note">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </>
            )}
            <ThemeToggle />
          </div>
        </div>
        {canEdit && (
          <div className="mx-auto max-w-5xl overflow-x-auto border-t border-slate-100 px-3 py-1.5 dark:border-slate-800 sm:px-6">
            <EditorToolbar editor={editor} />
          </div>
        )}
      </header>

      {conflict && (
        <div role="alert" className="border-b border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-200 sm:px-6">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            <span className="flex-1">
              {conflict.updatedBy?.name || 'Someone'} saved changes while you were editing. Autosave is paused until you choose a version.
            </span>
            <button className="btn-secondary py-1" onClick={() => setConflictOpen(true)}>Compare</button>
            <button className="btn-secondary py-1" onClick={useTheirs}>Use theirs</button>
            <button className="btn-primary py-1" onClick={keepMine}>Keep mine</button>
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-24 pt-8 sm:px-6 sm:pt-12">
        {note && !canEdit && (
          <p className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Eye className="h-3.5 w-3.5" aria-hidden /> View only — shared by {note.owner.name}
          </p>
        )}
        <label htmlFor="note-title" className="sr-only">Note title</label>
        <input
          id="note-title"
          ref={titleInputRef}
          className="w-full border-none bg-transparent text-3xl font-bold tracking-tight placeholder-slate-300 focus:outline-none focus:ring-0 dark:placeholder-slate-600 sm:text-4xl"
          placeholder="Untitled"
          value={title}
          onChange={onTitleChange}
          readOnly={!canEdit}
          maxLength={200}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              editor?.commands.focus('start');
            }
          }}
        />
        {note && (
          <p className="mb-6 mt-2 text-xs text-slate-500">
            {note.owner.id === user.id ? 'You' : note.owner.name} · Edited {timeAgo(note.updatedAt)} · v{note.version}
          </p>
        )}
        <EditorContent editor={editor} />
      </main>

      <footer className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2 text-xs text-slate-500 sm:px-6">
          <span className="sm:hidden">{note && <SaveStatus status={status} onRetry={() => { dirtyRef.current = true; save(); }} />}</span>
          <span className="hidden sm:inline">{lastRemote ? `Updated by ${lastRemote.name} just now` : connected ? 'Live' : 'Offline — changes will sync on reconnect'}</span>
          <span>{wordCount} word{wordCount === 1 ? '' : 's'}</span>
        </div>
      </footer>

      {note && (
        <ShareModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          note={note}
          onCollaboratorsChange={(collaborators) => setNote((n) => ({ ...n, collaborators }))}
        />
      )}
      <ConflictModal
        open={conflictOpen}
        onClose={() => setConflictOpen(false)}
        remote={conflict}
        local={{ title, content: contentRef.current }}
        onUseTheirs={useTheirs}
        onKeepMine={keepMine}
      />
      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
        busy={deleting}
        danger
        title="Delete this note?"
        message={`“${title || 'Untitled'}” will be permanently deleted for you and all collaborators. This cannot be undone.`}
        confirmLabel="Delete note"
      />
      <ConfirmModal
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        onConfirm={discardAndLeave}
        danger
        title="Leave with unsaved changes?"
        message="Some of your changes could not be saved. If you leave now they will be lost."
        confirmLabel="Discard and leave"
      />
    </div>
  );
}
