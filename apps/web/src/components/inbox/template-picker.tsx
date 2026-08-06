'use client';

import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useMessageTemplates, useRenderMessageTemplate } from '@/hooks/use-message-templates';

/**
 * Canned replies, filled in for whoever is on the other end.
 *
 * The substitution happens on the server, so the clinic name comes from settings rather than from
 * whatever this browser last cached, and the rules exist once.
 *
 * Inserted into the composer rather than sent. A template is a starting point — the coordinator
 * almost always adds a line about this particular patient — and a picker that sent immediately
 * would make that impossible without an undo nobody would reach in time.
 */
export function TemplatePicker({
  recipient,
  onInsert,
  disabled,
}: {
  recipient: { firstName?: string | null; lastName?: string | null } | null;
  onInsert: (body: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data: templates, isLoading } = useMessageTemplates();
  const render = useRenderMessageTemplate();

  const term = search.trim().toLowerCase();
  const matches = (templates ?? []).filter(
    (t) =>
      !term ||
      t.title.toLowerCase().includes(term) ||
      t.category?.toLowerCase().includes(term) ||
      // The body too: people remember the wording of a template long before its title.
      t.body.toLowerCase().includes(term),
  );

  const insert = (id: string) => {
    render.mutate(
      { id, firstName: recipient?.firstName, lastName: recipient?.lastName },
      {
        onSuccess: ({ body }) => {
          onInsert(body);
          setOpen(false);
          setSearch('');
        },
        onError: (e) => toast.error(e.message || 'Could not load that template'),
      },
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="outline"
          disabled={disabled}
          aria-label="Insert a saved reply"
          title="Insert a saved reply"
        >
          <FileText className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-80 p-0">
        <div className="border-b p-2">
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search saved replies…"
            aria-label="Search templates"
            className="h-8"
          />
        </div>

        <div className="max-h-72 overflow-y-auto p-1">
          {isLoading ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : matches.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {templates?.length
                ? 'Nothing matches that.'
                : 'No saved replies yet. A manager can add them in Settings.'}
            </p>
          ) : (
            matches.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={render.isPending}
                onClick={() => insert(t.id)}
                className="flex w-full flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-muted disabled:opacity-60"
              >
                <span className="flex w-full items-center gap-2">
                  {render.isPending && render.variables?.id === t.id && (
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                  )}
                  <span className="flex-1 truncate text-sm font-medium">{t.title}</span>
                  {t.category && (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t.category}
                    </span>
                  )}
                </span>
                {/* Two lines of the body. Picking by title alone gets the wrong one often enough
                    that people stop trusting the list. */}
                <span className="line-clamp-2 text-xs text-muted-foreground">{t.body}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
