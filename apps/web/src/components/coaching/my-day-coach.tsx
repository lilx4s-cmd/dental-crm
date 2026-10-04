'use client';
import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useAuth } from '@/context/auth-context';
import { useCoaching,useCoachAction,CoachIssue,CoachLead } from '@/hooks/use-coaching';
import { useUpdateLeadTask } from '@/hooks/use-leads';
import { LeadCoach } from './lead-coach';
import { CoachIssues } from './coach-issues';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QueryError } from '@/components/ui/query-state';
type Task = { id:string;title:string;dueDate:string;rescheduleCount:number;lead:CoachLead };
type Instruction = { id:string;message:string;priority:string;lead:CoachLead;supervisor:{ firstName:string;lastName:string } };
type Day = { firstName?:string; issues:CoachIssue[];instructions:Instruction[];tasks:Task[];waiting:Array<CoachLead & { waitingReason:string|null;reviewAt:string|null;assessment:{ status:string }|null;paymentPromises:Array<{ amount:string;currency:string;dueAt:string }>;patient:{ appointments:Array<{ startTime:string }> }|null }>;clinical:Array<{ leadId:string;lead:CoachLead }>;notifications:Array<{ id:string;title:string;body:string }>;doneToday:{ contacts:number;replies:number;followUps:number;quotes:number;bookings:number };timezone:string };
function TaskItem({ task }:{ task:Task }) {
  const update = useUpdateLeadTask();
  const [reschedule,setReschedule] = useState(false);
  const [date,setDate] = useState('');
  const [reason,setReason] = useState('');
  return <div className="rounded border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><Link className="font-medium underline" href={`/pipeline?leadId=${task.lead.id}`}>{task.lead.firstName} {task.lead.lastName}</Link><p className="text-sm">{task.title}</p><p className="text-xs text-muted-foreground">{new Date(task.dueDate).toLocaleString()}{task.rescheduleCount?` · Rescheduled ${task.rescheduleCount} times`:''}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" disabled={update.isPending} onClick={() => update.mutate({ taskId:task.id,completed:true },{ onError:(e) => toast.error(e.message) })}>Done</Button><Button size="sm" variant="ghost" onClick={() => setReschedule(!reschedule)}>Reschedule</Button></div></div>
  {reschedule && <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault();update.mutate({ taskId:task.id,dueDate:new Date(date).toISOString(),rescheduleReason:reason },{ onSuccess:() => setReschedule(false),onError:(err) => toast.error(err.message) }); }}><Input aria-label="New follow-up time" type="datetime-local" className="w-auto" required value={date} onChange={(e) => setDate(e.target.value)}/><Input aria-label="Reschedule reason" placeholder="Why is the date changing?" required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} className="min-w-40 flex-1"/><Button size="sm" disabled={update.isPending}>Save</Button></form>}
  </div>;
}
export function MyDayCoach() {
  const { user } = useAuth();
  const query = useCoaching<Day>('my-day');
  const action = useCoachAction();
  const [clinicalLead,setClinicalLead] = useState<string|null>(null);
  const data = query.data;
  if (query.isError) return <QueryError error={query.error} onRetry={query.refetch}/>;
  if (!data) return <p role="status">Loading your next actions…</p>;
  return <div className="space-y-6">
    <div><h1 className="text-3xl font-bold">Hello, {data.firstName ?? 'there'}</h1><p className="mt-1 text-muted-foreground">Your patients, your next steps, and help from your supervisor.</p></div>
    {data.instructions.length>0 && <section aria-label="Supervisor instructions" className="space-y-2">{data.instructions.map((instruction) => <article key={instruction.id} className="rounded-lg border border-primary/30 bg-primary/5 p-4"><p className="text-sm font-semibold">From {instruction.supervisor.firstName} {instruction.supervisor.lastName} · {instruction.lead.firstName}</p><p className="my-2">{instruction.message}</p><Button size="sm" disabled={action.isPending} onClick={() => action.mutate({ path:`instructions/${instruction.id}/complete` },{ onError:(e) => toast.error(e.message) })}>Mark done</Button></article>)}</section>}
    <section aria-label="Do now"><h2 className="mb-3 text-lg font-semibold">Do now</h2>{data.issues.length?<CoachIssues issues={data.issues}/>:<div className="rounded-lg border border-dashed p-5"><p className="font-medium">You’re caught up. No urgent issues.</p><p className="mt-1 text-sm text-muted-foreground">{data.tasks[0]?`Next follow-up: ${new Date(data.tasks[0].dueDate).toLocaleString()}`:'Choose a next step for each active patient.'}</p></div>}</section>
    <section aria-label="Next tasks"><h2 className="mb-3 text-lg font-semibold">Next</h2><div className="space-y-2">{data.tasks.map((task) => <TaskItem key={task.id} task={task}/>)}{!data.tasks.length && <p className="text-sm text-muted-foreground">No scheduled follow-ups.</p>}</div></section>
    <section aria-label="Waiting"><h2 className="mb-3 text-lg font-semibold">Waiting</h2><div className="space-y-2">{data.waiting.map((lead) => <div key={lead.id} className="rounded border p-3 text-sm"><Link href={`/pipeline?leadId=${lead.id}`} className="font-medium underline">{lead.firstName} {lead.lastName}</Link><p className="text-muted-foreground">{lead.waitingReason?`Waiting for ${lead.waitingReason.toLowerCase().replace('_',' ')}`:lead.assessment?'Doctor review pending':lead.paymentPromises.length?'Payment expected':'Appointment upcoming'}{lead.reviewAt?` · Review ${new Date(lead.reviewAt).toLocaleString()}`:''}</p></div>)}{!data.waiting.length && <p className="text-sm text-muted-foreground">No timed waiting states.</p>}</div></section>
    {data.clinical.length>0 && <section><h2 className="mb-2 text-lg font-semibold">Your clinical reviews</h2>{data.clinical.map((review) => <button key={review.leadId} className="mr-3 text-sm underline" onClick={() => setClinicalLead(review.leadId)}>{review.lead.firstName} {review.lead.lastName}</button>)}</section>}
    {clinicalLead && <LeadCoach leadId={clinicalLead} clinicalOnly/>}
    <section aria-label="Done today" className="rounded-lg border p-4"><h2 className="font-semibold">Done today</h2><p className="mt-2 text-sm">Contacts {data.doneToday.contacts} · Replies {data.doneToday.replies} · Follow-ups {data.doneToday.followUps} · Quotes {data.doneToday.quotes} · Bookings {data.doneToday.bookings}</p><p className="mt-1 text-xs text-muted-foreground">Clinic day: {data.timezone}. Counts use recorded CRM activity.</p></section>
    {data.notifications.length>0 && <details className="rounded border p-3"><summary className="cursor-pointer text-sm font-medium">Updates ({data.notifications.length})</summary>{data.notifications.map((n) => <div key={n.id} className="mt-3 border-t pt-2 text-sm"><p className="font-medium">{n.title}</p><p className="text-muted-foreground">{n.body}</p><Button size="sm" variant="ghost" onClick={() => action.mutate({ path:`notifications/${n.id}/read` },{ onError:(e) => toast.error(e.message) })}>Mark read</Button></div>)}</details>}
  </div>;
}
