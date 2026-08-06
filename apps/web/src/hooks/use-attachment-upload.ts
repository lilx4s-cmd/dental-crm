'use client';

import { useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fileKind,
  formatBytes,
  rejectUpload,
  whatsappMediaWarning,
  type FileKind,
} from '@dental-crm/shared';

import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';

const CATEGORY = 'MESSAGE_ATTACHMENT';

export type UploadState = 'queued' | 'uploading' | 'done' | 'failed' | 'cancelled';

export interface PendingAttachment {
  /** Local, stable for the life of the composer. Not the file id — that arrives on completion. */
  key: string;
  file: File;
  name: string;
  sizeBytes: number;
  mimeType: string;
  kind: FileKind;
  state: UploadState;
  /** 0–100. Real bytes-sent progress, not a fake timer — see `putWithProgress`. */
  progress: number;
  /** Set once confirmed. This is what gets sent with the message. */
  fileId?: string;
  /** An object URL for images and video, revoked when the attachment is dropped. */
  previewUrl?: string;
  error?: string;
  /** Storage took it, but WhatsApp will not carry it. Shown as a caution, not a failure. */
  transportWarning?: string;
}

/**
 * Uploads a browser `File` to a signed URL, reporting bytes sent.
 *
 * XMLHttpRequest rather than fetch, for one reason: fetch has no upload progress. The streaming
 * request bodies that would give it one are unsupported in Safari and require HTTP/2 elsewhere, so
 * for a 100 MB video over a hotel connection this is the only way to show a bar that means
 * anything. A spinner that cannot distinguish stalled from slow is what people cancel.
 */
function putWithProgress(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    // Supabase stores the object under whatever type is declared here, and `confirm` then reads it
    // back and checks it against the allowlist. Sending the browser's own type means the check on
    // the server tests the real thing.
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Storage refused the upload (${xhr.status})`));
    // Deliberately distinct from a non-2xx: this is the case a retry can fix.
    xhr.onerror = () => reject(new Error('The connection dropped during the upload.'));
    xhr.ontimeout = () => reject(new Error('The upload timed out.'));

    signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.onabort = () => reject(new DOMException('Cancelled', 'AbortError'));

    xhr.send(file);
  });
}

/**
 * The composer's attachment tray.
 *
 * Uploads start the moment a file is picked rather than on send, so the wait overlaps with typing
 * — by the time a message is written its attachment is usually already in place. The cost is that
 * a file picked and then removed leaves an object in storage; it is never linked to a message, so
 * it appears nowhere, and it is cheaper than making people wait twice.
 *
 * Each upload owns an AbortController, which is what makes cancel real: the socket closes rather
 * than the promise merely being ignored while the bytes keep going.
 */
export function useAttachmentUpload(conversationId: string | null) {
  const { accessToken } = useAuth();
  const [items, setItems] = useState<PendingAttachment[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const counter = useRef(0);

  const patch = useCallback((key: string, next: Partial<PendingAttachment>) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...next } : i)));
  }, []);

  const upload = useCallback(
    async (item: PendingAttachment) => {
      if (!conversationId) return;

      const controller = new AbortController();
      controllers.current.set(item.key, controller);
      patch(item.key, { state: 'uploading', progress: 0, error: undefined });

      try {
        const slot = await apiRequest<{ signedUrl: string; path: string }>(
          '/api/files/upload-url',
          {
            method: 'POST',
            body: JSON.stringify({
              ownerType: 'CONVERSATION',
              ownerId: conversationId,
              category: CATEGORY,
              fileName: item.name,
              mimeType: item.mimeType,
            }),
          },
          accessToken ?? undefined,
        );

        await putWithProgress(slot.signedUrl, item.file, (p) => patch(item.key, { progress: p }), controller.signal);

        // The row is only created here. Until this succeeds the object is in the bucket but is not
        // a file the CRM knows about — which is also what makes an abandoned upload harmless.
        const confirmed = await apiRequest<{ id: string }>(
          '/api/files',
          {
            method: 'POST',
            body: JSON.stringify({
              ownerType: 'CONVERSATION',
              ownerId: conversationId,
              category: CATEGORY,
              fileName: item.name,
              mimeType: item.mimeType,
              sizeBytes: item.sizeBytes,
              s3Key: slot.path,
            }),
          },
          accessToken ?? undefined,
        );

        patch(item.key, { state: 'done', progress: 100, fileId: confirmed.id });
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          patch(item.key, { state: 'cancelled', progress: 0 });
          return;
        }
        patch(item.key, {
          state: 'failed',
          error: e instanceof Error ? e.message : 'Upload failed',
        });
      } finally {
        controllers.current.delete(item.key);
      }
    },
    [accessToken, conversationId, patch],
  );

  /**
   * Adds files and starts them uploading.
   *
   * Rejected files are added in a failed state rather than dropped silently. Somebody who drags in
   * six files and sees five needs to be told which one did not make it and why — a picker that
   * quietly discards is one people stop trusting.
   */
  const add = useCallback(
    (files: File[]) => {
      const next: PendingAttachment[] = files.map((file) => {
        const key = `att-${counter.current++}`;
        const mimeType = file.type || 'application/octet-stream';
        const kind = fileKind(mimeType);
        const rejection = rejectUpload(CATEGORY, mimeType, file.size);

        return {
          key,
          file,
          name: file.name,
          sizeBytes: file.size,
          mimeType,
          kind,
          state: rejection ? ('failed' as const) : ('queued' as const),
          progress: 0,
          error: rejection?.message,
          // Only for what a browser can render from a local blob. A PDF gets an icon instead.
          previewUrl:
            !rejection && (kind === 'image' || kind === 'video') ? URL.createObjectURL(file) : undefined,
          // Storage will take it; WhatsApp may not. A caution rather than a refusal — the file is
          // still worth keeping on the record.
          transportWarning: rejection ? undefined : (whatsappMediaWarning(mimeType, file.size) ?? undefined),
        };
      });

      setItems((prev) => [...prev, ...next]);
      next.filter((i) => i.state === 'queued').forEach((i) => void upload(i));
    },
    [upload],
  );

  const cancel = useCallback((key: string) => {
    controllers.current.get(key)?.abort();
  }, []);

  const retry = useCallback(
    (key: string) => {
      const item = items.find((i) => i.key === key);
      // A file refused by the allowlist will be refused again — retrying it is a button that
      // cannot work, so it is not offered for that case.
      if (!item || rejectUpload(CATEGORY, item.mimeType, item.sizeBytes)) return;
      void upload(item);
    },
    [items, upload],
  );

  const remove = useCallback((key: string) => {
    controllers.current.get(key)?.abort();
    controllers.current.delete(key);
    setItems((prev) => {
      // Revoked here rather than on unmount: a composer left open all day would otherwise hold
      // every preview it has ever made.
      const target = prev.find((i) => i.key === key);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.key !== key);
    });
  }, []);

  const clear = useCallback(() => {
    controllers.current.forEach((c) => c.abort());
    controllers.current.clear();
    setItems((prev) => {
      prev.forEach((i) => i.previewUrl && URL.revokeObjectURL(i.previewUrl));
      return [];
    });
  }, []);

  const ready = items.filter((i) => i.state === 'done' && i.fileId);
  const busy = items.some((i) => i.state === 'uploading' || i.state === 'queued');

  return {
    items,
    add,
    cancel,
    retry,
    remove,
    clear,
    /** File ids to send, in the order they were picked. */
    fileIds: ready.map((i) => i.fileId!),
    /** True while anything is still going up — the send button waits for this. */
    busy,
    formatBytes,
  };
}

/**
 * Whether file storage is usable at all.
 *
 * Asked before the attach button is offered. Without this, a clinic that has not provisioned a
 * bucket gets a working-looking button, six files picked, and six identical failures — the failure
 * is real but it arrives six times and blames the file rather than the configuration.
 *
 * Cached for the session: this is deployment configuration, not something that changes while
 * somebody is typing.
 */
export function useStorageAvailable() {
  const { accessToken } = useAuth();
  return useQuery<{ configured: boolean; missing: string[] }>({
    queryKey: ['storage-status'],
    queryFn: () => apiRequest('/api/files/storage-status', {}, accessToken ?? undefined),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
}
