'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { consultationExample } from '@dental-crm/shared';
import { ConsultationPatientView } from '@/components/treatment-plans/consultation-patient-view';

const ConsultationEditor = dynamic(() => import('@/components/treatment-plans/consultation-editor').then(module => module.ConsultationEditor));

function Example() {
  const params = useSearchParams();
  const embedded = params.get('embedded') === '1';
  const [language, setLanguage] = useState<'en' | 'ar'>(params.get('language') === 'ar' ? 'ar' : 'en');
  const [viewport, setViewport] = useState('desktop');
  const [editing, setEditing] = useState(false);
  const example = consultationExample(language);
  const source = { patient: example.patient, config: example.config, clinic: { ...example.clinic, currency: example.plan.currency }, payment: example.payment, preferredLanguage: language };
  return <main className="mx-auto max-w-4xl space-y-5 p-3 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-amber-50 p-4 text-amber-950">
      <p className="text-sm">{language === 'ar' ? 'مثال توضيحي بمريض وأسعار وهمية. غير صالح للعلاج أو الدفع.' : 'Fictional patient and prices. Demonstration only; not valid for treatment or payment.'}</p>
      <label className="flex items-center gap-2 text-sm">Language
        <select value={language} onChange={event => setLanguage(event.target.value as 'en' | 'ar')} className="min-h-11 rounded-lg border bg-white px-3"><option value="en">English</option><option value="ar">العربية</option></select>
      </label>
      {!embedded && <label className="flex items-center gap-2 text-sm">Preview size
        <select value={viewport} onChange={event => setViewport(event.target.value)} className="min-h-11 rounded-lg border bg-white px-3"><option value="desktop">Desktop</option><option value="iphone">iPhone · 393 px</option><option value="samsung">Samsung · 360 px</option></select>
      </label>}
      <button type="button" onClick={() => setEditing(true)} className="min-h-11 rounded-lg border bg-white px-3 text-sm">Try staff editor with fictional data</button>
    </div>
    {!embedded && viewport !== 'desktop' ? <iframe title="Mobile treatment preview" key={`${language}-${viewport}`} src={`/documents/examples?embedded=1&language=${language}`} style={{ width: viewport === 'iphone' ? 393 : 360, maxWidth: '100%', height: 840 }} className="mx-auto block rounded-2xl border bg-white" /> : <ConsultationPatientView plan={example.plan} payment={example.payment} identity={example.config} clinic={example.clinic} patientName={`${example.patient.firstName} ${example.patient.lastName}`} preparedAt={example.generatedAt} reference={example.documentId} />}
    {editing && <ConsultationEditor source={source} initial={example.plan} initialPayment={example.payment} demo onClose={() => setEditing(false)} />}
  </main>;
}

export default function TreatmentExamplePage() {
  return <Suspense fallback={<p className="p-6">Loading preview…</p>}><Example /></Suspense>;
}
