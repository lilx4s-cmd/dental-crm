'use client';

import { LogOut, Search, User } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { CommandPalette } from './command-palette';
import { ThemeToggle } from './theme-toggle';
import { Button } from '@/components/ui/button';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  CLINIC_MANAGER: 'Clinic Manager',
  RECEPTION: 'Reception',
  SALES_CONSULTANT: 'Sales Consultant',
  DENTIST: 'Dentist',
};

export function Topbar() {
  const { user, logout } = useAuth();

  return (
    <header className="flex items-center justify-between h-16 px-6 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* A visible trigger as well as the shortcut. A keyboard-only feature is one most of the
          clinic never discovers, and the people who most need to find a patient quickly are the
          least likely to have read about Cmd+K. */}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
        className="hidden items-center gap-2 rounded-md border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted sm:flex"
      >
        <Search className="h-4 w-4" />
        <span>Search…</span>
        <kbd className="ml-2 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
          {'⌘'}K
        </kbd>
      </button>
      <div className="sm:hidden" />

      <CommandPalette />
      <div className="flex items-center gap-3">
        <ThemeToggle />
        {user && (
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium leading-none">{user.email}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{ROLE_LABELS[user.role] ?? user.role}</p>
            </div>
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
            <Button variant="ghost" size="icon" onClick={logout} aria-label="Logout">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
