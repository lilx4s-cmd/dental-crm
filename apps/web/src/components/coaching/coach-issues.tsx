'use client';
import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { CoachIssue,useCoachAction } from '@/hooks/use-coaching';
export function CoachIssues({ issues,supervisor=false }:{ issues:CoachIssue[];supervisor?:boolean }) {
  const action = useCoachAction();
  const [opened,setOpened] = useState<string|null>(null);
  const [note,setNote] = useState('');
  const [operation,setOperation] = useState('remind');
  const [dismissReason,setDismissReason] = useState('Incorrect data');
  const submit = (issue:CoachIssue) => action.mutate({ path:`issues/${issue.id}/${operation}`,body:{ note:operation==='dismiss'?`${dismissReason}: ${note}`:note } },{ onSuccess:() => { setOpened(null);setNote('');toast.success('Issue updated'); },onError:(e) => toast.error(e.message) });
  return <div className="space-y-3">{issues.map((issue) => <article key={issue.id} className={`rounded-lg border p-4 ${issue.severity==='RED'?'border-destructive/40':'border-border'}`}>
    <div className="flex flex-wrap items-center gap-2"><Badge variant={issue.severity==='RED'?'destructive':issue.severity==='ORANGE'?'warning':'secondary'}>{issue.severity}{issue.escalatedAt?' · Escalated':''}</Badge><h3 className="font-semibold">{issue.title}</h3></div>
    {issue.lead && <p className="mt-2 text-sm font-medium">{issue.lead.firstName} {issue.lead.lastName}{issue.assignedUser?` · ${issue.assignedUser.firstName} ${issue.assignedUser.lastName}`:''}</p>}
    <p className="mt-2 text-sm text-muted-foreground">{issue.description}</p><p className="mt-1 text-sm">{issue.recommendedAction}</p>
    <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" asChild><Link href={issue.actionPath ?? `/pipeline?leadId=${issue.leadId}`}>{issue.ruleKey==='PATIENT_WAITING_REPLY'?'Reply now':'Open patient'}</Link></Button>
      {!supervisor && issue.status==='OPEN' && <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => action.mutate({ path:`issues/${issue.id}/acknowledge` },{ onError:(e) => toast.error(e.message) })}>I’ve seen this</Button>}
      {supervisor && <Button size="sm" variant="outline" onClick={() => { setOpened(opened===issue.id?null:issue.id);setNote(''); }}>Supervisor action</Button>}
    </div>
    {opened===issue.id && <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault();submit(issue); }}>
      <select aria-label="Supervisor action" className="h-9 rounded border bg-background px-2 text-sm" value={operation} onChange={(e) => setOperation(e.target.value)}><option value="remind">Remind salesperson</option><option value="dismiss">Dismiss false warning</option><option value="resolve">Resolve with note</option><option value="escalate">Escalate</option></select>
      {operation==='dismiss' && <select aria-label="Dismissal reason" className="ml-2 h-9 rounded border bg-background px-2 text-sm" value={dismissReason} onChange={(e) => setDismissReason(e.target.value)}>{['Incorrect data','Patient asked us to wait','Already handled outside CRM','Technical issue','Other'].map((r) => <option key={r}>{r}</option>)}</select>}
      <Input aria-label="Reason or instruction" placeholder="Reason or instruction (required)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1800}/>
      <Button size="sm" disabled={note.trim().length<3 || action.isPending}>Save</Button>
      {operation==='resolve' && <p className="text-xs text-muted-foreground">If the underlying problem remains, the rule will detect it again. Use dismissal for a false warning.</p>}
    </form>}
  </article>)}</div>;
}
