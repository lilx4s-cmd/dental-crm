'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';

import { apiRequest } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

/**
 * Requests a reset link.
 *
 * The confirmation deliberately does not say whether the address was recognised — it cannot,
 * without becoming a way to ask which addresses belong to clinic staff. The wording is therefore
 * about what *will* happen if the address is known, rather than about what was found.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('sending');
    setError(null);
    try {
      await apiRequest('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() }),
      });
      setState('sent');
    } catch (err) {
      // Only genuine failures land here — a rate limit, or the server being unreachable. An
      // unknown address is a success as far as this screen is concerned.
      setError(err instanceof Error ? err.message : 'Could not send the reset link.');
      setState('idle');
    }
  };

  if (state === 'sent') {
    return (
      <Card className="border-0 shadow-xl">
        <CardContent className="space-y-3 py-8 text-center">
          <MailCheck className="mx-auto h-10 w-10 text-success" />
          <p className="font-medium">Check your email</p>
          <p className="text-sm text-muted-foreground">
            If <span className="font-medium text-foreground">{email.trim()}</span> belongs to a
            clinic account, a reset link is on its way. It works once, and expires in an hour.
          </p>
          <p className="pt-2 text-sm text-muted-foreground">
            Nothing arrived? Check the spam folder, then{' '}
            <button type="button" className="underline underline-offset-2" onClick={() => setState('idle')}>
              try again
            </button>
            .
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-xl">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">Forgot your password</CardTitle>
        <CardDescription>
          We&apos;ll email you a link to set a new one.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@clinic.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={state === 'sending' || !email.trim()}>
            {state === 'sending' ? 'Sending…' : 'Send reset link'}
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
