'use client';

import { Lock, RefreshCw, ServerCrash, WifiOff } from 'lucide-react';

import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * What a screen shows when its data didn't arrive.
 *
 * Every dashboard page used to read only `isLoading`, so a failed request landed in exactly the
 * same branch as a successful empty one: `/reports/kpi` returning 500 rendered `$0` total revenue,
 * indistinguishable from a clinic that genuinely billed nothing. That is the worst possible
 * failure mode for a number someone makes decisions on — it is not visibly broken, so it gets
 * believed. A list page was less dangerous but just as wrong: "No patients yet" for a clinic with
 * a thousand of them.
 *
 * Three failures need three different sentences, which is why `ApiError` carries the status:
 * a permission denial is not a fault and offering Retry on it is a lie; an unreachable server is
 * the user's network as often as ours; a 500 is ours and retrying is worth a try.
 */

type ErrorShape = {
  icon: typeof ServerCrash;
  title: string;
  detail: string;
  /** False where retrying cannot change the answer, so no button is offered. */
  retryable: boolean;
};

export function describeError(error: unknown): ErrorShape {
  if (error instanceof ApiError) {
    if (error.isOffline) {
      return {
        icon: WifiOff,
        title: "Can't reach the server",
        detail: 'Check your connection — nothing has been lost.',
        retryable: true,
      };
    }
    if (error.isForbidden) {
      return {
        icon: Lock,
        title: 'Not available to your role',
        detail: 'Ask an administrator if you need access to this.',
        retryable: false,
      };
    }
    if (error.status === 404) {
      return { icon: ServerCrash, title: 'Not found', detail: error.message, retryable: false };
    }
    if (error.isPermanent) {
      return { icon: ServerCrash, title: "Couldn't load this", detail: error.message, retryable: false };
    }
  }
  return {
    icon: ServerCrash,
    title: "Couldn't load this",
    detail: error instanceof Error ? error.message : 'Something went wrong on our side.',
    retryable: true,
  };
}

export function QueryError({
  error,
  onRetry,
  className,
  /** `page` fills a route, `panel` sits inside a card body, `inline` replaces a single value. */
  variant = 'panel',
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
  variant?: 'page' | 'panel' | 'inline';
}) {
  const { icon: Icon, title, detail, retryable } = describeError(error);
  const retry = retryable && onRetry ? onRetry : undefined;

  if (variant === 'inline') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-sm text-muted-foreground', className)}>
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {title}
        {retry && (
          <button type="button" onClick={retry} className="underline underline-offset-2 hover:text-foreground">
            Retry
          </button>
        )}
      </span>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        variant === 'page' ? 'min-h-[50vh] gap-3' : 'h-44 gap-2',
        className,
      )}
      role="alert"
    >
      <Icon className={cn('text-muted-foreground/40', variant === 'page' ? 'h-10 w-10' : 'h-8 w-8')} />
      <div>
        <p className={cn('font-medium', variant === 'page' ? 'text-lg' : 'text-sm')}>{title}</p>
        <p className="mt-0.5 max-w-sm text-xs text-muted-foreground">{detail}</p>
      </div>
      {retry && (
        <Button variant="outline" size="sm" onClick={retry}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Try again
        </Button>
      )}
    </div>
  );
}

/**
 * Loading, failed, empty or loaded — decided once instead of in every card body.
 *
 * Only the states a caller supplies are handled: pass no `empty` and an empty result renders the
 * children, which is right for a table that draws its own "no rows" line.
 */
export function DataState({
  isLoading,
  isError,
  error,
  onRetry,
  isEmpty,
  skeleton,
  empty,
  variant = 'panel',
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  onRetry?: () => void;
  isEmpty?: boolean;
  skeleton: React.ReactNode;
  empty?: React.ReactNode;
  variant?: 'page' | 'panel' | 'inline';
  children: React.ReactNode;
}) {
  if (isLoading) return <>{skeleton}</>;
  if (isError) return <QueryError error={error} onRetry={onRetry} variant={variant} />;
  if (isEmpty && empty) return <>{empty}</>;
  return <>{children}</>;
}
