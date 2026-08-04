'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { LoginSchema, isTwoFactorChallenge, type LoginDto } from '@dental-crm/shared';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export function LoginForm() {
  const { login, completeTwoFactor } = useAuth();
  const [loading, setLoading] = useState(false);
  // Held only for the seconds between the password step and the code step. Nothing is signed in
  // while this exists — the token proves the password checked out and grants nothing else.
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm<LoginDto>({
    resolver: zodResolver(LoginSchema),
  });

  const onSubmit = async (data: LoginDto) => {
    setLoading(true);
    try {
      const result = await login(data.email, data.password);
      if (isTwoFactorChallenge(result)) setChallengeToken(result.challengeToken);
      // Otherwise the context has already redirected.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeToken) return;
    setLoading(true);
    try {
      await completeTwoFactor(challengeToken, code.trim());
    } catch (err) {
      // The challenge lives five minutes; an expired one has to start over rather than leaving
      // the user typing codes at a token that will never be accepted again.
      const message = err instanceof Error ? err.message : 'That code is not right.';
      toast.error(message);
      if (/expired/i.test(message)) {
        setChallengeToken(null);
        setCode('');
      }
    } finally {
      setLoading(false);
    }
  };

  if (challengeToken) {
    return (
      <Card className="shadow-xl border-0">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl">Enter your code</CardTitle>
          <CardDescription>
            From your authenticator app. A recovery code works too, if your phone is not to hand.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submitCode} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="code">Authentication code</Label>
              <Input
                id="code"
                // `one-time-code` is what lets iOS and Android offer the code from the SMS/app
                // sheet instead of making someone switch apps and memorise six digits.
                autoComplete="one-time-code"
                inputMode="text"
                autoFocus
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || code.trim().length < 6}>
              {loading ? 'Checking…' : 'Verify'}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => { setChallengeToken(null); setCode(''); }}
              >
                Start again
              </button>
            </p>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-xl border-0">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl">Sign In</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@clinic.com" {...register('email')} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="password">Password</Label>
              {/* The only route to account recovery. Without it the reset flow exists but nobody
                  can reach it, which is the same as not having built it. */}
              <Link
                href="/forgot-password"
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Forgot password?
              </Link>
            </div>
            <Input id="password" type="password" placeholder="••••••••" {...register('password')} />
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
