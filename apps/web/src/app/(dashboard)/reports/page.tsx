'use client';

import dynamic from 'next/dynamic';
import { TrendingUp, Users, Calendar, DollarSign, AlertCircle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  useKpi, useMonthlyRevenue, useAppointmentStats,
  usePatientGrowth, useLeadFunnel,
} from '@/hooks/use-reports';
import { QueryError } from '@/components/ui/query-state';
import { formatMoneyRounded } from '@/lib/money';

// ─── Charts ──────────────────────────────────────────────────────────────────
// recharts is the single largest dependency on this route (P-2). Each chart is its own module
// under components/charts/ so ssr:false + next/dynamic can fetch it as a separate chunk only
// once the panel is actually about to render, instead of it riding along in the route's
// first-load JS.
const chartSkeleton = () => <Skeleton className="h-56 w-full" />;
const RevenueAreaChart = dynamic(() => import('@/components/charts/revenue-area-chart'), {
  ssr: false, loading: chartSkeleton,
});
const AppointmentStatusPieChart = dynamic(() => import('@/components/charts/appointment-status-pie-chart'), {
  ssr: false, loading: chartSkeleton,
});
const PatientGrowthBarChart = dynamic(() => import('@/components/charts/patient-growth-bar-chart'), {
  ssr: false, loading: chartSkeleton,
});
const LeadFunnelBarChart = dynamic(() => import('@/components/charts/lead-funnel-bar-chart'), {
  ssr: false, loading: chartSkeleton,
});

// Aggregates are read for magnitude, so whole units.
const fmt = formatMoneyRounded;

// ─── KPI card ────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, icon: Icon, color, loading, error, onRetry,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; loading: boolean;
  error?: unknown; onRetry?: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={`h-5 w-5 ${color}`} />
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-24" /> : error ? (
          // Never a figure here on failure. A KPI tile is read at a glance and believed; showing
          // $0 because the request 500'd is worse than showing nothing at all.
          <QueryError error={error} onRetry={onRetry} variant="inline" className="h-8 items-center" />
        ) : (
          <>
            <p className="text-2xl font-bold">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────
function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-44 text-muted-foreground">
      <AlertCircle className="h-8 w-8 mb-2 opacity-30" />
      <p className="text-sm">No {label} data yet</p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  // Each chart owns its own request, so one failing endpoint costs one panel rather than the page.
  const kpiQ = useKpi();
  const revenueQ = useMonthlyRevenue();
  const apptQ = useAppointmentStats();
  const growthQ = usePatientGrowth();
  const funnelQ = useLeadFunnel();

  const { data: kpi } = kpiQ;
  const { data: revenue } = revenueQ;
  const { data: apptStats } = apptQ;
  const { data: growth } = growthQ;
  const { data: funnel } = funnelQ;

  const hasRevenue = revenue?.some((r) => r.revenue > 0);
  const hasGrowth = growth?.some((g) => g.newPatients > 0);
  const hasAppts = (apptStats?.length ?? 0) > 0;
  const hasFunnel = funnel?.stages?.some((s) => s.count > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground mt-1">Clinic analytics & performance overview</p>
      </div>

      {/* KPI row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Revenue"
          value={fmt(kpi?.totalRevenue ?? 0)}
          sub={`${fmt(kpi?.revenueThisMonth ?? 0)} this month`}
          icon={DollarSign} color="text-success"
          loading={kpiQ.isLoading} error={kpiQ.isError ? kpiQ.error : undefined} onRetry={kpiQ.refetch}
        />
        <KpiCard
          label="Active Patients"
          value={String(kpi?.totalPatients ?? 0)}
          sub={`+${kpi?.newPatientsThisMonth ?? 0} this month`}
          icon={Users} color="text-blue-500"
          loading={kpiQ.isLoading} error={kpiQ.isError ? kpiQ.error : undefined} onRetry={kpiQ.refetch}
        />
        <KpiCard
          label="Appointments"
          value={String(kpi?.totalAppointments ?? 0)}
          sub={`${kpi?.completionRate ?? 0}% completion rate`}
          icon={Calendar} color="text-accent-foreground"
          loading={kpiQ.isLoading} error={kpiQ.isError ? kpiQ.error : undefined} onRetry={kpiQ.refetch}
        />
        <KpiCard
          label="Lead Conversion"
          value={`${funnel?.summary.conversionRate ?? 0}%`}
          sub={`${funnel?.summary.won ?? 0} won · ${funnel?.summary.lost ?? 0} lost`}
          icon={TrendingUp} color="text-indigo-500"
          loading={funnelQ.isLoading}
          error={funnelQ.isError ? funnelQ.error : undefined}
          onRetry={funnelQ.refetch}
        />
      </div>

      {/* Revenue chart + Appointment pie */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>Monthly Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            {revenueQ.isLoading ? <Skeleton className="h-56 w-full" />
              : revenueQ.isError ? <QueryError error={revenueQ.error} onRetry={revenueQ.refetch} />
              : hasRevenue ? (
              <RevenueAreaChart data={revenue ?? []} />
            ) : <EmptyChart label="revenue" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appointments by Status</CardTitle>
          </CardHeader>
          <CardContent>
            {apptQ.isLoading ? <Skeleton className="h-56 w-full" />
              : apptQ.isError ? <QueryError error={apptQ.error} onRetry={apptQ.refetch} />
              : hasAppts ? (
              <AppointmentStatusPieChart data={apptStats ?? []} />
            ) : <EmptyChart label="appointment" />}
          </CardContent>
        </Card>
      </div>

      {/* Patient growth + Lead funnel */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Patient Growth</CardTitle>
          </CardHeader>
          <CardContent>
            {growthQ.isLoading ? <Skeleton className="h-56 w-full" />
              : growthQ.isError ? <QueryError error={growthQ.error} onRetry={growthQ.refetch} />
              : hasGrowth ? (
              <PatientGrowthBarChart data={growth ?? []} />
            ) : <EmptyChart label="patient growth" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lead Pipeline Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            {funnelQ.isLoading ? <Skeleton className="h-56 w-full" />
              : funnelQ.isError ? <QueryError error={funnelQ.error} onRetry={funnelQ.refetch} />
              : hasFunnel ? (
              <>
                <LeadFunnelBarChart stages={funnel?.stages ?? []} />
                <div className="mt-3 flex gap-4 text-sm">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle className="h-4 w-4 text-success" />
                    <span><strong>{funnel?.summary.won}</strong> Won</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="destructive" className="text-xs px-1.5 py-0">{funnel?.summary.lost} Lost</Badge>
                  </div>
                  <span className="text-muted-foreground ml-auto">{funnel?.summary.conversionRate}% conversion</span>
                </div>
              </>
            ) : <EmptyChart label="lead funnel" />}
          </CardContent>
        </Card>
      </div>

      {/* Overdue invoices alert */}
      {(kpi?.overdueInvoices ?? 0) > 0 && (
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-orange-500 shrink-0" />
            <p className="text-sm">
              <strong>{kpi?.overdueInvoices}</strong> overdue invoice{kpi?.overdueInvoices !== 1 ? 's' : ''} — go to{' '}
              <a href="/finance" className="underline text-orange-700 dark:text-orange-400">Finance</a> to follow up.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
