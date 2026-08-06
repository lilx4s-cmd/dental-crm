'use client';

import { useState } from 'react';
import { Loader2, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/context/auth-context';
import {
  useCreateMessageTemplate,
  useMessageTemplates,
  useRetireMessageTemplate,
  useUpdateMessageTemplate,
  type MessageTemplate,
} from '@/hooks/use-message-templates';
import { cn } from '@/lib/utils';

/** Kept in step with TEMPLATE_PLACEHOLDERS on the API side. */
const PLACEHOLDERS = [
  { token: '{{firstName}}', means: 'Ahmed' },
  { token: '{{name}}', means: 'Ahmed Al-Rashid' },
  { token: '{{clinic}}', means: 'your clinic name' },
  { token: '{{staffName}}', means: 'whoever is sending' },
];

/**
 * The saved replies.
 *
 * The same six answers get typed forty times a week — the price list, what to bring, where the
 * hotel is, how long the stay takes. Typed fresh each time they are slower, less consistent, and
 * occasionally wrong in ways that matter when the subject is surgery.
 *
 * Management-only, because a wrong price in a template goes out repeatedly before anyone notices.
 * Everyone who can send a message can *use* them — a canned reply is no use to the person who
 * cannot reach it.
 */
export function MessageTemplatesCard() {
  const { user } = useAuth();
  const canEdit = user?.role === 'SUPER_ADMIN' || user?.role === 'CLINIC_MANAGER';
  // Managers see retired ones too, since restoring is the main reason to come here.
  const { data: templates, isLoading } = useMessageTemplates(canEdit);
  const [editing, setEditing] = useState<MessageTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const update = useUpdateMessageTemplate();
  const retire = useRetireMessageTemplate();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Saved replies</CardTitle>
          <CardDescription>
            Answers staff insert into a message rather than retyping. Not WhatsApp&rsquo;s own
            approved templates — these are for replies inside a conversation already open.
          </CardDescription>
        </div>
        {canEdit && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New reply
          </Button>
        )}
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (templates?.length ?? 0) === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            None yet. The ones worth adding first are the answers already being retyped every day.
          </p>
        ) : (
          <div className="space-y-1">
            {templates!.map((t) => (
              <div
                key={t.id}
                className={cn(
                  'flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/50',
                  !t.isActive && 'opacity-55',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <span className="truncate">{t.title}</span>
                    {t.category && (
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {t.category}
                      </span>
                    )}
                    {!t.isActive && (
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                        retired
                      </span>
                    )}
                  </p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{t.body}</p>
                </div>

                <span className="shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
                  {/* Which of these are earning their place. A reply nobody uses is one to rewrite
                      or retire, and there is no other way to tell. */}
                  {t.useCount === 0 ? 'unused' : `used ${t.useCount}×`}
                </span>

                {canEdit && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => setEditing(t)}
                      aria-label={`Edit ${t.title}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {t.isActive ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() =>
                          retire.mutate(t.id, {
                            onSuccess: () => toast.success(`“${t.title}” retired`),
                            onError: (e) => toast.error(e.message || 'Could not retire it'),
                          })
                        }
                        aria-label={`Retire ${t.title}`}
                        title="Hide from the composer. Nothing is deleted."
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() =>
                          update.mutate(
                            { id: t.id, isActive: true },
                            {
                              onSuccess: () => toast.success(`“${t.title}” restored`),
                              onError: (e) => toast.error(e.message || 'Could not restore it'),
                            },
                          )
                        }
                        aria-label={`Restore ${t.title}`}
                        title="Put it back in the composer"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <TemplateDialog
        open={creating || !!editing}
        template={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </Card>
  );
}

function TemplateDialog({
  open,
  template,
  onClose,
}: {
  open: boolean;
  template: MessageTemplate | null;
  onClose: () => void;
}) {
  const create = useCreateMessageTemplate();
  const update = useUpdateMessageTemplate();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('');
  // Remounted per template rather than synced with an effect: a dialog keyed to what it is editing
  // cannot show the previous one's text for a frame.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (open && loadedFor !== (template?.id ?? 'new')) {
    setLoadedFor(template?.id ?? 'new');
    setTitle(template?.title ?? '');
    setBody(template?.body ?? '');
    setCategory(template?.category ?? '');
  }

  const pending = create.isPending || update.isPending;

  const submit = () => {
    const payload = { title: title.trim(), body: body.trim(), category: category.trim() };
    if (!payload.title || !payload.body) return;

    const done = {
      onSuccess: () => {
        toast.success(template ? 'Saved' : 'Reply created');
        setLoadedFor(null);
        onClose();
      },
      onError: (e: Error) => toast.error(e.message || 'Could not save that'),
    };

    if (template) update.mutate({ id: template.id, ...payload }, done);
    else create.mutate(payload, done);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setLoadedFor(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{template ? 'Edit saved reply' : 'New saved reply'}</DialogTitle>
          <DialogDescription>
            The title is what staff pick it by; only the body reaches the patient.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="tpl-title" className="text-sm font-medium">
              Title
            </label>
            <Input
              id="tpl-title"
              autoFocus
              maxLength={80}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Price list — implants"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="tpl-category" className="text-sm font-medium">
              Category <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="tpl-category"
              maxLength={40}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Pricing"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="tpl-body" className="text-sm font-medium">
              Message
            </label>
            <Textarea
              id="tpl-body"
              rows={7}
              maxLength={4096}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Hello {{firstName}}, here is our implant pricing…"
            />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[11px] text-muted-foreground">
              <span>Insert:</span>
              {PLACEHOLDERS.map((p) => (
                <button
                  key={p.token}
                  type="button"
                  onClick={() => setBody((b) => `${b}${p.token}`)}
                  className="rounded bg-muted px-1.5 py-0.5 font-mono transition-colors hover:bg-accent"
                  title={`Becomes ${p.means}`}
                >
                  {p.token}
                </button>
              ))}
            </div>
            {/* WhatsApp's own limit for a message body. Shown so it is hit here, in a form, rather
                than at send time on a message somebody had already written. */}
            <p className="text-right text-[11px] tabular-nums text-muted-foreground">
              {body.length}/4096
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!title.trim() || !body.trim() || pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {template ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
