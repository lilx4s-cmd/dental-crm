'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useAuth } from '@/context/auth-context';
import { useUsers, type User } from '@/hooks/use-users';
import { useSalesActivity, type SalesActivity } from '@/hooks/use-leads';
import { TransferPanel } from '@/components/team/transfer-panel';


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
            <TabsTrigger value="transfer">Transfer Deals</TabsTrigger>
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
