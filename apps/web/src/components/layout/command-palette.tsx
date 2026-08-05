'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Search, User, Users } from 'lucide-react';
import { canAccessRoute, type JwtPayload } from '@dental-crm/shared';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/context/auth-context';
import { useGlobalSearch, type SearchHit } from '@/hooks/use-search';
import { cn } from '@/lib/utils';

/** Where someone might want to go, rather than what they might want to find. */
const DESTINATIONS: Array<{ label: string; href: string }> = [
  { label: 'Pipeline', href: '/pipeline' },
  { label: 'My Day', href: '/my-day' },
  { label: 'Patients', href: '/patients' },
  { label: 'Appointments', href: '/appointments' },
  { label: 'Inbox', href: '/inbox' },
  { label: 'Finance', href: '/finance' },
  { label: 'Reports', href: '/reports' },
  { label: 'Campaigns', href: '/campaigns' },
  { label: 'Team', href: '/team' },
  { label: 'Settings', href: '/settings' },
];

/**
 * Cmd/Ctrl+K — find a person, or go somewhere, without touching the mouse.
 *
 * There was no global search of any kind. At a thousand leads, finding someone meant already
 * knowing which screen they were on and then filtering it, which is the largest daily friction in
 * the product and the one thing every competitor named in the brief has.
 *
 * Destinations are filtered through the same `canAccessRoute` the navigation uses, so the palette
 * never offers a page that answers 403. Records are filtered server-side by the same rules the
 * list endpoints apply — see SearchService.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const router = useRouter();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: hits, isFetching } = useGlobalSearch(term, open);

  const destinations = useMemo(() => {
    if (!user) return [];
    const q = term.trim().toLowerCase();
    return DESTINATIONS.filter(
      (d) =>
        canAccessRoute(d.href, (user as JwtPayload).role) &&
        (!q || d.label.toLowerCase().includes(q)),
    );
  }, [term, user]);

  // One flat list, because arrow keys move through what is on screen rather than through
  // categories the user did not ask to be sorted into.
  const rows = useMemo(
    () => [
      ...destinations.map((d) => ({ kind: 'route' as const, label: d.label, href: d.href })),
      ...(hits ?? []).map((h) => ({ kind: 'record' as const, hit: h })),
    ],
    [destinations, hits],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    // The topbar's visible button opens it through an event rather than a shared store: the button
    // is in a sibling component, and one custom event is less machinery than lifting this state
    // into a context every page would then carry.
    const onRequest = () => setOpen(true);

    window.addEventListener('keydown', onKey);
    window.addEventListener('open-command-palette', onRequest);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('open-command-palette', onRequest);
    };
  }, []);

  // A stale highlight after the results change would send Enter somewhere unexpected.
  useEffect(() => setHighlighted(0), [term, hits]);

  const go = (href: string) => {
    setOpen(false);
    setTerm('');
    router.push(href);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, rows.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[highlighted];
      if (row) go(row.kind === 'route' ? row.href : row.hit.href);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        {/* Present for screen readers; the input itself is the visible heading. */}
        <DialogTitle className="sr-only">Search</DialogTitle>

        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search people, or jump to a page…"
            aria-label="Search people or jump to a page"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {isFetching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
        </div>

        <div className="max-h-80 overflow-y-auto p-1">
          {rows.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {term.trim().length < 2
                ? 'Type at least two characters to search people.'
                : `Nothing matches “${term.trim()}”.`}
            </p>
          ) : (
            rows.map((row, i) => (
              <button
                key={row.kind === 'route' ? row.href : `${row.hit.type}-${row.hit.id}`}
                type="button"
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => go(row.kind === 'route' ? row.href : row.hit.href)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm transition-colors',
                  i === highlighted && 'bg-accent text-accent-foreground',
                )}
              >
                {row.kind === 'route' ? (
                  <>
                    <span className="w-4 shrink-0 text-center text-xs text-muted-foreground">→</span>
                    <span>{row.label}</span>
                  </>
                ) : (
                  <RecordRow hit={row.hit} />
                )}
              </button>
            ))
          )}
        </div>

        <div className="flex items-center gap-3 border-t px-3 py-1.5 text-[11px] text-muted-foreground">
          <span>↑↓ to move</span>
          <span>↵ to open</span>
          <span>esc to close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RecordRow({ hit }: { hit: SearchHit }) {
  const Icon = hit.type === 'patient' ? User : Users;
  return (
    <>
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{hit.title}</span>
      <span className="shrink-0 truncate text-xs capitalize text-muted-foreground">{hit.subtitle}</span>
    </>
  );
}
