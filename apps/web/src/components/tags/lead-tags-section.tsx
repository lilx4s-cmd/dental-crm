'use client';

import { toast } from 'sonner';

import { TagPill } from './tag-pill';
import { TagPicker } from './tag-picker';
import { useToggleLeadTag } from '@/hooks/use-tags';
import type { TagRef } from '@/hooks/use-tags';

/**
 * The tags on one deal, with a picker.
 *
 * Removal is on the pill itself rather than only in the picker. Taking a tag off is the more
 * common of the two operations — a deal gets labelled once and corrected several times — and
 * making someone open a menu to undo something they can see is the wrong way round.
 */
export function LeadTagsSection({ leadId, tags }: { leadId: string; tags: { tag: TagRef }[] }) {
  const toggle = useToggleLeadTag();
  const selectedIds = tags.map(({ tag }) => tag.id);

  const change = (tagId: string, name: string, remove: boolean) =>
    toggle.mutate(
      { leadId, tagId, remove },
      {
        onError: (e) => toast.error(e.message || `Could not ${remove ? 'remove' : 'add'} “${name}”`),
      },
    );

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Tags</h3>
        <TagPicker
          align="end"
          triggerLabel={tags.length ? 'Edit' : 'Add a tag'}
          selectedIds={selectedIds}
          disabled={toggle.isPending}
          onToggle={(tag, on) => change(tag.id, tag.name, !on)}
        />
      </div>

      {tags.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing labelled yet. Tags are what the board cannot show any other way — the column is
          the stage and the avatar is the owner, so &ldquo;wants implants, speaks Arabic, waiting on
          family&rdquo; has nowhere else to live.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tags.map(({ tag }) => (
            <TagPill
              key={tag.id}
              name={tag.name}
              color={tag.color}
              onRemove={() => change(tag.id, tag.name, true)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
