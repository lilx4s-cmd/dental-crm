'use client';

import { X } from 'lucide-react';
import { tagColorDef, type TagColor } from '@dental-crm/shared';

import { cn } from '@/lib/utils';

/**
 * A tag, rendered the same way everywhere it appears.
 *
 * One component rather than a `<Badge>` with inline styles at each call site, because the three
 * places tags show up — the kanban card, the deal sheet and the patient record — were already
 * three different renderings of `Patient.tags` before leads had any. The colour comes from the
 * shared palette, so a tag looks the same on a card as it does in the picker that assigned it.
 */
export function TagPill({
  name,
  color,
  size = 'sm',
  onRemove,
  className,
}: {
  name: string;
  color: TagColor | string | null | undefined;
  size?: 'xs' | 'sm';
  /** When given, the pill gets a remove button. Absent means the pill is not interactive. */
  onRemove?: () => void;
  className?: string;
}) {
  const def = tagColorDef(color);

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full border font-medium',
        size === 'xs' ? 'px-1.5 py-px text-[10px]' : 'px-2 py-0.5 text-xs',
        def.className,
        className,
      )}
    >
      {/* Truncated rather than wrapped: a card is a fixed width and a two-line tag pushes the
          next-action line out of view, which is the line the card exists for. The title attribute
          keeps the full name reachable. */}
      <span className="truncate" title={name}>
        {name}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            // The pill often sits inside a card that opens on click, and inside a draggable.
            e.stopPropagation();
            e.preventDefault();
            onRemove();
          }}
          className="-mr-0.5 shrink-0 rounded-full opacity-60 transition-opacity hover:opacity-100"
          aria-label={`Remove ${name}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
