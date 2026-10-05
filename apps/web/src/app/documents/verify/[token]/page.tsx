'use client';
import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
export default function VerifyDocument({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const result = useQuery<{ id: string; kind: string; version: number; createdAt: string }>({
    queryKey: ['verify-document', token],
    queryFn: () => apiRequest(`/api/documents/verify/${token}`),
    retry: false,
  });
  return (
    <main className="mx-auto max-w-xl p-10">
      <h1 className="mb-6 text-2xl font-semibold">Venedik Dental Clinic</h1>
      {result.data ? (
        <>
          <p>Document verified</p>
          <p>
            {result.data.kind} · v{result.data.version}
          </p>
          <p>{result.data.id}</p>
          <p>{new Date(result.data.createdAt).toLocaleDateString()}</p>
        </>
      ) : (
        <p>{result.isError ? 'Document could not be verified' : 'Checking document…'}</p>
      )}
    </main>
  );
}
