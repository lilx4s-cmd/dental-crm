'use client';
import { useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export function RecordContact({ leadId }: { leadId: string }) {
  const { accessToken } = useAuth();
  const [method, setMethod] = useState('CALL'),
    [note, setNote] = useState(''),
    [result, setResult] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <section className="space-y-3 rounded border p-3">
      <h3 className="font-semibold">Record patient contact</h3>
      <p className="text-sm">
        Record a contact that actually happened outside the CRM. Viewing this lead does not count as
        contact. Your name and recording time are retained.
      </p>
      <select
        className="min-h-11 w-full rounded border p-2"
        value={method}
        onChange={(e) => setMethod(e.target.value)}
      >
        <option value="CALL">Completed call</option>
        <option value="MESSAGE">Patient message sent externally</option>
        <option value="IN_PERSON">In person contact</option>
      </select>
      <Input
        placeholder="Factual contact note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button
        disabled={busy || note.trim().length < 3}
        onClick={() => {
          setBusy(true);
          void apiRequest(
            `/api/staff-alerts/leads/${leadId}/contact`,
            { method: 'POST', body: JSON.stringify({ method, note }) },
            accessToken ?? undefined,
          )
            .then(() => {
              setResult('Contact recorded; assignment reminders will stop.');
              setNote('');
            })
            .catch((e) => setResult(e.message))
            .finally(() => setBusy(false));
        }}
      >
        Record contact
      </Button>
      {result && <p role="status">{result}</p>}
    </section>
  );
}
