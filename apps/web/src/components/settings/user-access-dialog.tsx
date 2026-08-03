'use client';

import { useEffect, useState } from 'react';
import { KeyRound, LogOut, ShieldOff, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { MIN_PASSWORD_LENGTH, PASSWORD_RULES, passwordProblems } from '@dental-crm/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useResetUserPassword,
  useRevokeUserSessions,
  useSetUserActive,
  useUpdateUser,
  useUserSessions,
  type User,
} from '@/hooks/use-users';

/**
 * Controls one person's access: their sign-in email, their password, whether the account is on,
 * and whether their existing sessions survive.
 *
 * Each action is separate and states its own consequence, rather than being folded into one "save"
 * — turning an account off and changing someone's password are different decisions with different
 * blast radii, and a single button would hide which one just happened.
 */
export function UserAccessDialog({
  user,
  currentUserId,
  open,
  onClose,
}: {
  user: User | null;
  currentUserId?: string;
  open: boolean;
  onClose: () => void;
}) {
  const updateUser = useUpdateUser();
  const resetPassword = useResetUserPassword();
  const revokeSessions = useRevokeUserSessions();
  const setActive = useSetUserActive();
  const { data: sessions } = useUserSessions(open && user ? user.id : null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (open && user) {
      setEmail(user.email);
      setPassword('');
    }
  }, [open, user]);

  if (!user) return null;

  const isSelf = user.id === currentUserId;

  const saveEmail = () => {
    if (!email.trim() || email === user.email) return;
    updateUser.mutate(
      { id: user.id, email: email.trim() },
      {
        onSuccess: () => toast.success('Sign-in email updated'),
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not update the email'),
      },
    );
  };

  // The same function the API validates with, so the dialog cannot promise something the server
  // will refuse. Shown live rather than on submit: an admin choosing a password for someone else
  // should not have to guess at the rules and be told no afterwards.
  const problems = password ? passwordProblems(password, {
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  }) : [];

  const doReset = () => {
    if (problems.length > 0) {
      toast.error(problems[0]);
      return;
    }
    resetPassword.mutate(
      { id: user.id, newPassword: password },
      {
        onSuccess: () => {
          setPassword('');
          toast.success('Password changed and every session signed out');
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not reset the password'),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Access — {user.firstName} {user.lastName}
          </DialogTitle>
          <DialogDescription>
            {sessions ? (
              <>
                {sessions.active} active session{sessions.active === 1 ? '' : 's'}.
              </>
            ) : (
              'Checking sessions…'
            )}{' '}
            Access tokens last 15 minutes, so signing someone out closes the renewal rather than
            cutting them off mid-request. Turning the account off is the immediate lever.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="access-email">Sign-in email</Label>
            <div className="flex gap-2">
              <Input
                id="access-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button
                variant="outline"
                onClick={saveEmail}
                disabled={updateUser.isPending || !email.trim() || email === user.email}
              >
                Save
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="access-password">Set a new password</Label>
            <div className="flex gap-2">
              <Input
                id="access-password"
                type="password"
                autoComplete="new-password"
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={problems.length > 0}
                aria-describedby="access-password-rules"
              />
              <Button
                variant="outline"
                onClick={doReset}
                disabled={resetPassword.isPending || !password || problems.length > 0}
              >
                <KeyRound className="mr-2 h-4 w-4" />
                Reset
              </Button>
            </div>

            <div id="access-password-rules" className="space-y-1">
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

            <p className="text-xs text-muted-foreground">
              Tell them the new password over a channel they already trust, and ask them to change
              it. This also signs them out everywhere.
            </p>
          </div>

          <div className="space-y-2 border-t pt-4">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() =>
                revokeSessions.mutate(user.id, {
                  onSuccess: () => toast.success('Signed out of every device'),
                  onError: () => toast.error('Could not sign them out'),
                })
              }
              disabled={revokeSessions.isPending}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out of all devices
            </Button>

            {user.isActive ? (
              <Button
                variant="outline"
                className="w-full justify-start text-destructive hover:text-destructive"
                // An admin switching off their own account is locked out immediately, including
                // from the request that would undo it — the API refuses it, and so does this.
                disabled={setActive.isPending || isSelf}
                onClick={() =>
                  setActive.mutate(
                    { id: user.id, active: false },
                    {
                      onSuccess: () => toast.success('Account turned off and sessions ended'),
                      onError: (e) =>
                        toast.error(e instanceof Error ? e.message : 'Could not turn the account off'),
                    },
                  )
                }
              >
                <ShieldOff className="mr-2 h-4 w-4" />
                {isSelf ? 'You cannot turn off your own account' : 'Turn off this account'}
              </Button>
            ) : (
              <Button
                variant="outline"
                className="w-full justify-start"
                disabled={setActive.isPending}
                onClick={() =>
                  setActive.mutate(
                    { id: user.id, active: true },
                    {
                      onSuccess: () => toast.success('Account turned back on — they must sign in again'),
                      onError: () => toast.error('Could not turn the account on'),
                    },
                  )
                }
              >
                <ShieldCheck className="mr-2 h-4 w-4" />
                Turn this account back on
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
