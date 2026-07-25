import { useMutation } from '@tanstack/react-query';
import type { IntakeSubmissionInput } from '@dental-crm/shared';

// The intake form is unauthenticated, so these calls use plain `fetch` rather than apiRequest(),
// which attaches an Authorization header and a refresh-token flow that mean nothing here. Same
// reasoning as use-portal.ts.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function intakeFetch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}/api/intake${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const message = await res
      .json()
      .then((e: { message?: string | string[] }) =>
        Array.isArray(e.message) ? e.message[0] : e.message,
      )
      .catch(() => undefined);
    throw new Error(message ?? 'Something went wrong. Please try again.');
  }
  return res.json() as Promise<T>;
}

export interface IntakeSubmitResult {
  submissionId: string | null;
  uploadToken: string | null;
  accepted: boolean;
}

export function useSubmitIntake() {
  return useMutation({
    mutationFn: (data: IntakeSubmissionInput) => intakeFetch<IntakeSubmitResult>('', data),
  });
}

/**
 * Uploads the patient's photos after the enquiry itself is saved.
 *
 * Returns the number that failed rather than throwing, because a storage outage must not read as
 * "your enquiry was lost" — the enquiry is already recorded by the time this runs, and the form
 * tells the patient to send photos another way instead.
 */
export async function uploadIntakeFiles(
  submissionId: string,
  uploadToken: string,
  files: File[],
): Promise<{ uploaded: number; failed: number }> {
  let uploaded = 0;
  let failed = 0;

  for (const file of files) {
    try {
      const { signedUrl, path } = await intakeFetch<{ signedUrl: string; path: string; token: string }>(
        `/${submissionId}/upload-url`,
        { uploadToken, fileName: file.name, mimeType: file.type, sizeBytes: file.size },
      );

      const put = await fetch(signedUrl, { method: 'PUT', body: file });
      if (!put.ok) throw new Error('Upload rejected');

      await intakeFetch(`/${submissionId}/attachments`, {
        uploadToken,
        fileName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        s3Key: path,
      });
      uploaded += 1;
    } catch {
      failed += 1;
    }
  }

  return { uploaded, failed };
}
