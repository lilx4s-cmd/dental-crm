'use client';
import { useState } from 'react';
import Link from 'next/link';
import { hasPermission } from '@dental-crm/shared';
import { useAuth } from '@/context/auth-context';
import { useCoaching,CoachIssue } from '@/hooks/use-coaching';
import { CoachIssues } from './coach-issues';
import { QueryError } from '@/components/ui/query-state';
type Summary = { counts:Array<{ ruleKey:string;severity:string;_count:{ _all:number } }>;employees:Array<{ id:string;firstName:string;lastName:string;red:number;orange:number;yellow:number;openLeads:number }>;instructions:Array<{ id:string;message:string;status:string;salesperson:{ firstName:string;lastName:string } }> };
export function TeamAttention({ expanded=false }:{ expanded?:boolean }) {
  const { user } = useAuth();
  const visible=hasPermission(user,'supervision.view',hasPermission(user,'issues.view_team',hasPermission(user,'leads.review',user?.role==='SUPER_ADMIN') || user?.role==='CLINIC_MANAGER'));
  const [employee,setEmployee] = useState('');
  const [severity,setSeverity] = useState('');
  const [rule,setRule] = useState('');
  const [country,setCountry] = useState('');
  const [source,setSource] = useState('');
  const [stage,setStage] = useState('');
  const query=useCoaching<Summary>('summary',visible);
  const params=new URLSearchParams(Object.entries({ employeeId:employee,severity,ruleKey:rule,country,source,stage }).filter(([,value]) => !!value));
  const issues=useCoaching<{ issues:CoachIssue[];total:number }>(`issues?${params}`,visible && expanded);
  if (!visible) return null;
  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch}/>;
  if (!query.data) return <p role="status">Loading team attention…</p>;
  const count=(key:string) => query.data!.counts.filter((c) => c.ruleKey===key).reduce((sum,c) => sum+c._count._all,0);
  return <section aria-label="Team attention" className="space-y-4 rounded-lg border p-4"><h2 className="text-lg font-semibold">Team attention</h2><div className="flex flex-wrap gap-x-6 gap-y-2 text-sm"><span>{count('NEW_LEAD_NOT_CONTACTED')} untouched leads</span><span>{count('PATIENT_WAITING_REPLY')} patients waiting for replies</span><span>{count('OVERDUE_FOLLOW_UP')} overdue follow-ups</span><span>{count('STUCK_IN_STAGE')} stuck leads</span><span>{count('DOCTOR_REVIEW_DELAY')} delayed doctor reviews</span></div>
  {!expanded?<Link href="/supervision" className="inline-block text-sm underline">Review team issues</Link>:<>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{query.data.employees.map((e) => <button key={e.id} className="rounded border p-3 text-left" onClick={() => setEmployee(e.id)}><p className="font-medium">{e.firstName} {e.lastName}</p><p className="text-sm text-muted-foreground">Red {e.red} · Orange {e.orange} · Yellow {e.yellow}</p><p className="text-xs">{e.openLeads} open leads</p></button>)}</div>
    <div className="grid gap-2 sm:grid-cols-3"><select aria-label="Employee filter" className="h-9 rounded border bg-background px-2 text-sm" value={employee} onChange={(e) => setEmployee(e.target.value)}><option value="">All supervised employees</option>{query.data.employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}</select><select aria-label="Severity filter" className="h-9 rounded border bg-background px-2 text-sm" value={severity} onChange={(e) => setSeverity(e.target.value)}><option value="">All priorities</option>{['RED','ORANGE','YELLOW'].map((s) => <option key={s}>{s}</option>)}</select><select aria-label="Rule filter" className="h-9 rounded border bg-background px-2 text-sm" value={rule} onChange={(e) => setRule(e.target.value)}><option value="">All issue types</option>{[...new Set(query.data.counts.map((c) => c.ruleKey))].map((r) => <option key={r}>{r}</option>)}</select>{[['Country code',country,setCountry],['Source',source,setSource],['Stage',stage,setStage]].map(([label,value,setter]) => <input key={String(label)} aria-label={String(label)} placeholder={String(label)} className="h-9 rounded border bg-background px-2 text-sm" value={String(value)} onChange={(e) => (setter as (s:string) => void)(e.target.value)}/>)}</div>
    {issues.isError?<QueryError error={issues.error} onRetry={issues.refetch}/>:issues.data?.issues.length?<><CoachIssues issues={issues.data.issues} supervisor/><p className="text-xs text-muted-foreground">Showing {issues.data.issues.length} of {issues.data.total} matching issues.</p></>:<p className="text-sm text-muted-foreground">No active issues in this view.</p>}
    {query.data.instructions.length>0 && <details><summary className="cursor-pointer text-sm">Instruction history</summary>{query.data.instructions.map((i) => <p key={i.id} className="mt-2 text-sm">{i.salesperson.firstName}: {i.message} · {i.status}</p>)}</details>}
  </>}
  </section>;
}
