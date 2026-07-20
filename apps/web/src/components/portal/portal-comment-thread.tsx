'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { MessageSquare, Send } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePortalAddComment, type PortalComment } from '@/hooks/use-portal';

// Public-facing comment thread — deliberately not the staff CommentThread (which reads
// useAddTreatmentPlanComment, an authenticated hook that would 401 on the public portal).
export function PortalCommentThread({ token, comments }: { token: string; comments: PortalComment[] }) {
  const addComment = usePortalAddComment(token);
  const [body, setBody] = useState('');
  const [authorName, setAuthorName] = useState('');

  const submit = () => {
    if (!body.trim()) return;
    addComment.mutate(
      { body, authorName: authorName.trim() || undefined },
      {
        onSuccess: () => {
          setBody('');
          toast.success('Message sent');
          window.location.reload();
        },
        onError: () => toast.error('Failed to send message'),
      },
    );
  };

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
        <MessageSquare className="h-4 w-4" /> Discussion
      </p>
      {comments.length > 0 ? (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li key={c.id} className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {c.authorType === 'PATIENT' ? c.authorName ?? 'You' : c.authorName ?? 'Clinic Team'}
                </span>
                <span className="text-xs text-muted-foreground">{format(new Date(c.createdAt), 'MMM d, HH:mm')}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No messages yet.</p>
      )}
      <div className="space-y-2">
        <Input
          placeholder="Your name (optional)"
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
        />
        <div className="flex gap-2">
          <Input
            placeholder="Write a message…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <Button onClick={submit} disabled={addComment.isPending || !body.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
