'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Save, UserPlus, Shield } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useClinicSettings, useUpdateClinicSettings } from '@/hooks/use-reports';
import { useUsers } from '@/hooks/use-users';

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  CLINIC_MANAGER: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  RECEPTION: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  SALES_CONSULTANT: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  DENTIST: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
};

const TIMEZONES = [
  'UTC', 'Europe/Istanbul', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Asia/Dubai', 'Asia/Riyadh', 'Asia/Kuwait', 'Asia/Cairo', 'Africa/Cairo',
  'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Asia/Singapore',
];

const CURRENCIES = ['USD', 'EUR', 'GBP', 'TRY', 'SAR', 'AED', 'EGP', 'KWD', 'QAR', 'JOD'];

function ClinicSettingsForm() {
  const { data: settings, isLoading } = useClinicSettings();
  const update = useUpdateClinicSettings();

  const [form, setForm] = useState({
    clinicName: '', address: '', city: '', country: '',
    timezone: 'Europe/Istanbul', currency: 'USD',
  });

  useEffect(() => {
    if (settings) {
      setForm({
        clinicName: settings.clinicName ?? '',
        address: settings.address ?? '',
        city: settings.city ?? '',
        country: settings.country ?? '',
        timezone: settings.timezone ?? 'Europe/Istanbul',
        currency: settings.currency ?? 'USD',
      });
    }
  }, [settings]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    if (!form.clinicName.trim()) { toast.error('Clinic name is required'); return; }
    update.mutate(form, {
      onSuccess: () => toast.success('Settings saved'),
      onError: () => toast.error('Failed to save settings'),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clinic Information</CardTitle>
        <CardDescription>Basic details shown on invoices and reports</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <Label>Clinic Name *</Label>
              <Input value={form.clinicName} onChange={(e) => set('clinicName', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>City</Label>
                <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Country</Label>
                <Input value={form.country} onChange={(e) => set('country', e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Timezone</Label>
                <Select value={form.timezone} onValueChange={(v) => set('timezone', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Default Currency</Label>
                <Select value={form.currency} onValueChange={(v) => set('currency', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={handleSave} disabled={update.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {update.isPending ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function UserManagement() {
  const { data: users, isLoading } = useUsers();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>All staff accounts and their roles</CardDescription>
        </div>
        <Button variant="outline" size="sm" disabled>
          <UserPlus className="h-4 w-4 mr-2" />
          Add User
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : (
          <div className="divide-y">
            {users?.map((u) => (
              <div key={u.id} className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                    {u.firstName[0]}{u.lastName[0]}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{u.firstName} {u.lastName}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {u.specialization && (
                    <span className="text-xs text-muted-foreground hidden sm:block">{u.specialization}</span>
                  )}
                  <Badge className={ROLE_COLORS[u.role] ?? ''} variant="outline">
                    {u.role.replace(/_/g, ' ')}
                  </Badge>
                  {!u.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Clinic configuration and team management</p>
      </div>

      <ClinicSettingsForm />

      <Separator />

      <UserManagement />

      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        <Shield className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
        <p>
          Role changes and new staff accounts are managed via{' '}
          <code className="bg-muted px-1 rounded text-xs">POST /api/users</code>.
          WhatsApp, Facebook and SMS credentials go in{' '}
          <code className="bg-muted px-1 rounded text-xs">apps/api/.env</code>.
        </p>
      </div>
    </div>
  );
}
