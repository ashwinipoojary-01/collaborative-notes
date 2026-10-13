import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileText, LayoutGrid, List, Plus, Search, Star, Users } from 'lucide-react';
import { notesApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { SECTIONS, useCreateNote } from '../hooks/useCreateNote';
import Avatar from '../components/Avatar';
import { timeAgo } from '../utils/format';

const SORTS = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'alpha', label: 'Alphabetical' },
];

const EMPTY = {
  mine: { icon: FileText, title: 'No notes yet', text: 'Create your first note to get started.' },
  shared: { icon: Users, title: 'Nothing shared with you', text: 'Notes other people share with you will appear here.' },
  favorites: { icon: Star, title: 'No favorites', text: 'Star a note to pin it here for quick access.' },
};

function FavoriteButton({ note, onToggle }) {
  return (
    <button
      className={`icon-btn h-8 w-8 ${note.isFavorite ? 'text-amber-500 hover:text-amber-600' : ''}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle(note);
      }}
      aria-label={note.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      aria-pressed={note.isFavorite}
    >
      <Star className="h-4 w-4" fill={note.isFavorite ? 'currentColor' : 'none'} />
    </button>
  );
}

function OwnerLine({ note, me }) {
  const mine = note.owner.id === me.id;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Avatar user={note.owner} size="sm" />
      <span className="truncate">{mine ? 'You' : note.owner.name}</span>
    </span>
  );
}

function Badges({ note }) {
  return (
    <>
      {note.permission !== 'owner' && (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {note.permission}
        </span>
      )}
      {note.permission === 'owner' && note.collaboratorCount > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
          <Users className="h-3 w-3" aria-hidden /> Shared
        </span>
      )}
    </>
  );
}

function NoteCard({ note, me, onToggleFavorite }) {
  return (
    <Link
      to={`/notes/${note.id}`}
      className="card group flex h-48 flex-col p-4 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md dark:hover:border-slate-700"
    >
      <div className="flex items-start gap-2">
        <h3 className="line-clamp-2 flex-1 font-semibold leading-snug">{note.title || 'Untitled'}</h3>
        <FavoriteButton note={note} onToggle={onToggleFavorite} />
      </div>
      <p className="mt-1 line-clamp-3 flex-1 text-sm text-slate-500 dark:text-slate-400">{note.preview || 'No content yet'}</p>
      <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
        <OwnerLine note={note} me={me} />
        <Badges note={note} />
        <span className="ml-auto shrink-0" title={new Date(note.updatedAt).toLocaleString()}>{timeAgo(note.updatedAt)}</span>
      </div>
    </Link>
  );
}

function NoteRow({ note, me, onToggleFavorite }) {
  return (
    <Link
      to={`/notes/${note.id}`}
      className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
    >
      <FileText className="hidden h-4 w-4 shrink-0 text-slate-400 sm:block" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-medium">{note.title || 'Untitled'}</h3>
          <Badges note={note} />
        </div>
        <p className="truncate text-sm text-slate-500 dark:text-slate-400">{note.preview || 'No content yet'}</p>
      </div>
      <div className="hidden w-36 text-xs text-slate-500 md:block"><OwnerLine note={note} me={me} /></div>
      <span className="hidden w-24 shrink-0 text-right text-xs text-slate-500 sm:block" title={new Date(note.updatedAt).toLocaleString()}>
        {timeAgo(note.updatedAt)}
      </span>
      <FavoriteButton note={note} onToggle={onToggleFavorite} />
    </Link>
  );
}

function Skeleton({ layout }) {
  return layout === 'grid' ? (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading notes">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card h-48 animate-pulse p-4">
          <div className="h-4 w-2/3 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="mt-4 space-y-2">
            <div className="h-3 rounded bg-slate-100 dark:bg-slate-800" />
            <div className="h-3 w-5/6 rounded bg-slate-100 dark:bg-slate-800" />
          </div>
        </div>
      ))}
    </div>
  ) : (
    <div className="card divide-y divide-slate-100 dark:divide-slate-800" aria-busy="true" aria-label="Loading notes">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="animate-pulse px-4 py-4">
          <div className="h-4 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="mt-2 h-3 w-2/3 rounded bg-slate-100 dark:bg-slate-800" />
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const toast = useToast();
  const { create, creating } = useCreateNote();
  const [params, setParams] = useSearchParams();
  const view = SECTIONS.some((s) => s.key === params.get('view')) ? params.get('view') : 'mine';
  const sort = SORTS.some((s) => s.value === params.get('sort')) ? params.get('sort') : 'updated';
  const [search, setSearch] = useState(params.get('q') || '');
  const [debounced, setDebounced] = useState(search);
  const [layout, setLayout] = useState(() => localStorage.getItem('layout') || 'grid');
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => localStorage.setItem('layout', layout), [layout]);

  const updateParam = useCallback(
    (key, value) =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  useEffect(() => {
    updateParam('q', debounced);
  }, [debounced, updateParam]);

  const load = useCallback(
    async (signal) => {
      setError('');
      try {
        const data = await notesApi.list({ filter: view, sort, ...(debounced ? { q: debounced } : {}) }, signal);
        setNotes(data.notes);
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [view, sort, debounced],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const toggleFavorite = async (note) => {
    const next = !note.isFavorite;
    setNotes((ns) => (view === 'favorites' && !next ? ns.filter((n) => n.id !== note.id) : ns.map((n) => (n.id === note.id ? { ...n, isFavorite: next } : n))));
    try {
      await notesApi.favorite(note.id, next);
      toast.success(next ? 'Added to favorites' : 'Removed from favorites');
    } catch (err) {
      toast.error(err.message);
      load();
    }
  };

  const section = SECTIONS.find((s) => s.key === view);
  const empty = EMPTY[view];
  const EmptyIcon = empty.icon;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{section.label}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {loading ? 'Loading…' : `${notes.length} note${notes.length === 1 ? '' : 's'}${debounced ? ` matching “${debounced}”` : ''}`}
          </p>
        </div>
        <button className="btn-primary" onClick={create} disabled={creating}>
          <Plus className="h-4 w-4" aria-hidden /> Create note
        </button>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            className="input pl-9"
            placeholder="Search notes by title or content…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search notes"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="sort" className="sr-only">Sort notes</label>
          <select id="sort" className="input w-auto" value={sort} onChange={(e) => updateParam('sort', e.target.value === 'updated' ? '' : e.target.value)}>
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900" role="group" aria-label="Layout">
            {[
              { key: 'grid', icon: LayoutGrid, label: 'Grid view' },
              { key: 'list', icon: List, label: 'List view' },
            ].map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setLayout(key)}
                aria-label={label}
                aria-pressed={layout === key}
                className={`rounded-md p-1.5 transition-colors ${layout === key ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="mt-6" aria-live="polite">
        {loading ? (
          <Skeleton layout={layout} />
        ) : error ? (
          <div className="card flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <button className="btn-secondary" onClick={() => { setLoading(true); load(); }}>Try again</button>
          </div>
        ) : notes.length === 0 ? (
          <div className="card flex flex-col items-center gap-2 p-12 text-center">
            <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
              {debounced ? <Search className="h-5 w-5 text-slate-400" /> : <EmptyIcon className="h-5 w-5 text-slate-400" />}
            </span>
            <h2 className="font-semibold">{debounced ? 'No matching notes' : empty.title}</h2>
            <p className="max-w-xs text-sm text-slate-500">{debounced ? 'Try a different search term.' : empty.text}</p>
            {view === 'mine' && !debounced && (
              <button className="btn-primary mt-3" onClick={create} disabled={creating}>
                <Plus className="h-4 w-4" aria-hidden /> Create note
              </button>
            )}
          </div>
        ) : layout === 'grid' ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {notes.map((n) => <NoteCard key={n.id} note={n} me={user} onToggleFavorite={toggleFavorite} />)}
          </div>
        ) : (
          <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-slate-800">
            {notes.map((n) => <NoteRow key={n.id} note={n} me={user} onToggleFavorite={toggleFavorite} />)}
          </div>
        )}
      </section>
    </main>
  );
}
