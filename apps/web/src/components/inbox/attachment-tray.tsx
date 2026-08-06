'use client';

import {
  AlertTriangle,
  Archive,
  FileSpreadsheet,
  FileText,
  File as FileIcon,
  Music,
  RotateCw,
  Video,
  X,
} from 'lucide-react';
import type { FileKind } from '@dental-crm/shared';

import { Button } from '@/components/ui/button';
import { formatSize } from '@/lib/format';
import type { PendingAttachment } from '@/hooks/use-attachment-upload';
import { cn } from '@/lib/utils';

/**
 * The icon for a file that cannot be previewed.
 *
 * Chosen from the MIME-derived kind rather than the extension, so a `.jpg` that is really a PDF
 * draws a PDF icon — the extension is whatever the sender's phone chose.
 */
export function KindIcon({ kind, className }: { kind: FileKind; className?: string }) {
  const Icon =
    kind === 'pdf' || kind === 'text'
      ? FileText
      : kind === 'spreadsheet'
        ? FileSpreadsheet
        : kind === 'archive'
          ? Archive
          : kind === 'audio'
            ? Music
            : kind === 'video'
              ? Video
              : FileIcon;
  return <Icon className={className} />;
}

// Re-exported so the tiles below and the message bubbles keep importing it from one place. The
// implementation is the shared one the API also formats its refusals with — this file used to
// carry its own, which rendered "4.2 MB" beside a message that called the same file "4 MB".
export { formatSize };

/**
 * What is about to be sent, above the composer.
 *
 * Every tile shows its own state rather than one bar for the batch. Six files where the fourth
 * failed is the case that matters, and an aggregate bar cannot express it — it either reads as
 * "still going" forever or as "done" while a file is missing.
 */
export function AttachmentTray({
  items,
  onCancel,
  onRetry,
  onRemove,
}: {
  items: PendingAttachment[];
  onCancel: (key: string) => void;
  onRetry: (key: string) => void;
  onRemove: (key: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-2" aria-label="Attachments to send">
      {items.map((item) => {
        const uploading = item.state === 'uploading' || item.state === 'queued';
        const failed = item.state === 'failed' || item.state === 'cancelled';

        return (
          <div
            key={item.key}
            className={cn(
              'relative flex w-40 flex-col overflow-hidden rounded-md border bg-background',
              failed && 'border-destructive/40',
            )}
          >
            {/* Remove is always available, including mid-upload — it aborts the request rather
                than letting the bytes finish into a file nobody wanted. */}
            <button
              type="button"
              onClick={() => onRemove(item.key)}
              aria-label={`Remove ${item.name}`}
              title="Remove"
              className="absolute right-1 top-1 z-10 rounded-full bg-background/90 p-0.5 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            <div className="flex h-20 items-center justify-center bg-muted/50">
              {item.previewUrl && item.kind === 'image' ? (
                // A blob: URL, not a remote asset — next/image cannot optimise one and would only
                // put a loader in front of it.
                <img src={item.previewUrl} alt={item.name} className="h-full w-full object-cover" />
              ) : item.previewUrl && item.kind === 'video' ? (
                // Muted and preloading metadata only: this is a thumbnail, and pulling frames for
                // six queued videos would compete with the uploads themselves.
                <video src={item.previewUrl} className="h-full w-full object-cover" muted preload="metadata" />
              ) : (
                <KindIcon kind={item.kind} className="h-7 w-7 text-muted-foreground" />
              )}
            </div>

            <div className="space-y-0.5 p-1.5">
              <p className="truncate text-[11px] font-medium" title={item.name}>
                {item.name}
              </p>
              <p className="text-[10px] tabular-nums text-muted-foreground">{formatSize(item.sizeBytes)}</p>

              {uploading && (
                <>
                  <div
                    className="h-1 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={item.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Uploading ${item.name}`}
                  >
                    <div
                      className="h-full bg-primary transition-[width] duration-150"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => onCancel(item.key)}
                    className="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
                  >
                    Cancel · {item.progress}%
                  </button>
                </>
              )}

              {failed && (
                <>
                  <p className="line-clamp-2 text-[10px] text-destructive-muted-foreground" title={item.error}>
                    {item.state === 'cancelled' ? 'Cancelled' : item.error}
                  </p>
                  {/* Not offered for a file the allowlist refused — that retry cannot succeed,
                      and a button that always fails is worse than none. */}
                  {item.state !== 'failed' || !item.error?.includes('accepts') ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 w-full px-1 text-[10px]"
                      onClick={() => onRetry(item.key)}
                    >
                      <RotateCw className="mr-1 h-3 w-3" />
                      Try again
                    </Button>
                  ) : null}
                </>
              )}

              {item.state === 'done' && item.transportWarning && (
                <p
                  className="flex items-start gap-1 text-[10px] text-amber-700 dark:text-amber-400"
                  title={item.transportWarning}
                >
                  <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                  <span className="line-clamp-2">Too large for WhatsApp</span>
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
