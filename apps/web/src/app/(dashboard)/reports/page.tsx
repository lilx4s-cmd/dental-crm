'use client';

import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { TrendingUp, Users, Calendar, DollarSign, AlertCircle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  useKpi, useMonthlyRevenue, useAppointmentStats,
  usePatientGrowth, useLeadFunnel,
} from '@/hooks/use-reports';

// ─── Colors ──────────────────────────────────────────────────────────────────
const STAGE_COLORS: Record<string, string> = {
  NEW_LEAD: '#6366f1', CONTACTED: '#8b5cf6', QUALIFIED: '#a78bfa',
  CONSULTATION_SCHEDULED: '#3b82f6', CONSULTATION_DONE: '#06b6d4',
  TREATMENT_PROPOSED: '#10b981', NEGOTIATION: '#f59e0b', WON: '#22c55e', LOST: '#ef4444',
};
const APPT_COLORS: Record<string, string> = {
  SCHEDULED: '#6366f1', CONFIRMED: '#3b82f6', IN_PROGRESS: '#f59e0b',
  COMPLETED: '#22c55e', CANCELLED: '#ef4444', NO_SHOW: '#f97316',
};
const PIE_PALETTE = ['#6366f1', '#8b5cf6', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

// ─── KPI card ────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, icon: Icon, color, loading,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={`h-5 w-5 ${color}`} />
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-24" /> : (
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
  const { data: kpi, isLoading: kpiLoading } = useKpi();
  const { data: revenue, isLoading: revLoading } = useMonthlyRevenue();
  const { data: apptStats, isLoading: apptLoading } = useAppointmentStats();
  const { data: growth, isLoading: growthLoading } = usePatientGrowth();
  const { data: funnel, isLoading: funnelLoading } = useLeadFunnel();

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
          value={kpiLoading ? '—' : fmt(kpi?.totalRevenue ?? 0)}
          sub={kpiLoading ? undefined : `${fmt(kpi?.revenueThisMonth ?? 0)} this month`}
          icon={DollarSign} color="text-green-500" loading={kpiLoading}
        />
        <KpiCard
          label="Active Patients"
          value={kpiLoading ? '—' : String(kpi?.totalPatients ?? 0)}
          sub={kpiLoading ? undefined : `+${kpi?.newPatientsThisMonth ?? 0} this month`}
          icon={Users} color="text-blue-500" loading={kpiLoading}
        />
        <KpiCard
          label="Appointments"
          value={kpiLoading ? '—' : String(kpi?.totalAppointments ?? 0)}
          sub={kpiLoading ? undefined : `${kpi?.completionRate ?? 0}% completion rate`}
          icon={Calendar} color="text-purple-500" loading={kpiLoading}
        />
        <KpiCard
          label="Lead Conversion"
          value={kpiLoading ? '—' : `${funnel?.summary.conversionRate ?? 0}%`}
          sub={kpiLoading ? undefined : `${funnel?.summary.won ?? 0} won · ${funnel?.summary.lost ?? 0} lost`}
          icon={TrendingUp} color="text-indigo-500" loading={kpiLoading || funnelLoading}
        />
      </div>

      {/* Revenue chart + Appointment pie */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>Monthly Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            {revLoading ? <Skeleton className="h-56 w-full" /> : hasRevenue ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={revenue} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} width={48} />
                  <Tooltip formatter={(v) => [fmt(Number(v)), 'Revenue']} />
                  <Area type="monotone" dataKey="revenue" stroke="#6366f1" fill="url(#revGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyChart label="revenue" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appointments by Status</CardTitle>
          </CardHeader>
          <CardContent>
            {apptLoading ? <Skeleton className="h-56 w-full" /> : hasAppts ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={apptStats} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={80} label={({ status, percent }: { status?: string; percent?: number }) => `${String(status).replace(/_/g, ' ')} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                    {apptStats?.map((entry, i) => (
                      <Cell key={i} fill={APPT_COLORS[entry.status] ?? PIE_PALETTE[i % PIE_PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, name) => [v, String(name).replace(/_/g, ' ')]} />
                </PieChart>
              </ResponsiveContainer>
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
            {growthLoading ? <Skeleton className="h-56 w-full" /> : hasGrowth ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={growth} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                  <Tooltip />
                  <Legend iconType="circle" iconSize={8} />
                  <Bar dataKey="newPatients" name="New Patients" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="total" name="Total" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart label="patient growth" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lead Pipeline Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            {funnelLoading ? <Skeleton className="h-56 w-full" /> : hasFunnel ? (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={funnel?.stages} layout="vertical" margin={{ top: 0, right: 8, left: 100, bottom: 0 }}>
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="stage" tick={{ fontSize: 10 }} width={100}
                      tickFormatter={(v) => v.replace(/_/g, ' ')} />
                    <Tooltip formatter={(v) => [v, 'Leads']} labelFormatter={(l) => String(l).replace(/_/g, ' ')} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {funnel?.stages.map((entry, i) => (
                        <Cell key={i} fill={STAGE_COLORS[entry.stage] ?? PIE_PALETTE[i % PIE_PALETTE.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-3 flex gap-4 text-sm">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle className="h-4 w-4 text-green-500" />
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
