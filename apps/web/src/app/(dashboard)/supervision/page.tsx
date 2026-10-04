'use client';
import { TeamAttention } from '@/components/coaching/team-attention';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { canSupervise, canSeeAllLeads } from '@dental-crm/shared';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api-client';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QueryError } from '@/components/ui/query-state';

type Person = { id: string; firstName: string; lastName: string };
type Lead = {
  id: string;
  firstName: string;
  lastName: string | null;
  stage: string;
  assignedToId: string | null;
  supervisorId: string | null;
  assignedTo: Person | null;
  supervisor: Person | null;
  lastContactAt: string | null;
  tasks: { id: string; title: string; dueDate: string }[];
};
type Review = {
  id: string;
  lead: Lead;
  reviewer: Person;
  note: string;
  correction: string | null;
  dueAt: string;
  status: 'OPEN' | 'READY';
};
type Queue = { leads: Lead[]; reviews: Review[]; supervisors: Person[] };
const personName = (person: Person | null) =>
  person ? `${person.firstName} ${person.lastName}` : 'Unassigned';
export default function SupervisionPage() {
  const { user, accessToken } = useAuth();
  const supervisor = canSupervise(user);
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [deadlines, setDeadlines] = useState<Record<string, string>>({});
  const queue = useQuery<Queue>({
    queryKey: ['supervision', appliedSearch],
    queryFn: () =>
      apiRequest(
        `/api/supervision${appliedSearch ? `?search=${encodeURIComponent(appliedSearch)}` : ''}`,
        {},
        accessToken ?? undefined,
      ),
    refetchInterval: 15000,
  });
  const action = useMutation({
    mutationFn: ({
      path,
      body,
      method = 'POST',
    }: {
      path: string;
      body: Record<string, unknown>;
      method?: string;
    }) =>
      apiRequest(
        `/api/supervision/${path}`,
        { method, body: JSON.stringify(body) },
        accessToken ?? undefined,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supervision'] });
      qc.invalidateQueries({ queryKey: ['work-list'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Review updated');
    },
    onError: (e) => toast.error(e.message),
  });
  const mayReview = (lead: Lead) =>
    supervisor && (canSeeAllLeads(user) || lead.supervisorId === user?.sub);
  const setNote = (id: string, value: string) =>
    setNotes((current) => ({ ...current, [id]: value }));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{supervisor ? 'Lead Supervision' : 'My Corrections'}</h1>
        <p className="mt-2 text-muted-foreground">
          {supervisor
            ? 'Review patient contact, overdue follow-ups and team corrections. Assign a supervisor to keep each lead covered while the owner is away.'
            : 'Correct issues raised by your supervisor and submit them for review.'}
        </p>
      </div>
      <TeamAttention expanded />
      {queue.isError ? (
        <QueryError error={queue.error} onRetry={queue.refetch} />
      ) : queue.isLoading ? (
        <p role="status">Loading review queue…</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                Open issues and corrections awaiting review ({queue.data?.reviews.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!queue.data?.reviews.length && (
                <p className="text-sm text-muted-foreground">No open issues.</p>
              )}
              {queue.data?.reviews.map((review) => (
                <div key={review.id} className="space-y-3 rounded border p-4">
                  <div className="flex flex-wrap justify-between gap-2">
                    <Link
                      className="font-medium text-primary underline"
                      href={`/pipeline?lead=${review.lead.id}`}
                    >
                      {review.lead.firstName} {review.lead.lastName}
                    </Link>
                    <Badge variant={review.status === 'READY' ? 'info' : 'warning'}>
                      {review.status === 'READY'
                        ? 'Awaiting supervisor review'
                        : new Date(review.dueAt) < new Date()
                          ? 'Overdue correction'
                          : 'Needs correction'}
                    </Badge>
                  </div>
                  <p className="text-sm">{review.note}</p>
                  <p className="text-xs text-muted-foreground">
                    Salesperson: {personName(review.lead.assignedTo)} · Reviewer:{' '}
                    {personName(review.reviewer)} · Due: {new Date(review.dueAt).toLocaleString()}
                  </p>
                  {review.correction && (
                    <p className="rounded bg-muted p-3 text-sm">
                      Correction submitted: {review.correction}
                    </p>
                  )}
                  {review.status === 'OPEN' && review.lead.assignedToId === user?.sub && (
                    <div className="space-y-2">
                      <textarea
                        aria-label="Explain your correction"
                        placeholder="Explain what you corrected"
                        className="min-h-20 w-full rounded border bg-background p-2 text-sm"
                        value={notes[review.id] ?? ''}
                        onChange={(e) => setNote(review.id, e.target.value)}
                        maxLength={2000}
                      />
                      <Button
                        disabled={action.isPending || (notes[review.id]?.trim().length ?? 0) < 3}
                        onClick={() =>
                          action.mutate({
                            path: `reviews/${review.id}/correction`,
                            body: { note: notes[review.id] },
                          })
                        }
                      >
                        Submit correction
                      </Button>
                    </div>
                  )}
                  {review.status === 'READY' && mayReview(review.lead) && (
                    <div className="space-y-2">
                      <textarea
                        aria-label="Supervisor review decision"
                        placeholder="Explain your review decision"
                        className="min-h-20 w-full rounded border bg-background p-2 text-sm"
                        value={notes[review.id] ?? ''}
                        onChange={(e) => setNote(review.id, e.target.value)}
                        maxLength={2000}
                      />
                      <div className="flex gap-2">
                        {(['RESOLVED', 'OPEN'] as const).map((status) => (
                          <Button
                            key={status}
                            variant={status === 'RESOLVED' ? 'default' : 'outline'}
                            disabled={
                              action.isPending || (notes[review.id]?.trim().length ?? 0) < 3
                            }
                            onClick={() =>
                              action.mutate({
                                path: `reviews/${review.id}/decision`,
                                method: 'PATCH',
                                body: { status, note: notes[review.id] },
                              })
                            }
                          >
                            {status === 'RESOLVED'
                              ? 'Accept and close issue'
                              : 'Return for correction'}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
          {supervisor && (
            <Card>
              <CardHeader>
                <CardTitle>Lead coverage and follow-up checks</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setAppliedSearch(search.trim());
                  }}
                >
                  <Input
                    aria-label="Search leads for supervision"
                    placeholder="Search name or phone"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    maxLength={100}
                  />
                  <Button type="submit">Search</Button>
                </form>
                <p className="text-xs text-muted-foreground">
                  Showing up to 100 active leads, oldest first. “No contact recorded” refers to
                  captured WhatsApp messages; disconnected periods can create gaps. Calls are
                  recorded separately.
                </p>
                {queue.data?.leads.map((lead) => (
                  <div key={lead.id} className="space-y-3 rounded border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        href={`/pipeline?lead=${lead.id}`}
                        className="font-medium text-primary underline"
                      >
                        {lead.firstName} {lead.lastName}
                      </Link>
                      <Link
                        href={`/inbox?lead=${lead.id}`}
                        className="text-sm text-primary underline"
                      >
                        View conversations
                      </Link>
                    </div>
                    <p className="text-sm">
                      Salesperson: {personName(lead.assignedTo)} · Supervisor:{' '}
                      {personName(lead.supervisor)} · {lead.stage.replaceAll('_', ' ')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={lead.lastContactAt ? 'secondary' : 'warning'}>
                        {lead.lastContactAt
                          ? `Last captured contact: ${new Date(lead.lastContactAt).toLocaleString()}`
                          : 'No contact recorded'}
                      </Badge>
                      {!!lead.tasks.length && (
                        <Badge variant="warning">{lead.tasks.length} overdue follow-ups</Badge>
                      )}
                    </div>
                    {mayReview(lead) && (
                      <>
                        <label className="flex flex-wrap items-center gap-2 text-sm">
                          Lead supervisor
                          <select
                            aria-label={`Supervisor for ${lead.firstName} ${lead.lastName}`}
                            className="rounded border bg-background p-2"
                            value={lead.supervisorId ?? ''}
                            disabled={action.isPending}
                            onChange={(e) => {
                              action.mutate({
                                path: `leads/${lead.id}/supervisor`,
                                method: 'PATCH',
                                body: { supervisorId: e.target.value || null },
                              });
                            }}
                          >
                            <option value="">No supervisor</option>
                            {queue.data?.supervisors.map((person) => (
                              <option key={person.id} value={person.id}>
                                {personName(person)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <textarea
                          aria-label={`Issue on ${lead.firstName}'s lead`}
                          placeholder="What needs correcting?"
                          className="min-h-20 w-full rounded border bg-background p-2 text-sm"
                          value={notes[lead.id] ?? ''}
                          onChange={(e) => setNote(lead.id, e.target.value)}
                          maxLength={2000}
                        />
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="text-xs text-muted-foreground">
                            Correction deadline (defaults to 24 hours)
                            <input
                              type="datetime-local"
                              className="mt-1 block rounded border bg-background p-2"
                              value={deadlines[lead.id] ?? ''}
                              onChange={(e) =>
                                setDeadlines((current) => ({
                                  ...current,
                                  [lead.id]: e.target.value,
                                }))
                              }
                            />
                          </label>
                          <Button
                            disabled={
                              action.isPending ||
                              !lead.assignedToId ||
                              (notes[lead.id]?.trim().length ?? 0) < 3
                            }
                            onClick={() =>
                              action.mutate({
                                path: 'reviews',
                                body: {
                                  leadId: lead.id,
                                  note: notes[lead.id],
                                  ...(deadlines[lead.id]
                                    ? { dueAt: new Date(deadlines[lead.id]).toISOString() }
                                    : {}),
                                },
                              })
                            }
                          >
                            Flag issue and create follow-up
                          </Button>
                        </div>
                        {!lead.assignedToId && (
                          <p className="text-xs text-muted-foreground">
                            Assign a salesperson before requesting a correction.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
