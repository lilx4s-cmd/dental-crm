import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';

export interface StoredFile {
  id: string;
  ownerType: string;
  ownerId: string;
  category: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

/** Files attached to one record — a deal, a patient, a treatment plan. */
export function useFiles(ownerType: string, ownerId: string | null) {
  const { accessToken } = useAuth();
  return useQuery<StoredFile[]>({
    queryKey: ['files', ownerType, ownerId],
    queryFn: () =>
      apiRequest(`/api/files?ownerType=${ownerType}&ownerId=${ownerId}`, {}, accessToken ?? undefined),
    enabled: !!ownerId,
  });
}

/**
 * Recognises the specific failure that happens when the clinic has no storage configured.
 *
 * Worth separating because the fix is "paste three keys into Render", not "try again" — and a
 * generic "upload failed" sends people looking for a problem with the file.
 */
export function isStorageNotConfigured(e: unknown): boolean {
  return e instanceof Error && /not configured|SUPABASE/i.test(e.message);
}

export const STORAGE_NOT_CONFIGURED_MESSAGE =
  'File storage is not set up for this clinic yet, so the file was not saved. Add the Supabase keys in Render to enable uploads.';

/**
 * Uploads straight to storage rather than through the API.
 *
 * Three steps: ask the API for a signed URL, PUT the bytes to storage, then tell the API the upload
 * landed. Splitting confirmation out means a browser that dies mid-upload leaves no database row
 * pointing at a file that was never written.
 */
export function useUploadFile() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ownerType,
      ownerId,
      category,
      file,
    }: {
      ownerType: string;
      ownerId: string;
      category: string;
      file: File;
    }) => {
      const { signedUrl, path } = await apiRequest<{ signedUrl: string; path: string }>(
        '/api/files/upload-url',
        {
          method: 'POST',
          body: JSON.stringify({ ownerType, ownerId, category, fileName: file.name, mimeType: file.type }),
        },
        accessToken ?? undefined,
      );

      const put = await fetch(signedUrl, { method: 'PUT', body: file });
      if (!put.ok) throw new Error('Storage rejected the file');

      return apiRequest<StoredFile>(
        '/api/files',
        {
          method: 'POST',
          body: JSON.stringify({
            ownerType,
            ownerId,
            category,
            fileName: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
            s3Key: path,
          }),
        },
        accessToken ?? undefined,
      );
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ['files', vars.ownerType, vars.ownerId] }),
  });
}

export function useDeleteFile(ownerType: string, ownerId: string) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) =>
      apiRequest(`/api/files/${fileId}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['files', ownerType, ownerId] }),
  });
}

/** Short-lived signed link; the bucket stays private so files are never publicly addressable. */
export function useFileDownload() {
  const { accessToken } = useAuth();
  return async (fileId: string) => {
    const { signedUrl } = await apiRequest<{ signedUrl: string }>(
      `/api/files/${fileId}/download-url`,
      {},
      accessToken ?? undefined,
    );
    window.open(signedUrl, '_blank', 'noopener,noreferrer');
  };
}
