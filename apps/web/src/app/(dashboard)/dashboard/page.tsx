'use client';

import dynamic from 'next/dynamic';
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
}: {
  label: string;
  value: string | number | undefined;
  icon: React.ElementType;
  color: string;
  loading: boolean;
  error?: unknown;
  onRetry?: () => void;
  suffix?: string;
}) {
  return (
    <Card>
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Clinic overview — live data</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Leads Today" value={stats?.leadsToday} icon={TrendingUp} color="text-blue-500" loading={statsQ.isLoading} error={statsError} onRetry={statsQ.refetch} />
        <StatCard label="Total Leads" value={stats?.leadsTotal} icon={TrendingUp} color="text-indigo-500" loading={statsQ.isLoading} error={statsError} onRetry={statsQ.refetch} />
        <StatCard label="Active Patients" value={stats?.patientsTotal} icon={Users} color="text-accent-foreground" loading={statsQ.isLoading} error={statsError} onRetry={statsQ.refetch} />
        <StatCard label="Appts Today" value={stats?.appointmentsToday} icon={Calendar} color="text-cyan-500" loading={statsQ.isLoading} error={statsError} onRetry={statsQ.refetch} />
        <StatCard label="Conversion Rate" value={stats?.conversionRate} icon={UserCheck} color="text-success" loading={statsQ.isLoading} error={statsError} onRetry={statsQ.refetch} suffix="%" />
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
              Pipeline Value
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
                  <div key={g.stage} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{STAGE_LABELS[g.stage] ?? g.stage}</span>
                    <span className="font-medium">{g.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
