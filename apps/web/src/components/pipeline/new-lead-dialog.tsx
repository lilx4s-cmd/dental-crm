'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { PATIENT_LANGUAGES, hasPermission } from '@dental-crm/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CountryPicker } from './country-picker';
import { useCreateLead, useUpdateLeadStage, type CreateLeadPayload, type Lead } from '@/hooks/use-leads';
import { useUsers } from '@/hooks/use-users';
import { useClinicSettings } from '@/hooks/use-reports';
import { useAuth } from '@/context/auth-context';
import { ApiError } from '@/lib/api-client';

const SOURCES = ['OTHER', 'WHATSAPP', 'PHONE', 'WALK_IN', 'FACEBOOK_ADS', 'INSTAGRAM_ADS', 'GOOGLE', 'REFERRAL', 'WEBSITE'];
const SOURCE_NAMES = ['Other / not specified', 'WhatsApp', 'Phone call', 'Walk-in', 'Facebook Ad', 'Instagram Ad', 'Google Ad', 'Referral', 'Website'];
const SOURCE_AR = ['أخرى / غير محدد', 'واتساب', 'مكالمة هاتفية', 'زيارة مباشرة', 'إعلان فيسبوك', 'إعلان إنستغرام', 'إعلان جوجل', 'توصية', 'الموقع الإلكتروني'];
const ASSIGNABLE_ROLES = ['SUPER_ADMIN', 'CLINIC_MANAGER', 'SALES_CONSULTANT', 'RECEPTION'];
const phoneInput = z.string().trim().optional().refine(value => {
  if (!value) return true;
  const digits = value.replace(/\D/g, '').replace(/^00/, '');
  return (/^\+/.test(value) || /^00/.test(value)) && /^[1-9]\d{6,14}$/.test(digits);
}, 'Use an international number with + and its country calling code.');
const schema = z.object({
  firstName: z.string().trim().min(1, 'Enter the patient’s first name.'),
  lastName: z.string().trim().optional(),
  source: z.enum(SOURCES as [string, ...string[]]),
  phone: phoneInput,
  whatsappNumber: phoneInput,
  sameWhatsApp: z.boolean(),
  email: z.string().trim().email('Enter a valid email address.').optional().or(z.literal('')),
  country: z.string().optional(), preferredLanguage: z.string().optional(),
  estimatedValue: z.preprocess(value => value === '' || value == null ? undefined : Number(value), z.number().finite().positive('Enter an amount greater than zero, or leave it blank.').optional()),
  currency: z.string().regex(/^[A-Z]{3}$/),
  notes: z.string().trim().optional(), assignedToId: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;
export type NewDealPrefill = Partial<CreateLeadPayload>;

export function NewLeadDialog({ children, defaultStage, defaultStageLabel, prefill, conversationId, onCreated, demo = false }: {
  children: React.ReactNode; defaultStage?: string; defaultStageLabel?: string;
  prefill?: NewDealPrefill; conversationId?: string; onCreated?: (lead: Lead) => void; demo?: boolean;
}) {
  const [open, setOpen] = useState(false), [language, setLanguage] = useState<'en' | 'ar'>('en');
  const [requestError, setRequestError] = useState(''), [existingLeadId, setExistingLeadId] = useState<string>();
  const createLead = useCreateLead(), updateStage = useUpdateLeadStage();
  const { user } = useAuth(), { data: users } = useUsers(!demo && open), { data: clinic } = useClinicSettings(!demo);
  const router = useRouter(), id = useId(), submitting = useRef(false);
  const ar = language === 'ar';
  const copy = (english: string, arabic: string) => ar ? arabic : english;
  const canAssign = hasPermission(user, 'leads.assign', user?.role === 'SUPER_ADMIN');
  const canWrite = demo || hasPermission(user, 'leads.write', true);
  const currencies = [...new Set(['EUR', 'USD', 'GBP', 'TRY', clinic?.currency, prefill?.currency].filter((code): code is string => !!code && /^[A-Z]{3}$/.test(code)))];
  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting, dirtyFields } } = useForm<FormValues>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (open && !prefill?.currency && !dirtyFields.currency && clinic?.currency && /^[A-Z]{3}$/.test(clinic.currency)) setValue('currency', clinic.currency);
  }, [open, prefill?.currency, dirtyFields.currency, clinic?.currency, setValue]);
  const defaults = (): FormValues => ({
    firstName: prefill?.firstName ?? '', lastName: prefill?.lastName ?? '', source: prefill?.source ?? 'OTHER',
    phone: prefill?.phone ?? '', whatsappNumber: prefill?.whatsappNumber ?? '', sameWhatsApp: !!prefill?.whatsappNumber && prefill.whatsappNumber === prefill.phone,
    email: prefill?.email ?? '', country: prefill?.country ?? '', preferredLanguage: prefill?.preferredLanguage ?? '',
    estimatedValue: prefill?.estimatedValue, currency: prefill?.currency ?? (clinic?.currency && currencies.includes(clinic.currency) ? clinic.currency : 'USD'),
    notes: prefill?.notes ?? '', assignedToId: prefill?.assignedToId ?? user?.sub ?? '',
  });
  const fieldError = (key: keyof FormValues) => errors[key] && <p id={`${id}-${key}-error`} role="alert" className="text-sm text-destructive">{copy(String(errors[key]?.message), key === 'firstName' ? 'أدخل اسم المريض.' : key === 'estimatedValue' ? 'أدخل مبلغاً أكبر من صفر، أو اتركه فارغاً.' : key === 'email' ? 'أدخل بريداً إلكترونياً صحيحاً.' : 'أدخل الرقم الدولي مع + ورمز الاتصال بالدولة.')}</p>;
  const fieldProps = (key: keyof FormValues) => ({ id: `${id}-${key}`, 'aria-invalid': !!errors[key], 'aria-describedby': errors[key] ? `${id}-${key}-error` : undefined });
  const inputClass = 'min-h-11 text-base';

  async function submit(data: FormValues) {
    if (submitting.current || demo) return;
    submitting.current = true; setRequestError(''); setExistingLeadId(undefined);
    try {
      const lead = await createLead.mutateAsync({
        firstName: data.firstName, lastName: data.lastName || undefined, source: conversationId ? 'WHATSAPP' : data.source,
        phone: data.phone || undefined, whatsappNumber: (data.sameWhatsApp ? data.phone : data.whatsappNumber) || undefined,
        email: data.email || undefined, country: data.country || undefined, preferredLanguage: data.preferredLanguage || undefined,
        estimatedValue: data.estimatedValue, currency: data.currency, notes: data.notes || undefined,
        assignedToId: data.assignedToId || undefined, conversationId,
      });
      if (defaultStage && defaultStage !== 'NEW_DEAL' && !lead.reusedExisting) {
        try { await updateStage.mutateAsync({ id: lead.id, stage: defaultStage }); }
        catch { toast.warning(copy('Deal created, but it stayed in New Deal. Review the stage permissions before moving it.', 'تم إنشاء الصفقة في المرحلة الجديدة. راجع صلاحيات نقل المرحلة.')); }
      }
      toast.success(lead.reusedExisting ? copy('Existing deal linked to this chat.', 'تم ربط هذه المحادثة بالصفقة الموجودة.') : copy('Deal created.', 'تم إنشاء الصفقة.'), {
        action: { label: copy('Open deal', 'فتح الصفقة'), onClick: () => router.push(`/pipeline?leadId=${encodeURIComponent(lead.id)}`) },
      });
      onCreated?.(lead); setOpen(false); reset();
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : copy('Could not create the deal. Your entries are kept; try again.', 'تعذر إنشاء الصفقة. تم الاحتفاظ بالمعلومات، حاول مجدداً.'));
      if (error instanceof ApiError && error.details?.code === 'DUPLICATE_NUMBER' && typeof error.details.existingLeadId === 'string') setExistingLeadId(error.details.existingLeadId);
    } finally { submitting.current = false; }
  }

  return <Dialog open={open} onOpenChange={next => { if (submitting.current) return; if (next) { reset(defaults()); setRequestError(''); setExistingLeadId(undefined); } setOpen(next); }}>
    <DialogTrigger asChild>{children}</DialogTrigger>
    <DialogContent dir={ar ? 'rtl' : 'ltr'} className="sm:max-w-lg p-4 sm:p-6">
      <DialogHeader className="text-start sm:text-start">
        <DialogTitle>{copy('New deal', 'صفقة جديدة')}{defaultStageLabel ? ` — ${defaultStageLabel}` : ''}</DialogTitle>
        <DialogDescription>{demo ? copy('Fictional demonstration. Saving is disabled.', 'مثال توضيحي وهمي. الحفظ غير متاح.') : conversationId ? copy('Name and WhatsApp number are reused from this chat. Fill only what is missing.', 'تمت تعبئة الاسم ورقم واتساب من هذه المحادثة. أكمل المعلومات الناقصة فقط.') : copy('Start with the name and contact. Other details can be added later.', 'ابدأ بالاسم ورقم التواصل. يمكنك إضافة باقي التفاصيل لاحقاً.')}</DialogDescription>
        <label className="flex items-center gap-2 text-sm">{copy('Form language', 'لغة النموذج')}<select aria-label="Form language" value={language} onChange={event => setLanguage(event.target.value as 'en' | 'ar')} className="min-h-11 rounded-md border bg-background px-2"><option value="en">English</option><option value="ar">العربية</option></select></label>
      </DialogHeader>
      <form onSubmit={handleSubmit(submit)} className="min-w-0 space-y-4">
        <fieldset disabled={isSubmitting} className="min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor={`${id}-firstName`}>{copy('First name *', 'الاسم الأول *')}</Label><Input {...fieldProps('firstName')} {...register('firstName')} autoComplete="given-name" autoFocus className={inputClass} />{fieldError('firstName')}</div>
            <div className="space-y-1.5"><Label htmlFor={`${id}-lastName`}>{copy('Last name', 'اسم العائلة')}</Label><Input {...fieldProps('lastName')} {...register('lastName')} autoComplete="family-name" className={inputClass} /></div>
          </div>
          <div className="space-y-1.5"><Label htmlFor={`${id}-phone`}>{copy('Phone number', 'رقم الهاتف')}</Label><Input {...fieldProps('phone')} {...register('phone')} type="tel" inputMode="tel" autoComplete="tel" placeholder="+44 7700 900123" dir="ltr" className={inputClass} />{fieldError('phone')}
            <p className="text-xs text-muted-foreground">{copy('Include + and the calling code. The residence country does not change your number.', 'أدخل + ورمز الاتصال. دولة الإقامة لا تغيّر رقم الهاتف.')}</p>
            {!conversationId && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" {...register('sameWhatsApp', { onChange: event => { if (event.target.checked) setValue('whatsappNumber', ''); } })} />{copy('Use this number for WhatsApp', 'استخدام هذا الرقم لواتساب')}</label>}
          </div>
          <div className="space-y-1.5"><Label htmlFor={`${id}-country`}>{copy('Country of residence', 'دولة الإقامة')}</Label><CountryPicker id={`${id}-country`} language={language} value={watch('country')} onChange={country => setValue('country', country, { shouldDirty: true })} /></div>
          <div className="space-y-1.5"><Label htmlFor={`${id}-estimatedValue`}>{copy('Estimated value · optional', 'القيمة التقديرية · اختيارية')}</Label><div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
            <Input {...fieldProps('estimatedValue')} {...register('estimatedValue')} type="number" step="0.01" min="0.01" inputMode="decimal" placeholder={copy('Not known yet', 'غير معروفة بعد')} dir="ltr" className={inputClass} />
            <select aria-label={copy('Currency', 'العملة')} {...register('currency')} className="min-h-11 rounded-md border bg-background px-2 text-base" dir="ltr">{currencies.map(currency => <option key={currency} value={currency}>{currency === 'EUR' ? 'EUR (€)' : currency === 'USD' ? 'USD ($)' : currency}</option>)}</select>
          </div>{fieldError('estimatedValue')}</div>
          <details open={errors.email || errors.whatsappNumber ? true : undefined} className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">{copy('More details · source, salesperson, language and notes', 'تفاصيل إضافية · المصدر والموظف واللغة والملاحظات')}</summary><div className="mt-4 space-y-4">
            <div className="space-y-1.5"><Label htmlFor={`${id}-source`}>{copy('Source', 'المصدر')}</Label>{conversationId ? <><input type="hidden" {...register('source')} /><p id={`${id}-source`} className="text-sm">WhatsApp</p></> : <select id={`${id}-source`} {...register('source')} className="min-h-11 w-full rounded-md border bg-background px-3 text-base">{SOURCES.map((source, index) => <option key={source} value={source}>{ar ? SOURCE_AR[index] : SOURCE_NAMES[index]}</option>)}</select>}</div>
            {canAssign && <div className="space-y-1.5"><Label htmlFor={`${id}-assignedToId`}>{copy('Assigned salesperson', 'الموظف المسؤول')}</Label><select id={`${id}-assignedToId`} {...register('assignedToId')} className="min-h-11 w-full rounded-md border bg-background px-3 text-base">
              {!users?.some(person => person.id === watch('assignedToId')) && <option value={watch('assignedToId') ?? ''}>{copy('Current responsible person', 'الموظف المسؤول الحالي')}</option>}
              {(users ?? []).filter(person => person.isActive && ASSIGNABLE_ROLES.includes(person.role)).map(person => <option key={person.id} value={person.id}>{person.firstName} {person.lastName}{person.id === user?.sub ? copy(' (you)', ' (أنت)') : ''}</option>)}</select></div>}
            <div className="space-y-1.5"><Label htmlFor={`${id}-preferredLanguage`}>{copy('Patient language', 'لغة المريض')}</Label><select id={`${id}-preferredLanguage`} {...register('preferredLanguage')} className="min-h-11 w-full rounded-md border bg-background px-3 text-base"><option value="">{copy('Not known yet', 'غير معروفة بعد')}</option>{PATIENT_LANGUAGES.map(item => <option key={item.code} value={item.code}>{item.name} · {item.endonym}</option>)}</select></div>
            {!conversationId && !watch('sameWhatsApp') && <div className="space-y-1.5"><Label htmlFor={`${id}-whatsappNumber`}>{copy('Different WhatsApp number', 'رقم واتساب مختلف')}</Label><Input {...fieldProps('whatsappNumber')} {...register('whatsappNumber')} type="tel" inputMode="tel" dir="ltr" placeholder="+44 7700 900123" className={inputClass} />{fieldError('whatsappNumber')}</div>}
            <div className="space-y-1.5"><Label htmlFor={`${id}-email`}>{copy('Email', 'البريد الإلكتروني')}</Label><Input {...fieldProps('email')} {...register('email')} type="email" autoComplete="email" dir="ltr" className={inputClass} />{fieldError('email')}</div>
            <div className="space-y-1.5"><Label htmlFor={`${id}-notes`}>{copy('Treatment interest or notes', 'العلاج المطلوب أو الملاحظات')}</Label><Textarea id={`${id}-notes`} {...register('notes')} rows={2} className="text-base" /></div>
          </div></details>
        </fieldset>
        {requestError && <div role="alert" className="space-y-2 rounded-md border border-destructive p-3 text-sm"><p className="break-words">{requestError}</p>{existingLeadId && <a href={`/pipeline?leadId=${encodeURIComponent(existingLeadId)}`} className="underline">{copy('Open existing deal', 'فتح الصفقة الموجودة')}</a>}</div>}
        <div className="sticky -bottom-4 flex flex-wrap justify-end gap-2 border-t bg-background py-3 sm:-bottom-6">
          <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => setOpen(false)} className="min-h-11">{copy('Cancel', 'إلغاء')}</Button>
          <Button type="submit" disabled={isSubmitting || !canWrite || demo} className="min-h-11">{isSubmitting ? copy('Creating…', 'جارٍ الإنشاء…') : copy('Create deal', 'إنشاء الصفقة')}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
