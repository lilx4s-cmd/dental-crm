'use client';

// See revenue-area-chart.tsx: split out purely to keep recharts out of the reports first-load JS.
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { APPT_COLORS, PIE_PALETTE } from './colors';
import type { AppointmentStat } from '@/hooks/use-reports';

export default function AppointmentStatusPieChart({ data }: { data: AppointmentStat[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="status"
          cx="50%"
          cy="50%"
          outerRadius={80}
          label={({ status, percent }: { status?: string; percent?: number }) =>
            `${String(status).replace(/_/g, ' ')} ${((percent ?? 0) * 100).toFixed(0)}%`}
          labelLine={false}
          fontSize={10}
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={APPT_COLORS[entry.status] ?? PIE_PALETTE[i % PIE_PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v, name) => [v, String(name).replace(/_/g, ' ')]} />
      </PieChart>
    </ResponsiveContainer>
  );
}
