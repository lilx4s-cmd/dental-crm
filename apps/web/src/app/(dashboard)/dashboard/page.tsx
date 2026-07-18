'use client';

import { Users, TrendingUp, UserCheck, DollarSign, Calendar } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardStats, usePipelineGroups } from '@/hooks/use-dashboard';

const STAGE_COLORS: Record<string, string> = {
  NEW_LEAD: '#6366f1',
  CONTACTED: '#8b5cf6',
  QUALIFIED: '#a78bfa',
  CONSULTATION_SCHEDULED: '#3b82f6',
  CONSULTATION_DONE: '#06b6d4',
  TREATMENT_PROPOSED: '#10b981',
  NEGOTIATION: '#f59e0b',
  WON: '#22c55e',
  LOST: '#ef4444',
};

const STAGE_LABELS: Record<string, string> = {
  NEW_LEAD: 'New Lead',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  CONSULTATION_SCHEDULED: 'Consult Sched.',
  CONSULTATION_DONE: 'Consult Done',
  TREATMENT_PROPOSED: 'Proposed',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost',
};

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  loading,
  suffix = '',
}: {
  label: string;
  value: string | number | undefined;
  icon: React.ElementType;
  color: string;
  loading: boolean;
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
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: pipeline, isLoading: pipelineLoading } = usePipelineGroups();

  const chartData = pipeline?.map((g) => ({
    stage: STAGE_LABELS[g.stage] ?? g.stage,
    count: g.count,
    value: g.totalValue,
    color: STAGE_COLORS[g.stage] ?? '#6366f1',
  }));

  const pipelineValue = stats?.pipelineValueTotal
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(stats.pipelineValueTotal)
    : '—';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Clinic overview — live data</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Leads Today" value={stats?.leadsToday} icon={TrendingUp} color="text-blue-500" loading={statsLoading} />
        <StatCard label="Total Leads" value={stats?.leadsTotal} icon={TrendingUp} color="text-indigo-500" loading={statsLoading} />
        <StatCard label="Active Patients" value={stats?.patientsTotal} icon={Users} color="text-purple-500" loading={statsLoading} />
        <StatCard label="Appts Today" value={stats?.appointmentsToday} icon={Calendar} color="text-cyan-500" loading={statsLoading} />
        <StatCard label="Conversion Rate" value={stats?.conversionRate} icon={UserCheck} color="text-green-500" loading={statsLoading} suffix="%" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>Pipeline by Stage</CardTitle>
          </CardHeader>
          <CardContent>
            {pipelineLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 0, right: 8, left: 0, bottom: 24 }}>
                  <XAxis dataKey="stage" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value, name) => [value, name === 'count' ? 'Leads' : 'Value']}
                    labelStyle={{ fontWeight: 600 }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {chartData?.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              Pipeline Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : (
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">{pipelineValue}</p>
            )}
            {!statsLoading && (
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
