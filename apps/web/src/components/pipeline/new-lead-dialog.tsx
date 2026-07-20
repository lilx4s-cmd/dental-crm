'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateLead, type CreateLeadPayload } from '@/hooks/use-leads';
import { useUsers } from '@/hooks/use-users';
import { useAuth } from '@/context/auth-context';

const LEAD_SOURCES = [
  { value: 'WALK_IN', label: 'Walk-in' },
  { value: 'PHONE', label: 'Phone call' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'FACEBOOK_ADS', label: 'Facebook Ad' },
  { value: 'INSTAGRAM_ADS', label: 'Instagram Ad' },
  { value: 'GOOGLE', label: 'Google Ad' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'WEBSITE', label: 'Website' },
  { value: 'OTHER', label: 'Other' },
];

const ASSIGNABLE_ROLES = ['SUPER_ADMIN', 'CLINIC_MANAGER', 'SALES_CONSULTANT', 'RECEPTION'];

const schema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().optional(),
  source: z.string().min(1, 'Required'),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  whatsappNumber: z.string().optional(),
  estimatedValue: z.coerce.number().optional(),
  notes: z.string().optional(),
  assignedToId: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function NewLeadDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const createLead = useCreateLead();
  const [source, setSource] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  const { user } = useAuth();
  const { data: users } = useUsers();

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  // Default the assignee to whoever is creating the lead — otherwise a lead
  // left on "unassigned" used to disappear from every non-admin's pipeline view
  // the moment it was created, since that view is scoped to assignedToId.
  useEffect(() => {
    if (open && user?.sub && !assignedToId) {
      setAssignedToId(user.sub);
      setValue('assignedToId', user.sub);
    }
  }, [open, user?.sub, assignedToId, setValue]);

  const assignableUsers = (users ?? []).filter((u) => u.isActive && ASSIGNABLE_ROLES.includes(u.role));

  async function onSubmit(data: FormValues) {
    try {
      const payload: CreateLeadPayload = {
        firstName: data.firstName,
        lastName: data.lastName || undefined,
        source: data.source,
        phone: data.phone || undefined,
        email: data.email || undefined,
        whatsappNumber: data.whatsappNumber || undefined,
        estimatedValue: data.estimatedValue || undefined,
        notes: data.notes || undefined,
        assignedToId: data.assignedToId || undefined,
      };
      await createLead.mutateAsync(payload);
      toast.success('Lead created');
      reset();
      setSource('');
      setAssignedToId('');
      setOpen(false);
    } catch {
      toast.error('Failed to create lead');
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Lead</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>First name *</Label>
              <Input {...register('firstName')} />
              {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Last name</Label>
              <Input {...register('lastName')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Source *</Label>
            <Select value={source} onValueChange={(v) => { setSource(v); setValue('source', v); }}>
              <SelectTrigger>
                <SelectValue placeholder="How did they find you?" />
              </SelectTrigger>
              <SelectContent>
                {LEAD_SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.source && <p className="text-xs text-destructive">{errors.source.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Assigned to</Label>
            <Select value={assignedToId} onValueChange={(v) => { setAssignedToId(v); setValue('assignedToId', v); }}>
              <SelectTrigger>
                <SelectValue placeholder="Assign to a team member" />
              </SelectTrigger>
              <SelectContent>
                {assignableUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.firstName} {u.lastName}{u.id === user?.sub ? ' (you)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input {...register('phone')} />
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp</Label>
              <Input {...register('whatsappNumber')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" {...register('email')} />
          </div>
          <div className="space-y-1.5">
            <Label>Estimated value (USD)</Label>
            <Input type="number" min={0} {...register('estimatedValue')} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input {...register('notes')} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createLead.isPending}>
              {createLead.isPending ? 'Creating…' : 'Create Lead'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
