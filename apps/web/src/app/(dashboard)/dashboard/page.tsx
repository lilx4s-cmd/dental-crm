'use client';
import { TeamAttention } from '@/components/coaching/team-attention';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Users, TrendingUp, UserCheck, DollarSign, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { STAGE_LABELS, stageDef } from '@dental-crm/shared';
import { useDashboardStats, usePipelineGroups } from '@/hooks/use-dashboard';
import { QueryError } from '@/components/ui/query-state';
import { formatMoneyRounded } from '@/lib/money';

// recharts is the largest dependency on this route (P-2); pulling it into its own module lets
// ssr:false + next/dynamic fetch it as a separate chunk only once the panel is about to render.
const PipelineStageBarChart = dynamic(() => import('@/components/charts/pipeline-stage-bar-chart'), {
  ssr: false,
  loading: () => <Skeleton className="h-56 w-full" />,
});

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  loading,
  error,
  onRetry,
  suffix = '',
  href,
}: {
  label: string;
  value: string | number | undefined;
  icon: React.ElementType;
  color: string;
  loading: boolean;
  error?: unknown;
  onRetry?: () => void;
  suffix?: string;
  href?: string;
}) {
  const card = (
    <Card className={href && !loading && !error ? 'transition-colors hover:border-primary' : undefined}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={`h-5 w-5 ${color}`} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : error ? (
          <QueryError error={error} onRetry={onRetry} variant="inline" className="h-8 items-center" />
        ) : (
          <p className="text-2xl font-bold">
            {value}
            {suffix}
          </p>
        )}
      </CardContent>
    </Card>
  );
  return href && !loading && !error ? <Link href={href} aria-label={`View ${label}`} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{card}</Link> : card;
}

export default function DashboardPage() {
  const statsQ = useDashboardStats();
  const pipelineQ = usePipelineGroups();
  const { data: stats } = statsQ;
  const { data: pipeline } = pipelineQ;

  // Labels and colours come from the shared stage table, the same one the board and the filter bar
  // read. This page used to carry its own copy that called OFFER_SENT "Consult Done" and
  // WAITING_FOR_TICKET "Proposed" — two names for a stage nobody on the board would recognise —
  // and omitted six stages entirely, so those bars were labelled with the raw enum.
  const chartData = pipeline?.map((g) => ({
    stage: STAGE_LABELS[g.stage] ?? g.stage,
    count: g.count,
    value: g.totalValue,
    color: stageDef(g.stage)?.color ?? '#6366f1',
  }));

  const statsError = statsQ.isError ? statsQ.error : undefined;
  const pipelineValue = stats?.pipelineValueTotal
    ? formatMoneyRounded(stats.pipelineValueTotal)
    : '—';
  const todayLeadsHref = stats?.todayStart && stats?.todayEnd
    ? `/pipeline?${new URLSearchParams({ createdFrom: stats.todayStart, createdBefore: stats.todayEnd, status: 'ALL' })}`
    : undefined;

  return (
    <div className="space-y-6">
      <TeamAttention />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Clinic overview — live data</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Leads Today" value={stats?.leadsToday} href={todayLeadsHref} icon={TrendingUp} color="text-blue-500" loading={statsQ.isLoading} error={statsError} onRetry={statsQ.refetch} />
        <StatCard label="Total Leads" value={stats?.leadsTotal} href="/pipeline" icon={TrendingUp} color="text-indigo-500" loading={statsQ.isLoading} error={statsError} onRetry={statsQ.refetch} />
        <StatCard label="Active Patients" value={stats?.patientsTotal} href="/patients" icon={Users} color="text-accent-foreground" loading={statsQ.isLoading} error={statsError} onRetry={statsQ.refetch} />
        <StatCard label="Appts Today" value={stats?.appointmentsToday} href={`/appointments?view=day${stats?.todayDate ? `&date=${stats.todayDate}` : ''}`} icon={Calendar} color="text-cyan-500" loading={statsQ.isLoading} error={statsError} onRetry={statsQ.refetch} />
        <StatCard label="Conversion Rate" value={stats?.conversionRate} href="/pipeline?status=WON" icon={UserCheck} color="text-success" loading={statsQ.isLoading} error={statsError} onRetry={statsQ.refetch} suffix="%" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>Pipeline by Stage</CardTitle>
          </CardHeader>
          <CardContent>
            {pipelineQ.isLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : pipelineQ.isError ? (
              <QueryError error={pipelineQ.error} onRetry={pipelineQ.refetch} />
            ) : (
              <PipelineStageBarChart data={chartData ?? []} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-success" />
              <Link href="/pipeline" className="hover:underline">Pipeline Value</Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsQ.isLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : statsError ? (
              <QueryError error={statsError} onRetry={statsQ.refetch} variant="inline" />
            ) : (
              <p className="text-3xl font-bold text-success">{pipelineValue}</p>
            )}
            {!statsQ.isLoading && (
              <div className="mt-4 space-y-2">
                {pipeline?.filter((g) => g.count > 0).map((g) => (
                  <Link href={`/pipeline?stage=${encodeURIComponent(g.stage)}`} key={g.stage} className="flex min-h-11 items-center justify-between rounded px-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="text-muted-foreground">{STAGE_LABELS[g.stage] ?? g.stage}</span>
                    <span className="font-medium">{g.count}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
