'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ACCESS_MODULES, SPECIAL_PERMISSIONS, PERMISSION_KEYS } from '@dental-crm/shared';
import { toast } from 'sonner';
import { useAuth } from '@/context/auth-context';
import { useUsers } from '@/hooks/use-users';
import { apiRequest } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QueryError } from '@/components/ui/query-state';

type Profile = {
  id: string;
  name: string;
  permissions: Record<string, boolean>;
  _count: { users: number };
};
function template(supervisor: boolean) {
  const permissions = Object.fromEntries(PERMISSION_KEYS.map((key) => [key, false]));
  for (const key of [
    'leads.read',
    'leads.write',
    'conversations.read',
    'settings.read',
    'calls.read',
    ...(supervisor
      ? [
          'leads.all',
          'leads.assign',
          'leads.review',
          'conversations.all',
          'conversations.supervise',
        ]
      : [
          'conversations.write',
          'conversations.send',
          'calls.place',
          'plans.read',
          'plans.write',
          'appointments.read',
        ]),
  ])
    permissions[key] = true;
  return permissions;
}
export default function AccessPage() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState('Salesperson');
  const [permissions, setPermissions] = useState<Record<string, boolean>>(template(false));
  const profiles = useQuery<Profile[]>({
    queryKey: ['access-profiles'],
    queryFn: () => apiRequest('/api/access/profiles', {}, accessToken ?? undefined),
  });
  const users = useUsers();
  const save = useMutation({
    mutationFn: () =>
      apiRequest<Profile>(
        `/api/access/profiles${id ? `/${id}` : ''}`,
        { method: id ? 'PATCH' : 'POST', body: JSON.stringify({ name, permissions }) },
        accessToken ?? undefined,
      ),
    onSuccess: (profile) => {
      setId(profile.id);
      qc.invalidateQueries({ queryKey: ['access-profiles'] });
      toast.success('Access profile saved. Assigned users now use these permissions.');
    },
    onError: (e) => toast.error(e.message),
  });
  const assign = useMutation({
    mutationFn: ({ userId, profileId }: { userId: string; profileId: string | null }) =>
      apiRequest(
        `/api/access/users/${userId}/profile`,
        { method: 'PATCH', body: JSON.stringify({ profileId }) },
        accessToken ?? undefined,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['access-profiles'] });
      toast.success('Access updated');
    },
    onError: (e) => toast.error(e.message),
  });
  function toggle(key: string, checked: boolean) {
    setPermissions((current) => {
      const next = { ...current, [key]: checked };
      if (checked && key.endsWith('.write')) next[key.replace('.write', '.read')] = true;
      if (!checked && key.endsWith('.read'))
        for (const candidate of PERMISSION_KEYS.filter((k) =>
          k.startsWith(key.split('.')[0] + '.'),
        ))
          next[candidate] = false;
      if (checked && key.startsWith('leads.')) next['leads.read'] = true;
      if (checked && key === 'leads.assign') next['leads.all'] = true;
      if (checked && key.startsWith('conversations.')) next['conversations.read'] = true;
      if (checked && key === 'conversations.supervise') next['conversations.all'] = true;
      if (!checked && key === 'leads.all') next['leads.assign'] = false;
      if (!checked && key === 'conversations.all') next['conversations.supervise'] = false;
      return next;
    });
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Access Control</h1>
        <p className="mt-2 text-muted-foreground">
          Create reusable access profiles and assign them to staff. Only owner accounts can change
          access or manage user accounts.
        </p>
      </div>
      {profiles.isError && <QueryError error={profiles.error} onRetry={profiles.refetch} />}
      <div className="flex flex-wrap gap-2">
        {profiles.data?.map((profile) => (
          <Button
            key={profile.id}
            variant={id === profile.id ? 'default' : 'outline'}
            onClick={() => {
              setId(profile.id);
              setName(profile.name);
              setPermissions(profile.permissions);
            }}
          >
            {profile.name} ({profile._count.users})
          </Button>
        ))}
        <Button
          variant="outline"
          onClick={() => {
            setId(null);
            setName('Salesperson');
            setPermissions(template(false));
          }}
        >
          New salesperson profile
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setId(null);
            setName('Sales Supervisor');
            setPermissions(template(true));
          }}
        >
          New supervisor profile
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{id ? 'Edit access profile' : 'Create access profile'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <label className="block text-sm font-medium">
            Profile name
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className="mt-2 max-w-md"
            />
          </label>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Workspace</th>
                  <th className="p-2">View</th>
                  <th className="p-2">Edit</th>
                </tr>
              </thead>
              <tbody>
                {ACCESS_MODULES.map(([resource, label]) => (
                  <tr key={resource} className="border-b">
                    <td className="p-2">{label}</td>
                    {['read', 'write'].map((action) => (
                      <td key={action} className="p-2">
                        {resource === 'reports' && action === 'write' ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <input
                            type="checkbox"
                            aria-label={`${label}: ${action}`}
                            checked={permissions[`${resource}.${action}`] === true}
                            onChange={(e) => toggle(`${resource}.${action}`, e.target.checked)}
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Editing covers routine workspace changes. Owner-only account administration, database
            cleanup and permanent deletion stay protected. Existing clinical and financial data
            boundaries still apply to record-specific operations.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {SPECIAL_PERMISSIONS.map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={permissions[key] === true}
                  onChange={(e) => toggle(key, e.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Viewing a module does not automatically expose every salesperson’s leads or work-account
            conversations. Use the separate “see all” controls to delegate team oversight. Saving a
            profile updates every person assigned to it.
          </p>
          <Button disabled={save.isPending || name.trim().length < 2} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Save access profile'}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Assign access to staff</CardTitle>
        </CardHeader>
        <CardContent>
          {users.isError ? (
            <QueryError error={users.error} onRetry={users.refetch} />
          ) : users.isLoading ? (
            <p role="status">Loading staff…</p>
          ) : (
            <div className="space-y-3">
              {users.data?.map((person) => (
                <div
                  key={person.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b pb-3"
                >
                  <div>
                    <p className="font-medium">
                      {person.firstName} {person.lastName}
                      {!person.isActive && ' · Inactive'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Base role: {person.role.replaceAll('_', ' ')}
                    </p>
                  </div>
                  {person.role === 'SUPER_ADMIN' ? (
                    <span className="text-sm text-muted-foreground">Owner · access protected</span>
                  ) : (
                    <select
                      aria-label={`Access profile for ${person.firstName} ${person.lastName}`}
                      className="rounded border bg-background p-2 text-sm"
                      value={person.accessProfileId ?? ''}
                      disabled={assign.isPending || profiles.isLoading}
                      onChange={(e) =>
                        assign.mutate({ userId: person.id, profileId: e.target.value || null })
                      }
                    >
                      <option value="">Use base role defaults</option>
                      {profiles.data?.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
