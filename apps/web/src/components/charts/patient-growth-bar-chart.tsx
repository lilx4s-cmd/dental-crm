'use client';

// See revenue-area-chart.tsx: split out purely to keep recharts out of the reports first-load JS.
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { PatientGrowth } from '@/hooks/use-reports';

export default function PatientGrowthBarChart({ data }: { data: PatientGrowth[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
        <Tooltip />
        <Legend iconType="circle" iconSize={8} />
        <Bar dataKey="newPatients" name="New Patients" fill="#6366f1" radius={[4, 4, 0, 0]} />
        <Bar dataKey="total" name="Total" fill="#06b6d4" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
