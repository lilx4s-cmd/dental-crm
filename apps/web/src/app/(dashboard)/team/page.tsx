'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeftRight, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { useAuth } from '@/context/auth-context';
import { useUsers, type User } from '@/hooks/use-users';
import { useLeads, useTransferLeads, useSalesActivity, type SalesActivity } from '@/hooks/use-leads';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  CLINIC_MANAGER: 'Clinic Manager',
  RECEPTION: 'Reception',
  SALES_CONSULTANT: 'Sales Consultant',
  DENTIST: 'Dentist',
};

function userName(u: { firstName: string; lastName: string } | null | undefined) {
  return u ? `${u.firstName} ${u.lastName}`.trim() : '—';
}

function stageLabel(s: string | null) {
  return s ? s.replace(/_/g, ' ') : '—';
}

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// ─── Transfer panel (Super Admin only) ────────────────────────────────────────

function TransferPanel({ users }: { users: User[] }) {
  const transfer = useTransferLeads();
  const [fromUserId, setFromUserId] = useState('');
  const [toUserId, setToUserId] = useState('');
  const [note, setNote] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const fromUser = users.find((u) => u.id === fromUserId);
  const toUser = users.find((u) => u.id === toUserId);

  const { data: preview, isLoading: previewLoading } = useLeads({
    assignedToId: fromUserId, limit: 1, status: 'ACTIVE', enabled: !!fromUserId,
  });
  const activeCount = preview?.meta.total ?? 0;

  const canReview = !!fromUserId && !!toUserId && fromUserId !== toUserId;

  const handleConfirm = () => {
    transfer.mutate(
      { fromUserId, toUserId, note: note.trim() || undefined },
      {
        onSuccess: (result) => {
          toast.success(
            result.transferred > 0
              ? `Moved ${result.transferred} lead${result.transferred === 1 ? '' : 's'} to ${userName(toUser)}`
              : 'No active leads to move — nothing changed',
          );
          setConfirmOpen(false);
          setFromUserId('');
          setToUserId('');
          setNote('');
        },
        onError: (err) => toast.error(err.message || 'Transfer failed'),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transfer Leads</CardTitle>
        <CardDescription>
          Move a salesperson&apos;s entire active pipeline to someone else. Closed (won/lost) leads keep their
          original owner so past results stay accurate — use this for handovers, not for editing history.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr]">
          <div className="space-y-1.5">
            <Label>From</Label>
            <Select value={fromUserId} onValueChange={setFromUserId}>
              <SelectTrigger><SelectValue placeholder="Select salesperson" /></SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.firstName} {u.lastName} · {ROLE_LABELS[u.role] ?? u.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="hidden sm:flex items-end justify-center pb-2.5">
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
          </div>

          <div className="space-y-1.5">
            <Label>To</Label>
            <Select value={toUserId} onValueChange={setToUserId}>
              <SelectTrigger><SelectValue placeholder="Select salesperson" /></SelectTrigger>
              <SelectContent>
                {users.filter((u) => u.id !== fromUserId).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.firstName} {u.lastName} · {ROLE_LABELS[u.role] ?? u.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {fromUserId && (
          <p className="text-sm text-muted-foreground">
            {previewLoading ? 'Checking pipeline…' : (
              <>
                <strong className="text-foreground">{activeCount}</strong> active lead{activeCount === 1 ? '' : 's'}{' '}
                currently assigned to {userName(fromUser)}.
              </>
            )}
          </p>
        )}

        <div className="space-y-1.5">
          <Label>Note (optional)</Label>
          <Textarea
            placeholder="Reason for the reassignment — shown in the activity history"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
        </div>

        <div className="flex justify-end">
          <Button disabled={!canReview || activeCount === 0} onClick={() => setConfirmOpen(true)}>
            <ArrowLeftRight className="h-4 w-4 mr-2" />
            Review Transfer
          </Button>
        </div>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm transfer</DialogTitle>
            <DialogDescription>
              This moves <strong>{activeCount}</strong> active lead{activeCount === 1 ? '' : 's'} from{' '}
              <strong>{userName(fromUser)}</strong> to <strong>{userName(toUser)}</strong>. Each lead gets a
              history entry so this can be traced later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={handleConfirm} disabled={transfer.isPending}>
              {transfer.isPending ? 'Transferring…' : 'Confirm Transfer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Activity history feed ─────────────────────────────────────────────────────

function ActivityFeed({ users, isAdmin }: { users: User[]; isAdmin: boolean }) {
  const [filterUserId, setFilterUserId] = useState<string>('all');
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useSalesActivity({
    page, limit, userId: isAdmin && filterUserId !== 'all' ? filterUserId : undefined,
  });

  const rows = data?.data ?? [];
  const meta = data?.meta;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>{isAdmin ? 'Sales Activity' : 'My Activity'}</CardTitle>
          <CardDescription>
            {isAdmin ? 'Every stage change and reassignment, across the team' : 'Your stage changes and lead updates'}
          </CardDescription>
        </div>
        {isAdmin && (
          <Select value={filterUserId} onValueChange={(v) => { setFilterUserId(v); setPage(1); }}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All salespeople</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.firstName} {u.lastName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">When</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Salesperson</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Lead</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Change</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Note</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                      ))}
                    </tr>
                  ))
                : rows.map((a: SalesActivity) => {
                    const reassigned = !!a.fromStage && !!a.toStage && a.fromStage === a.toStage;
                    return (
                      <tr key={a.id} className="border-b hover:bg-muted/30">
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtWhen(a.createdAt)}</td>
                        <td className="px-4 py-3 font-medium">{userName(a.user)}</td>
                        <td className="px-4 py-3">
                          {a.lead ? `${a.lead.firstName} ${a.lead.lastName ?? ''}`.trim() : 'Deleted lead'}
                        </td>
                        <td className="px-4 py-3">
                          {reassigned ? (
                            <Badge variant="purple">Reassigned</Badge>
                          ) : a.fromStage || a.toStage ? (
                            <span className="text-xs whitespace-nowrap">
                              {stageLabel(a.fromStage)} <ArrowRight className="inline h-3 w-3 mx-1" /> {stageLabel(a.toStage)}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{a.note ?? '—'}</td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>

          {!isLoading && rows.length === 0 && (
            <div className="py-16 text-center text-muted-foreground">No activity recorded yet.</div>
          )}
        </div>

        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <p className="text-sm text-muted-foreground">Page {meta.page} of {meta.totalPages}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const { data: users, isLoading: usersLoading } = useUsers();
  const assignees = useMemo(() => (users ?? []).filter((u) => u.isActive), [users]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sales Team</h1>
        <p className="text-muted-foreground mt-1">
          {isAdmin ? 'Reassign leads between salespeople and review their activity' : 'Your activity history'}
        </p>
      </div>

      {isAdmin ? (
        <Tabs defaultValue="transfer">
          <TabsList>
            <TabsTrigger value="transfer">Transfer Leads</TabsTrigger>
            <TabsTrigger value="activity">Activity History</TabsTrigger>
          </TabsList>
          <TabsContent value="transfer">
            {usersLoading ? <Skeleton className="h-64 w-full" /> : <TransferPanel users={assignees} />}
          </TabsContent>
          <TabsContent value="activity">
            <ActivityFeed users={assignees} isAdmin />
          </TabsContent>
        </Tabs>
      ) : (
        <ActivityFeed users={assignees} isAdmin={false} />
      )}
    </div>
  );
}
