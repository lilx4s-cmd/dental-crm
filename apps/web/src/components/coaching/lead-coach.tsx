'use client';
import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Role,hasPermission } from '@dental-crm/shared';
import { useAuth } from '@/context/auth-context';
import { CoachIssue,useCoaching,useCoachAction } from '@/hooks/use-coaching';
import { CoachIssues } from './coach-issues';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { QueryError } from '@/components/ui/query-state';
type Requirement = { key:string;label:string;category:string;required:boolean };
type Data = { issues:CoachIssue[];health:string;assignees:Array<{ id:string;firstName:string;lastName:string }>;requirements:Requirement[];reviewers:Array<{ id:string;firstName:string;lastName:string }>;plans:Array<{ id:string;title:string;totalCost:string;currency:string }>;quotes:Array<{ id:string;version:number;total:string;currency:string;sentAt:string;changeReason:string }>;lead:{ assignedToId:string|null;supervisorId:string|null;waitingReason:string|null;reviewAt:string|null;temperature:string;assessment:{ status:string;checklist:Record<string,boolean>;treatmentCategory:string;reviewerId:string|null;clinicalNotes:string|null }|null;tasks:Array<{ dueDate:string;title:string }>;paymentPromises:Array<{ id:string;amount:string;currency:string;dueAt:string;status:string }> } };
export function LeadCoach({ leadId,clinicalOnly=false }:{ leadId:string;clinicalOnly?:boolean }) {
  const { user } = useAuth();
  const query = useCoaching<Data>(`leads/${leadId}`,!!leadId);
  const action = useCoachAction();
  const [category,setCategory] = useState<string|null>(null);
  const [checklist,setChecklist] = useState<Record<string,boolean>|null>(null);
  const [reviewer,setReviewer] = useState('');
  const [clinicalNotes,setClinicalNotes] = useState('');
  const [instruction,setInstruction] = useState('');
  const data=query.data;
  const supervisor = hasPermission(user,'supervision.manage',hasPermission(user,'leads.review',user?.role==='SUPER_ADMIN') || user?.role==='CLINIC_MANAGER');
  const canEdit = hasPermission(user,'leads.write',user?.role!=='DENTIST');
  const run = (path:string,body:unknown,method='POST') => action.mutate({ path,body,method },{ onSuccess:() => toast.success('Saved'),onError:(e) => toast.error(e.message) });
  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch}/>;
  if (!data) return <p className="text-sm" role="status">Loading Sales Coach…</p>;
  const assessment=data.lead.assessment;
  const activeCategory=category ?? assessment?.treatmentCategory ?? 'DENTAL';
  const activeChecklist=checklist ?? assessment?.checklist ?? {};
  return <section aria-label="Sales Coach" className="space-y-3 rounded-lg border p-4">
    <div><h2 className="font-semibold">Sales Coach</h2>{!data.issues.length && <p className="mt-1 text-sm text-success">Everything is on track.{data.lead.tasks[0]?` Next: ${data.lead.tasks[0].title}, ${new Date(data.lead.tasks[0].dueDate).toLocaleString()}.`:''}</p>}</div>
    <CoachIssues issues={data.issues} supervisor={supervisor}/>
    {!clinicalOnly && canEdit && <details><summary className="cursor-pointer text-sm font-medium">Next step, waiting state & temperature</summary><form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault();const f=new FormData(e.currentTarget);const review=f.get('reviewAt') as string;run(`leads/${leadId}/waiting`,{ reason:f.get('reason') || null,temperature:f.get('temperature'),...(review?{ reviewAt:new Date(review).toISOString() }:{}) },'PATCH'); }}>
      <select name="reason" aria-label="Waiting reason" defaultValue={data.lead.waitingReason ?? ''} className="h-9 w-full rounded border bg-background px-2 text-sm"><option value="">No waiting state</option>{['PATIENT','DOCTOR','XRAY','PAYMENT','TRAVEL_DATE','DECISION'].map((r) => <option key={r} value={r}>Waiting for {r.toLowerCase().replace('_',' ')}</option>)}</select>
      <Input name="reviewAt" type="datetime-local" aria-label="Waiting review time"/>
      <select name="temperature" aria-label="Lead temperature" defaultValue={data.lead.temperature} className="h-9 w-full rounded border bg-background px-2 text-sm">{['HOT','WARM','COLD'].map((t) => <option key={t}>{t}</option>)}</select>
      <Button size="sm" disabled={action.isPending}>Save next step</Button><p className="text-xs text-muted-foreground">Waiting needs a review time. Schedule a follow-up in the Tasks section when you plan to contact the patient.</p>
    </form></details>}
    <details open={clinicalOnly}><summary className="cursor-pointer text-sm font-medium">Assessment checklist & doctor review</summary><div className="mt-3 space-y-3">
      <p className="text-sm">Status: {assessment?.status.replaceAll('_',' ').toLowerCase() ?? 'Not started'}</p>
      {!clinicalOnly && canEdit && assessment?.status!=='COMPLETED' && <><select aria-label="Treatment category" value={activeCategory} onChange={(e) => { setCategory(e.target.value);setChecklist({}); }} className="h-9 w-full rounded border bg-background px-2 text-sm">{[...new Set(data.requirements.map((r) => r.category))].map((c) => <option key={c}>{c}</option>)}</select>
      <p className="text-xs text-muted-foreground">Verify each item against the patient’s files or recorded answers. Checking an item records your confirmation.</p>
      {data.requirements.filter((r) => r.category===activeCategory).map((r) => <label key={r.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={activeChecklist[r.key]===true} onChange={(e) => setChecklist({ ...activeChecklist,[r.key]:e.target.checked })}/>{r.label}{r.required?' *':''}</label>)}
      <Button size="sm" disabled={action.isPending} onClick={() => run(`leads/${leadId}/assessment`,{ category:activeCategory,checklist:activeChecklist },'PATCH')}>Save verified checklist</Button>
      <select aria-label="Clinical reviewer" value={reviewer} onChange={(e) => setReviewer(e.target.value)} className="h-9 w-full rounded border bg-background px-2 text-sm"><option value="">Choose doctor / clinical reviewer</option>{data.reviewers.map((r) => <option key={r.id} value={r.id}>{r.firstName} {r.lastName}</option>)}</select>
      <Button size="sm" disabled={!reviewer || action.isPending} onClick={() => run(`leads/${leadId}/assessment/request`,{ reviewerId:reviewer })}>Request doctor review</Button></>}
      {assessment?.clinicalNotes && <p className="whitespace-pre-wrap rounded bg-muted p-3 text-sm">{assessment.clinicalNotes}</p>}
      {assessment && assessment.status==='UNDER_REVIEW' && (assessment.reviewerId===user?.sub || user?.role===Role.SUPER_ADMIN) && <><Textarea aria-label="Final clinical notes" value={clinicalNotes} onChange={(e) => setClinicalNotes(e.target.value)} placeholder="Clinical assessment and recommendation"/><Button size="sm" disabled={clinicalNotes.trim().length<3 || action.isPending} onClick={() => run(`leads/${leadId}/assessment/complete`,{ note:clinicalNotes })}>Complete clinical assessment</Button></>}
    </div></details>
    {!clinicalOnly && canEdit && <details><summary className="cursor-pointer text-sm font-medium">Formal treatment offer</summary><div className="mt-3 space-y-2">{data.quotes.map((q) => <p key={q.id} className="text-sm">V{q.version} · {q.total} {q.currency} · {q.changeReason}</p>)}<form className="space-y-2" onSubmit={(e) => { e.preventDefault();const f=new FormData(e.currentTarget);run(`leads/${leadId}/quotes`,{ planId:f.get('planId'),reason:f.get('reason') }); }}><select name="planId" required aria-label="Existing treatment plan" className="h-9 w-full rounded border bg-background px-2 text-sm"><option value="">Choose the patient’s treatment plan</option>{data.plans.map((p) => <option value={p.id} key={p.id}>{p.title} · {p.totalCost} {p.currency}</option>)}</select><Input required minLength={3} name="reason" aria-label="Quote issue or revision reason" placeholder="Reason for this offer / revision"/><Button size="sm" disabled={action.isPending || !data.plans.length}>Record sent offer & schedule follow-up</Button><p className="text-xs text-muted-foreground">Use after sharing the plan with the patient. This saves an immutable snapshot and does not send a message.</p></form></div></details>}
    {!clinicalOnly && canEdit && <details><summary className="cursor-pointer text-sm font-medium">Promised payment</summary><div className="mt-3 space-y-2">{data.lead.paymentPromises.map((p) => <p key={p.id} className="text-sm">{p.amount} {p.currency} · {new Date(p.dueAt).toLocaleString()} · {p.status}</p>)}<form className="space-y-2" onSubmit={(e) => { e.preventDefault();const f=new FormData(e.currentTarget);run(`leads/${leadId}/payment-promises`,{ amount:Number(f.get('amount')),currency:f.get('currency'),dueAt:new Date(f.get('dueAt') as string).toISOString() }); }}><Input aria-label="Promised amount" name="amount" type="number" min="0.01" step="0.01" required placeholder="Amount"/><select name="currency" aria-label="Payment currency" className="h-9 w-full rounded border bg-background px-2 text-sm">{['USD','EUR','GBP','TRY'].map((c) => <option key={c}>{c}</option>)}</select><Input aria-label="Promised payment deadline" name="dueAt" type="datetime-local" required/><Button size="sm" disabled={action.isPending}>Save promise</Button></form></div></details>}
    {!clinicalOnly && supervisor && <details><summary className="cursor-pointer text-sm font-medium">Supervisor instruction & reassignment</summary><div className="mt-3 space-y-2"><Textarea aria-label="Supervisor instruction" placeholder="Tell the salesperson what to do next" value={instruction} onChange={(e) => setInstruction(e.target.value)}/><Button size="sm" disabled={instruction.trim().length<3 || action.isPending} onClick={() => run('instructions',{ leadId,message:instruction,priority:'ORANGE' })}>Send in-app instruction</Button><form className="space-y-2" onSubmit={(e) => { e.preventDefault();const f=new FormData(e.currentTarget);run(`leads/${leadId}/reassign`,{ assigneeId:f.get('assigneeId'),note:f.get('note') }); }}><select name="assigneeId" required aria-label="New salesperson" className="h-9 w-full rounded border bg-background px-2 text-sm"><option value="">Choose salesperson</option>{data.assignees.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}</select><Input name="note" required minLength={3} aria-label="Reassignment reason" placeholder="Reason for reassignment"/><Button size="sm" disabled={action.isPending}>Reassign lead and open tasks</Button></form></div></details>}
    <Link className="text-xs underline" href={`/inbox?lead=${leadId}`}>Open linked conversations</Link>
  </section>;
}
