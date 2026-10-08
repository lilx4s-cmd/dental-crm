'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { NewLeadDialog } from '@/components/pipeline/new-lead-dialog';
import { Button } from '@/components/ui/button';
function Example() {
  const embedded = useSearchParams().get('embedded') === '1';
  const [size, setSize] = useState('desktop');
  return <main className="mx-auto max-w-3xl space-y-5 p-4">
    <h1 className="text-2xl font-semibold">Create a deal from WhatsApp</h1>
    <p className="text-sm text-muted-foreground">Fictional preview. Saving is disabled. In the CRM, open WhatsApp → choose a chat → Add deal. Review the prefilled contact and create the deal.</p>
    {!embedded && <label className="flex items-center gap-3">Preview width<select className="min-h-11 rounded-md border bg-background px-3" value={size} onChange={event => setSize(event.target.value)}><option value="desktop">Desktop</option><option value="393">iPhone · 393 px</option><option value="360">Samsung · 360 px</option></select></label>}
    {!embedded && size !== 'desktop' ? <iframe src="/deal-examples?embedded=1" title="Mobile deal form" style={{ width: Number(size), maxWidth: '100%', height: 900 }} className="mx-auto block rounded-xl border" /> : <section className="space-y-4 rounded-xl border p-4">
      <div><p className="font-semibold">Fictional Patient</p><p className="text-sm text-muted-foreground" dir="ltr">+44 7700 900123 · WhatsApp</p></div>
      <NewLeadDialog demo conversationId="fictional" prefill={{ firstName: 'Fictional', lastName: 'Patient', phone: '+447700900123', whatsappNumber: '+447700900123', source: 'WHATSAPP', currency: 'EUR' }}><Button>Add deal</Button></NewLeadDialog>
    </section>}
  </main>;
}
export default function DealExamplesPage() { return <Suspense fallback={<p>Loading preview…</p>}><Example /></Suspense>; }
