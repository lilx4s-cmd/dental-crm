'use client';

import { useState } from 'react';
import { Check, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  TAG_CATEGORY_LABELS,
  TAG_CATEGORY_ORDER,
  TAG_COLORS,
  TAG_NAME_MAX,
  type TagCategory,
  type TagColor,
} from '@dental-crm/shared';
import { useAuth } from '@/context/auth-context';
import { useCreateTag, useDeleteTag, useTags, useUpdateTag, type Tag } from '@/hooks/use-tags';
import { TagPill } from '@/components/tags/tag-pill';
import { cn } from '@/lib/utils';

/**
 * The vocabulary, and who is allowed to change it.
 *
 * This card is the reason the tags table sat empty for a year: the API had list, create and delete
 * endpoints and nothing in the app ever called them, so the only way to make a tag was a REST
 * client. Tags can also be created inline from the picker, which is where most will come from —
 * this page is for the tidying up afterwards: merging near-duplicates by renaming, giving a tag a
 * category so it groups properly, and deleting the ones that turned out to mean nothing.
 */
export function TagsCard() {
  const { user } = useAuth();
  const { data: tags, isLoading } = useTags();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Tag | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Matches the endpoints: reception can create a tag, only management can rename or delete one,
  // because a rename changes every card that carries it.
  const canEdit = user?.role === 'SUPER_ADMIN' || user?.role === 'CLINIC_MANAGER';
  const canCreate = canEdit || user?.role === 'RECEPTION';

  const grouped = TAG_CATEGORY_ORDER.map((category) => ({
    category,
    tags: (tags ?? []).filter((t) => t.category === category),
  })).filter((g) => g.tags.length > 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Tags</CardTitle>
          <CardDescription>
            Labels shared by deals and patients. A tag follows a person through conversion, which is
            what makes &ldquo;how many implant enquiries became patients&rdquo; answerable.
          </CardDescription>
        </div>
        {canCreate && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New tag
          </Button>
        )}
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading tags…</p>
        ) : grouped.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No tags yet. Create one here, or type a name into the tag picker on any deal.
          </p>
        ) : (
          <div className="space-y-5">
            {grouped.map(({ category, tags: group }) => (
              <div key={category}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {TAG_CATEGORY_LABELS[category as TagCategory]}
                </p>
                <div className="space-y-1">
                  {group.map((tag) =>
                    editingId === tag.id ? (
                      <TagRow key={tag.id} tag={tag} onDone={() => setEditingId(null)} />
                    ) : (
                      <div
                        key={tag.id}
                        className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
                      >
                        <TagPill name={tag.name} color={tag.color} />
                        <span className="flex-1 text-xs tabular-nums text-muted-foreground">
                          {/* Stated before anyone reaches for delete, not discovered after. */}
                          {tag.usageCount === 0
                            ? 'not used'
                            : `on ${tag.usageCount} ${tag.usageCount === 1 ? 'record' : 'records'}`}
                        </span>
                        {canEdit && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => setEditingId(tag.id)}
                              aria-label={`Edit ${tag.name}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              onClick={() => setDeleting(tag)}
                              aria-label={`Delete ${tag.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <TagDialog open={creating} onClose={() => setCreating(false)} />
      <DeleteTagDialog tag={deleting} onClose={() => setDeleting(null)} />
    </Card>
  );
}

/** Editing in place, because a rename is usually a typo fix and a dialog for that is heavy. */
function TagRow({ tag, onDone }: { tag: Tag; onDone: () => void }) {
  const update = useUpdateTag();
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState<TagColor>(tag.color);
  const [category, setCategory] = useState<TagCategory>(tag.category);

  const save = () => {
    update.mutate(
      { id: tag.id, name: name.trim(), color, category },
      {
        onSuccess: () => {
          toast.success('Tag updated');
          onDone();
        },
        onError: (e) => toast.error(e.message || 'Could not update that tag'),
      },
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-2 py-2">
      <Input
        autoFocus
        value={name}
        maxLength={TAG_NAME_MAX}
        onChange={(e) => setName(e.target.value)}
        className="h-8 w-40"
        aria-label="Tag name"
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') onDone();
        }}
      />

      <ColorPicker value={color} onChange={setColor} />

      <Select value={category} onValueChange={(v) => setCategory(v as TagCategory)}>
        <SelectTrigger className="h-8 w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TAG_CATEGORY_ORDER.map((c) => (
            <SelectItem key={c} value={c}>
              {TAG_CATEGORY_LABELS[c]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="ml-auto flex gap-1">
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onDone} aria-label="Cancel">
          <X className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          className="h-8 w-8 p-0"
          onClick={save}
          disabled={!name.trim() || update.isPending}
          aria-label="Save"
        >
          {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

/** Ten swatches. Small enough to show all at once, which beats a dropdown of colour names. */
function ColorPicker({ value, onChange }: { value: TagColor; onChange: (c: TagColor) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Tag colour">
      {TAG_COLORS.map((c) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={value === c.id}
          aria-label={c.label}
          title={c.label}
          onClick={() => onChange(c.id)}
          className={cn(
            'h-5 w-5 rounded-full border-2 transition-transform',
            value === c.id ? 'scale-110 border-foreground' : 'border-transparent hover:scale-110',
          )}
          style={{ backgroundColor: c.swatch }}
        />
      ))}
    </div>
  );
}

function TagDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateTag();
  const [name, setName] = useState('');
  const [color, setColor] = useState<TagColor>('SLATE');
  const [category, setCategory] = useState<TagCategory>('GENERAL');

  const reset = () => {
    setName('');
    setColor('SLATE');
    setCategory('GENERAL');
  };

  const submit = () => {
    if (!name.trim()) return;
    create.mutate(
      { name: name.trim(), color, category },
      {
        onSuccess: () => {
          toast.success('Tag created');
          reset();
          onClose();
        },
        onError: (e) => toast.error(e.message || 'Could not create that tag'),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && (reset(), onClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New tag</DialogTitle>
          <DialogDescription>
            Categories are what let a card show the two tags that matter rather than the eleven that
            exist — one per axis, instead of an arbitrary truncation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="tag-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="tag-name"
              autoFocus
              value={name}
              maxLength={TAG_NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              placeholder="Hollywood Smile"
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium">Colour</span>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="tag-category" className="text-sm font-medium">
              Category
            </label>
            <Select value={category} onValueChange={(v) => setCategory(v as TagCategory)}>
              <SelectTrigger id="tag-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TAG_CATEGORY_ORDER.map((c) => (
                  <SelectItem key={c} value={c}>
                    {TAG_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border bg-muted/30 px-3 py-2">
            <p className="mb-1.5 text-xs text-muted-foreground">Preview</p>
            <TagPill name={name.trim() || 'Tag name'} color={color} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => (reset(), onClose())}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim() || create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Deleting states the cost first.
 *
 * A tag on ninety deals is a filter somebody uses; a tag on none is a mistake. The count is the
 * whole difference and it belongs in front of the button, because afterwards there is no list of
 * which ninety deals lost it — only the history, one deal at a time.
 */
function DeleteTagDialog({ tag, onClose }: { tag: Tag | null; onClose: () => void }) {
  const remove = useDeleteTag();

  const submit = () => {
    if (!tag) return;
    remove.mutate(tag.id, {
      onSuccess: () => {
        toast.success(`“${tag.name}” deleted`);
        onClose();
      },
      onError: (e) => toast.error(e.message || 'Could not delete that tag'),
    });
  };

  return (
    <Dialog open={!!tag} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this tag?</DialogTitle>
          <DialogDescription>
            {tag?.usageCount
              ? `It comes off ${tag.usageCount} ${tag.usageCount === 1 ? 'record' : 'records'}. Each one keeps a history entry saying it was removed, but there is no way to put it back on all of them at once.`
              : 'Nothing is using it, so nothing else changes.'}
          </DialogDescription>
        </DialogHeader>

        {tag && (
          <div className="rounded-md border px-3 py-2">
            <TagPill name={tag.name} color={tag.color} />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={remove.isPending}>
            {remove.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
