import Link from "next/link";
import ThemeToggle from "./theme-toggle";
import { useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from "@/lib/supabase-browser";

const links = [
  { href: "/", label: "Overview" },
  { href: "/inventory", label: "Inventory" },
  { href: "/manifests", label: "Manifests" },
  { href: "/jobs", label: "Jobs" },
  { href: "/vans", label: "Vans" },
  { href: "/transfers", label: "Transfers" },
  { href: "/templates", label: "Templates" },
  { href: "/reporting", label: "Reporting" },
  { href: "/settings", label: "Settings" },
  { href: '/checkout', label: 'Check-Out' },
  { href: '/checkin', label: 'Check-In' },
];

const sb = supabaseBrowser();

export function Sidebar({ user, role }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const isAdmin = ['admin', 'sysadmin'].includes(role);
  const displayName = user?.name || user?.email || 'User';
  const displayRole = role || 'Admin';

  function initialsFromName(name) {
    const n = (name || '').trim();
    if (!n) return 'U';
    const parts = n.split(/\s+/).slice(0, 2);
    return parts.map(p => p[0]?.toUpperCase() || '').join('') || 'U';
  }

  return (
    <aside className="h-dvh w-64 fixed border-r bg-white dark:bg-neutral-900 dark:border-neutral-800 p-4 flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div className="font-bold text-xl">LoadOut</div>
        <ThemeToggle />
      </div>
      <div className="h-px bg-border mb-4 light:bg-neutral-600 dark:bg-gray-200" />
      <nav className="space-y-1 mb-6 flex-1 overflow-auto">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="block px-3 py-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="h-px bg-border mb-3 light:bg-neutral-600 dark:bg-gray-200" />

      <div className="mt-auto relative" ref={menuRef}>
        <button
          className="flex items-center gap-3 rounded px-2 py-1 hover:bg-muted/30"
          onClick={() => setOpen(v => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="h-10 w-10 rounded-full bg-white dark:bg-neutral-100 text-black flex items-center justify-center font-semibold">
              {initialsFromName(displayName)}
            </div>
            {/* Name + Role */}
            <div className="flex flex-col items-start leading-tight">
              <span className="text-sm font-medium text-foreground max-w-[14rem] truncate">{displayName}</span>
              <span className="text-xs text-muted capitalize">{displayRole}</span>
            </div>
            {/* Caret */}
            <span
              aria-hidden
              className={`text-muted select-none transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            >
              ▾
            </span>
          </div>
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 bottom-full mb-2 w-56 rounded-md border border-border bg-background shadow-lg overflow-hidden z-50"
          >
            <div className="px-3 py-2">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-tertiary/20 text-tertiary flex items-center justify-center font-semibold">
                  {initialsFromName(displayName)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{displayName}</div>
                  <div className="text-xs text-muted capitalize truncate">{displayRole}</div>
                </div>
              </div>
            </div>
            <div className="h-px bg-border light:bg-neutral-600 dark:bg-gray-200"  />
            <button
              onClick={async () => {
                await sb.auth.signOut();
                window.location.href = '/signin';
              }}
              className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted/30 hover:pointer"
              role="menuitem"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
