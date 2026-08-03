'use client';

// See revenue-area-chart.tsx: split out purely to keep recharts out of the reports first-load JS.
// The Won/Lost summary strip below this chart stays in the page — it doesn't touch recharts.
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { STAGE_LABELS, stageDef } from '@dental-crm/shared';
import { PIE_PALETTE } from './colors';
import type { LeadFunnelStage } from '@/hooks/use-reports';

export default function LeadFunnelBarChart({ stages }: { stages: LeadFunnelStage[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={stages} layout="vertical" margin={{ top: 0, right: 8, left: 100, bottom: 0 }}>
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
        <YAxis
          type="category"
          dataKey="stage"
          tick={{ fontSize: 10 }}
          width={100}
          tickFormatter={(v: string) => STAGE_LABELS[v] ?? v.replace(/_/g, ' ')}
        />
        <Tooltip
          formatter={(v) => [v, 'Leads']}
          labelFormatter={(l) => STAGE_LABELS[String(l)] ?? String(l).replace(/_/g, ' ')}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {stages.map((entry, i) => (
            <Cell key={i} fill={stageDef(entry.stage)?.color ?? PIE_PALETTE[i % PIE_PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
