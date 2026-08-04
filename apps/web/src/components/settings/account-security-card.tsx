'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Copy, KeyRound, Loader2, Monitor, ShieldCheck, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { MIN_PASSWORD_LENGTH, PASSWORD_RULES, passwordProblems } from '@dental-crm/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { QueryError } from '@/components/ui/query-state';
import { useAuth } from '@/context/auth-context';
import {
  useBeginTwoFactor,
  useChangeOwnPassword,
  useConfirmTwoFactor,
  useDisableTwoFactor,
  useOwnSessions,
  useRevokeOwnSession,
  useTwoFactorStatus,
} from '@/hooks/use-account-security';

/**
 * Your own account security: password, second factor, and where you are signed in.
 *
 * Everything here was previously an administrator's job or did not exist. Someone who suspected
 * their account was compromised had to find an admin and explain why, at exactly the moment speed
 * matters most.
 */
export function AccountSecurityCard() {
  return (
    <div className="space-y-4">
      <ChangePasswordSection />
      <TwoFactorSection />
      <SessionsSection />
    </div>
  );
}

function ChangePasswordSection() {
  const change = useChangeOwnPassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');

  const problems = next ? passwordProblems(next) : [];
  const canSubmit = !!current && !!next && problems.length === 0;

  const submit = () =>
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          setCurrent('');
          setNext('');
          toast.success('Password changed. Every other device has been signed out.');
        },
        onError: (e) => toast.error(e.message),
      },
    );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Your password</CardTitle>
        <CardDescription>Changing it signs out every other device.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="next-password">New password</Label>
            <Input
              id="next-password"
              type="password"
              autoComplete="new-password"
              placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              aria-invalid={problems.length > 0}
            />
          </div>
        </div>

        {problems.length > 0 ? (
          problems.map((p) => (
            <p key={p} className="text-xs text-destructive">
              {p}
            </p>
          ))
        ) : (
          <ul className="text-xs text-muted-foreground">
            {PASSWORD_RULES.map((rule) => (
              <li key={rule}>· {rule}</li>
            ))}
          </ul>
        )}

        <div className="flex justify-end">
          <Button onClick={submit} disabled={!canSubmit || change.isPending}>
            {change.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Change password
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TwoFactorSection() {
  const status = useTwoFactorStatus();
  const begin = useBeginTwoFactor();
  const confirm = useConfirmTwoFactor();
  const disable = useDisableTwoFactor();

  const [enrolment, setEnrolment] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [password, setPassword] = useState('');

  const start = () =>
    begin.mutate(undefined as void, {
      onSuccess: (data) => setEnrolment(data),
      onError: (e) => toast.error(e.message),
    });

  const finish = () =>
    confirm.mutate(
      { code: code.trim() },
      {
        onSuccess: (data) => {
          setEnrolment(null);
          setCode('');
          // Shown once and never again — they are stored only as hashes, exactly like a password.
          setRecoveryCodes(data.recoveryCodes);
        },
        onError: (e) => toast.error(e.message),
      },
    );

  const turnOff = () =>
    disable.mutate(
      { currentPassword: password },
      {
        onSuccess: () => {
          setPassword('');
          toast.success('Two-factor authentication is off.');
        },
        onError: (e) => toast.error(e.message),
      },
    );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          Two-factor authentication
          {status.data?.enabled && (
            <Badge variant="success" className="gap-1">
              <ShieldCheck className="h-3 w-3" /> On
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          A code from your phone, on top of your password. This system holds passport scans and
          medical histories — without it, one stolen password is all of it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.isLoading ? (
          <Skeleton className="h-9 w-40" />
        ) : status.isError ? (
          <QueryError error={status.error} onRetry={status.refetch} variant="inline" />
        ) : recoveryCodes ? (
          <RecoveryCodes codes={recoveryCodes} onDone={() => setRecoveryCodes(null)} />
        ) : status.data?.enabled ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {status.data.recoveryCodesRemaining} recovery code
              {status.data.recoveryCodesRemaining === 1 ? '' : 's'} left.
              {status.data.recoveryCodesRemaining <= 2 && (
                <span className="text-warning-muted-foreground">
                  {' '}
                  Turn 2FA off and on again to get a fresh set.
                </span>
              )}
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="disable-password" className="text-xs text-muted-foreground">
                  Your password, to turn it off
                </Label>
                <Input
                  id="disable-password"
                  type="password"
                  autoComplete="current-password"
                  className="w-56"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button variant="outline" onClick={turnOff} disabled={!password || disable.isPending}>
                <ShieldOff className="mr-2 h-4 w-4" />
                Turn off
              </Button>
            </div>
          </div>
        ) : enrolment ? (
          <div className="space-y-3">
            <p className="text-sm">
              Scan this with Google Authenticator, 1Password, or any authenticator app, then enter
              the six-digit code it shows.
            </p>
            <Image
              src={enrolment.qrDataUrl}
              alt="Two-factor setup QR code"
              width={180}
              height={180}
              className="rounded-md border bg-white p-2"
              unoptimized
            />
            <p className="text-xs text-muted-foreground">
              Camera not cooperating? Enter this key by hand:{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono">{enrolment.secret}</code>
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="totp-code" className="text-xs text-muted-foreground">
                  Code from the app
                </Label>
                <Input
                  id="totp-code"
                  autoComplete="one-time-code"
                  className="w-40"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <Button onClick={finish} disabled={code.trim().length < 6 || confirm.isPending}>
                {confirm.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Turn on
              </Button>
              <Button variant="ghost" onClick={() => setEnrolment(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={start} disabled={begin.isPending}>
            {begin.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <KeyRound className="mr-2 h-4 w-4" />
            Set up two-factor
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Recovery codes, shown exactly once.
 *
 * They are stored only as hashes, so there is no way to show them again. That has to be said
 * plainly here, or someone closes the panel and finds out months later when their phone is gone.
 */
function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div className="space-y-3 rounded-md border border-warning bg-warning-muted p-4">
      <p className="text-sm font-medium">Save these recovery codes now</p>
      <p className="text-xs text-warning-muted-foreground">
        Each works once, in place of your phone. They are stored hashed, so this is the only time
        they can be shown — if you lose both your phone and these, an administrator has to reset
        your account.
      </p>
      <div className="grid grid-cols-2 gap-1.5 font-mono text-sm sm:grid-cols-4">
        {codes.map((c) => (
          <span key={c} className="rounded bg-background/70 px-2 py-1 text-center">
            {c}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(codes.join('\n'));
            toast.success('Copied. Put them somewhere that is not this computer.');
            setAcknowledged(true);
          }}
        >
          <Copy className="mr-2 h-3.5 w-3.5" />
          Copy all
        </Button>
        <Button size="sm" onClick={onDone} disabled={!acknowledged}>
          I have saved them
        </Button>
      </div>
    </div>
  );
}

function SessionsSection() {
  const sessions = useOwnSessions();
  const revoke = useRevokeOwnSession();
  const { user } = useAuth();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Where you are signed in</CardTitle>
        <CardDescription>
          Signed in as {user?.email}. Anything you do not recognise should be ended, and your
          password changed.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {sessions.isLoading ? (
          <div className="space-y-2 p-6">
            {[...Array(2)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : sessions.isError ? (
          <QueryError error={sessions.error} onRetry={sessions.refetch} className="py-10" />
        ) : !sessions.data?.length ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">No active sessions.</p>
        ) : (
          <div className="divide-y">
            {sessions.data.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 px-6 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Monitor className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      {describeAgent(s.userAgent)}
                      {s.current && (
                        <Badge variant="outline" className="ml-2">
                          This device
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.createdByIp ?? 'unknown address'} · started{' '}
                      {format(new Date(s.createdAt), 'PPp')}
                    </p>
                  </div>
                </div>
                {!s.current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      revoke.mutate(s.id, {
                        onSuccess: () => toast.success('Session ended'),
                        onError: (e) => toast.error(e.message),
                      })
                    }
                  >
                    End
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * A user-agent string, reduced to something a person can recognise.
 *
 * Deliberately coarse. The goal is "is this me?", and the full string is unreadable noise that
 * makes the answer harder rather than easier.
 */
function describeAgent(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const browser =
    /edg/i.test(userAgent) ? 'Edge'
    : /chrome|crios/i.test(userAgent) ? 'Chrome'
    : /firefox|fxios/i.test(userAgent) ? 'Firefox'
    : /safari/i.test(userAgent) ? 'Safari'
    : 'Browser';
  const platform =
    /iphone|ipad/i.test(userAgent) ? 'iOS'
    : /android/i.test(userAgent) ? 'Android'
    : /mac os/i.test(userAgent) ? 'macOS'
    : /windows/i.test(userAgent) ? 'Windows'
    : /linux/i.test(userAgent) ? 'Linux'
    : 'unknown platform';
  return `${browser} on ${platform}`;
}
