'use client';

// Loaded via next/dynamic(ssr:false) from dashboard/page.tsx so recharts ships in its own chunk
// instead of the route's first-load JS (P-2).
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export interface PipelineStageDatum {
  stage: string;
  count: number;
  value: number;
  color: string;
}

export default function PipelineStageBarChart({ data }: { data: PipelineStageDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 0, right: 8, left: 0, bottom: 24 }}>
        <XAxis dataKey="stage" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(value, name) => [value, name === 'count' ? 'Leads' : 'Value']}
          labelStyle={{ fontWeight: 600 }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
