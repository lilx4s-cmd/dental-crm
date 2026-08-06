'use client';

import { useMemo, useState } from 'react';
import { Check, Loader2, Plus, Tag as TagIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  MAX_TAGS_PER_RECORD,
  normaliseTagName,
  TAG_CATEGORY_LABELS,
  TAG_CATEGORY_ORDER,
  tagColorDef,
  type TagCategory,
} from '@dental-crm/shared';
import { useCreateTag, useTags, type Tag } from '@/hooks/use-tags';
import { cn } from '@/lib/utils';

/**
 * Search, tick, done — and make a new tag without leaving the flow.
 *
 * The create-inline path matters more than it looks. A vocabulary that can only be extended from a
 * settings page is a vocabulary nobody extends: the moment somebody needs "Waiting on family" is
 * the moment they are looking at the deal that is waiting on a family, and a trip to Settings and
 * back loses both the thought and the place on the board. The old tags module had no UI at all,
 * which is why the table was empty after a year.
 */
export function TagPicker({
  selectedIds,
  onToggle,
  disabled,
  /** Shown in the trigger. The bulk bar counts deals; the deal sheet does not. */
  triggerLabel = 'Tags',
  align = 'start',
  open: controlledOpen,
  onOpenChange,
}: {
  selectedIds: string[];
  onToggle: (tag: Tag, selected: boolean) => void;
  disabled?: boolean;
  triggerLabel?: string;
  align?: 'start' | 'center' | 'end';
  /** Optional. Given, the picker is controlled — the board's right-click menu opens it this way. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-8" disabled={disabled}>
          <TagIcon className="mr-1.5 h-3.5 w-3.5" />
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-72 p-0">
        <TagPickerBody selectedIds={selectedIds} onToggle={onToggle} />
      </PopoverContent>
    </Popover>
  );
}

export function TagPickerBody({
  selectedIds,
  onToggle,
}: {
  selectedIds: string[];
  onToggle: (tag: Tag, selected: boolean) => void;
}) {
  const { data: tags, isLoading } = useTags();
  const createTag = useCreateTag();
  const [search, setSearch] = useState('');

  const term = search.trim().toLowerCase();
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const matches = (tags ?? []).filter((t) => !term || t.name.toLowerCase().includes(term));

  // Grouped in the picker as well as in the list, because a flat list of thirty labels is where a
  // vocabulary stops being usable and people start inventing near-duplicates.
  const grouped = TAG_CATEGORY_ORDER.map((category) => ({
    category,
    tags: matches.filter((t) => t.category === category),
  })).filter((g) => g.tags.length > 0);

  const typed = normaliseTagName(search);
  const exists = (tags ?? []).some((t) => t.name.toLowerCase() === typed.toLowerCase());
  const canCreate = typed.length > 0 && !exists;

  const create = () => {
    createTag.mutate(
      { name: typed },
      {
        onSuccess: (tag) => {
          setSearch('');
          // Applied straight away. Someone who types a name and presses create means "put this on
          // the thing I am looking at", not "add it to the list for later".
          onToggle(tag, true);
        },
        onError: (e) => toast.error(e.message || 'Could not create that tag'),
      },
    );
  };

  return (
    <div className="flex flex-col">
      <div className="border-b p-2">
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search or create a tag…"
          className="h-8"
          aria-label="Search tags"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canCreate) {
              e.preventDefault();
              create();
            }
          }}
        />
      </div>

      <div className="max-h-64 overflow-y-auto p-1">
        {isLoading ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">Loading tags…</p>
        ) : grouped.length === 0 && !canCreate ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {tags?.length ? 'No tag matches that.' : 'No tags yet. Type a name to make the first one.'}
          </p>
        ) : (
          grouped.map(({ category, tags: group }) => (
            <div key={category} className="mb-1 last:mb-0">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {TAG_CATEGORY_LABELS[category as TagCategory]}
              </p>
              {group.map((tag) => {
                const on = selected.has(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => onToggle(tag, !on)}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                  >
                    <span
                      className={cn('h-2.5 w-2.5 shrink-0 rounded-full border', tagColorDef(tag.color).className)}
                    />
                    <span className="flex-1 truncate">{tag.name}</span>
                    {on && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      {canCreate && (
        <div className="border-t p-1">
          <button
            type="button"
            onClick={create}
            disabled={createTag.isPending}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted disabled:opacity-60"
          >
            {createTag.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Create <span className="font-medium">{typed}</span>
          </button>
        </div>
      )}

      <p className="border-t px-2 py-1.5 text-[10px] text-muted-foreground">
        Up to {MAX_TAGS_PER_RECORD} tags each — past that a tag stops narrowing anything.
      </p>
    </div>
  );
}
