'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  useCreateLeadTask,
  useDeleteLeadTask,
  useLeadTasks,
  useUpdateLeadTask,
  type LeadTask,
} from '@/hooks/use-leads';
import { useUsers } from '@/hooks/use-users';
import { taskUrgency } from './lead-task-badge';

/** Today in the yyyy-mm-dd shape a date input expects, in local time rather than UTC. */
function todayValue(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

const DUE_STYLES: Record<ReturnType<typeof taskUrgency>, string> = {
  overdue: 'text-destructive',
  today: 'text-warning-muted-foreground',
  upcoming: 'text-muted-foreground',
};

export function LeadTasksSection({ leadId }: { leadId: string }) {
  const { data: tasks, isLoading } = useLeadTasks(leadId);
  const { data: users } = useUsers();
  const createTask = useCreateLeadTask();
  const updateTask = useUpdateLeadTask();
  const deleteTask = useDeleteLeadTask();

  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(todayValue());
  const [assignedToId, setAssignedToId] = useState('');

  const reset = () => {
    setTitle('');
    setDueDate(todayValue());
    setAssignedToId('');
    setAdding(false);
  };

  const submit = () => {
    if (!title.trim()) {
      toast.error('Give the task a title');
      return;
    }
    createTask.mutate(
      {
        leadId,
        title: title.trim(),
        // The input gives a bare date; send it as local midday so a timezone shift either way
        // cannot roll the task onto the wrong day.
        dueDate: new Date(`${dueDate}T12:00:00`).toISOString(),
        assignedToId: assignedToId || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Task added');
          reset();
        },
        onError: () => toast.error('Could not add the task'),
      },
    );
  };

  const open = (tasks ?? []).filter((t) => !t.completedAt);
  const done = (tasks ?? []).filter((t) => t.completedAt);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Tasks</h3>
        {!adding && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-3 w-3" /> Add task
          </Button>
        )}
      </div>

      {adding && (
        <div className="mb-3 space-y-2 rounded-md border p-2">
          <Input
            className="h-8 text-xs"
            placeholder="What needs doing? e.g. Call back about x-rays"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            autoFocus
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Due</Label>
              <Input
                className="h-8 text-xs"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Responsible</Label>
              <Select value={assignedToId} onValueChange={setAssignedToId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Lead owner" />
                </SelectTrigger>
                <SelectContent>
                  {users?.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.firstName} {u.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={reset}>
              Cancel
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={submit} disabled={createTask.isPending}>
              {createTask.isPending ? 'Adding…' : 'Add'}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : open.length === 0 && done.length === 0 ? (
        <p className="text-xs text-muted-foreground">No tasks yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {[...open, ...done].map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onToggle={(completed) => updateTask.mutate({ taskId: task.id, leadId, completed })}
              onDelete={() => deleteTask.mutate(task.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
  onDelete,
}: {
  task: LeadTask;
  onToggle: (completed: boolean) => void;
  onDelete: () => void;
}) {
  const isDone = !!task.completedAt;
  const urgency = taskUrgency(task.dueDate);
  const due = new Date(task.dueDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  return (
    <li className="flex items-start gap-2 rounded px-1 py-1 text-xs hover:bg-muted/50">
      <Checkbox
        className="mt-0.5"
        checked={isDone}
        onCheckedChange={(c) => onToggle(c === true)}
        aria-label={isDone ? `Reopen ${task.title}` : `Complete ${task.title}`}
      />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate', isDone && 'text-muted-foreground line-through')}>{task.title}</p>
        <p className="text-[11px]">
          {/* A finished task's date is history, so it stops shouting once it is ticked off. */}
          <span className={isDone ? 'text-muted-foreground' : DUE_STYLES[urgency]}>{due}</span>
          {task.assignedTo && (
            <span className="text-muted-foreground">
              {' '}
              · {task.assignedTo.firstName} {task.assignedTo.lastName}
            </span>
          )}
        </p>
      </div>
      <button
        type="button"
        aria-label={`Delete ${task.title}`}
        className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}
