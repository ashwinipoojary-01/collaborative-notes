import { useState } from 'react';
import { NavLink, Outlet, useSearchParams } from 'react-router-dom';
import { LogOut, Menu, Plus, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { SECTIONS, useCreateNote } from '../hooks/useCreateNote';
import Avatar from './Avatar';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';

function Sidebar({ onNavigate }) {
  const { user, logout } = useAuth();
  const [params] = useSearchParams();
  const current = params.get('view') || 'mine';
  const { create, creating } = useCreateNote();

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-2 pt-1"><Logo /></div>
      <button className="btn-primary w-full" onClick={create} disabled={creating}>
        <Plus className="h-4 w-4" aria-hidden /> {creating ? 'Creating…' : 'New note'}
      </button>
      <nav aria-label="Note sections" className="flex flex-col gap-1">
        {SECTIONS.map(({ key, label, icon: Icon }) => (
          <NavLink
            key={key}
            to={`/?view=${key}`}
            onClick={onNavigate}
            className={() =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                current === key
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`
            }
            aria-current={current === key ? 'page' : undefined}
          >
            <Icon className="h-4 w-4" aria-hidden /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
        <Avatar user={user} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user?.name}</p>
          <p className="truncate text-xs text-slate-500">{user?.email}</p>
        </div>
        <ThemeToggle />
        <button className="icon-btn" onClick={logout} aria-label="Log out" title="Log out">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:block">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="relative h-full w-72 bg-white shadow-pop dark:bg-slate-900">
            <button className="icon-btn absolute right-3 top-4" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X className="h-4 w-4" />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 lg:hidden">
          <button className="icon-btn" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <Logo />
        </header>
        <Outlet />
      </div>
    </div>
  );
}
