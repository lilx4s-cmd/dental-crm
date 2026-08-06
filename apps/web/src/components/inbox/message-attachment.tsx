'use client';

import { useEffect, useState } from 'react';
import { Download, ExternalLink, Loader2, ShieldAlert, X } from 'lucide-react';
import { toast } from 'sonner';
import { fileKind } from '@dental-crm/shared';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/auth-context';
import { apiRequest, saveBlob } from '@/lib/api-client';
import { KindIcon, formatSize } from './attachment-tray';
import { cn } from '@/lib/utils';

export interface SentAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  scanStatus?: string;
  uploadedBy?: { id: string; firstName: string; lastName: string } | null;
}

/**
 * Fetches a short-lived URL for rendering something in place.
 *
 * Not held in the message payload: a signed URL expires in five minutes, so one baked into a
 * thread loaded twenty minutes ago is a broken image. Fetched per tile when it mounts, which also
 * means a thread scrolled past does not mint URLs for things nobody looked at.
 */
function useInlineUrl(fileId: string, enabled: boolean) {
  const { accessToken } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    apiRequest<{ signedUrl: string }>(`/api/files/${fileId}/inline-url`, {}, accessToken ?? undefined)
      .then((r) => !cancelled && setUrl(r.signedUrl))
      .catch(() => !cancelled && setFailed(true));

    return () => {
      cancelled = true;
    };
  }, [fileId, enabled, accessToken]);

  return { url, failed };
}

/**
 * Pulls a file down through its signed URL.
 *
 * Two hops rather than one: the API answers with a short-lived URL, not with bytes, so that a
 * 100 MB video goes browser-to-storage and never through the API process. The URL carries
 * `Content-Disposition: attachment`, which is what keeps anything scriptable in the bucket from
 * executing on the storage origin.
 */
async function downloadFile(file: SentAttachment, accessToken?: string) {
  const { signedUrl } = await apiRequest<{ signedUrl: string }>(
    `/api/files/${file.id}/download-url`,
    {},
    accessToken,
  );
  const res = await fetch(signedUrl);
  if (!res.ok) throw new Error('Download failed');
  saveBlob(await res.blob(), file.fileName);
}

/**
 * One file inside a message bubble.
 *
 * Images and video render; everything else is a row with an icon, a name and a size. That split is
 * the whole design: a chat is read at a glance, and a PDF thumbnail nobody can read at 200px wide
 * costs a render and tells you less than the word "PDF" does.
 */
export function MessageAttachment({
  file,
  outbound,
  onOpenImage,
}: {
  file: SentAttachment;
  outbound: boolean;
  onOpenImage: (file: SentAttachment) => void;
}) {
  const { accessToken } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const kind = fileKind(file.mimeType);
  const renders = kind === 'image' || kind === 'video' || kind === 'audio';
  const { url, failed } = useInlineUrl(file.id, renders);

  // Only reachable when a scanner is configured and was unreachable — an infected file is deleted
  // at confirm time and never becomes a row. Shown rather than silently rendered: an unscanned
  // file drawn into the page is the case the scanner exists for.
  const unscanned = file.scanStatus === 'PENDING';

  const download = async () => {
    setDownloading(true);
    try {
      await downloadFile(file, accessToken ?? undefined);
    } catch {
      toast.error('Could not download that file');
    } finally {
      setDownloading(false);
    }
  };

  if (kind === 'image') {
    return (
      <button
        type="button"
        onClick={() => onOpenImage(file)}
        className="group relative block overflow-hidden rounded-lg border bg-muted/40"
        aria-label={`Open ${file.fileName}`}
      >
        {url ? (
          // A plain <img>, not next/image: this is a time-limited signed URL on a host the
          // image optimiser is not configured for and must not be, since storage rotates it.
          <img src={url} alt={file.fileName} className="max-h-64 w-auto max-w-full object-contain" />
        ) : failed ? (
          <div className="flex h-32 w-48 items-center justify-center text-xs text-muted-foreground">
            Preview unavailable
          </div>
        ) : (
          <div className="flex h-32 w-48 items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-2 py-1 text-left text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
          {file.fileName} · {formatSize(file.sizeBytes)}
        </span>
      </button>
    );
  }

  if (kind === 'video' && url) {
    return (
      <video
        src={url}
        controls
        preload="metadata"
        className="max-h-64 w-auto max-w-full rounded-lg border"
        aria-label={file.fileName}
      />
    );
  }

  if (kind === 'audio' && url) {
    // A voice note. Rendered as a player rather than a download, because that is how it arrives
    // and how it is meant to be consumed.
    return <audio src={url} controls className="w-64 max-w-full" aria-label={file.fileName} />;
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-2.5 py-2',
        outbound ? 'bg-primary-foreground/10' : 'bg-background',
      )}
    >
      <KindIcon kind={kind} className="h-6 w-6 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium" title={file.fileName}>
          {file.fileName}
        </p>
        <p className="text-[10px] tabular-nums text-muted-foreground">
          {formatSize(file.sizeBytes)}
          {unscanned && ' · not scanned'}
        </p>
      </div>
      {unscanned && (
        <ShieldAlert
          className="h-3.5 w-3.5 shrink-0 text-amber-600"
          aria-label="This file has not been scanned for malware"
        />
      )}
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 shrink-0 p-0"
        onClick={download}
        disabled={downloading}
        aria-label={`Download ${file.fileName}`}
        title="Download"
      >
        {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

/**
 * An image at full size.
 *
 * Its own dialog rather than the shared one: this needs the viewport, no padding and no card
 * chrome, and every one of those would be a fight with a component built for forms.
 */
export function ImageLightbox({
  file,
  onClose,
}: {
  file: SentAttachment | null;
  onClose: () => void;
}) {
  const { accessToken } = useAuth();
  const { url } = useInlineUrl(file?.id ?? '', !!file);

  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    // The page behind must not scroll while this is open, or dismissing it returns you somewhere
    // else in the thread.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [file, onClose]);

  if (!file) return null;

  const download = () =>
    downloadFile(file, accessToken ?? undefined).catch(() => toast.error('Could not download that file'));

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label={file.fileName}
      onClick={onClose}
    >
      <div
        className="flex items-center justify-between gap-2 px-4 py-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{file.fileName}</p>
          <p className="text-xs text-white/60">
            {formatSize(file.sizeBytes)} · {new Date(file.createdAt).toLocaleString()}
            {file.uploadedBy && ` · ${file.uploadedBy.firstName} ${file.uploadedBy.lastName}`}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={download}>
            <Download className="mr-1.5 h-4 w-4" />
            Download
          </Button>
          {url && (
            <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" asChild>
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1.5 h-4 w-4" />
                Open
              </a>
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-white hover:bg-white/10"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        {url ? (
          // A plain <img> for the same reason as above: a signed, expiring URL.
          <img
            src={url}
            alt={file.fileName}
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <Loader2 className="h-6 w-6 animate-spin text-white/70" />
        )}
      </div>
    </div>
  );
}
