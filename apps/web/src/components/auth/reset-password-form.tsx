'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { MIN_PASSWORD_LENGTH, PASSWORD_RULES, passwordProblems } from '@dental-crm/shared';

import { apiRequest } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

/**
 * Sets a new password from an emailed link.
 *
 * The rules are shown as the user types, from the same function the API enforces — someone who has
 * just been locked out of their own system should not then be argued with by a form.
 */
export function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problems = password ? passwordProblems(password) : [];
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = !!token && !!password && problems.length === 0 && confirm === password;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiRequest('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword: password }),
      });
      setDone(true);
      toast.success('Password changed. You can sign in now.');
      // Long enough to read the confirmation, short enough not to feel stuck.
      setTimeout(() => router.push('/login'), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set the new password.');
    } finally {
      setSaving(false);
    }
  };

  // A link that arrived without a token cannot be recovered by anything the user types here.
  if (!token) {
    return (
      <Card className="border-0 shadow-xl">
        <CardContent className="space-y-3 py-8 text-center">
          <p className="font-medium">This link is incomplete</p>
          <p className="text-sm text-muted-foreground">
            Open the link straight from the email rather than copying part of it.
          </p>
          <Button variant="outline" asChild className="mt-2">
            <Link href="/forgot-password">Request a new link</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (done) {
    return (
      <Card className="border-0 shadow-xl">
        <CardContent className="space-y-3 py-8 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
          <p className="font-medium">Password changed</p>
          <p className="text-sm text-muted-foreground">
            Every other device has been signed out. Taking you to the sign-in page…
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-xl">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">Set a new password</CardTitle>
        <CardDescription>This also signs you out everywhere else.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={problems.length > 0}
              aria-describedby="password-rules"
            />
            <div id="password-rules" className="space-y-1 pt-0.5">
              {problems.length > 0 ? (
                problems.map((problem) => (
                  <p key={problem} className="text-xs text-destructive">
                    {problem}
                  </p>
                ))
              ) : (
                <ul className="text-xs text-muted-foreground">
                  {PASSWORD_RULES.map((rule) => (
                    <li key={rule}>· {rule}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={mismatch}
            />
            {mismatch && <p className="text-xs text-destructive">These do not match.</p>}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={saving || !canSubmit}>
            {saving ? 'Saving…' : 'Set password'}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            <Link href="/login" className="underline underline-offset-2">
              Back to sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
