'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Phone, Mail, MapPin, Calendar, Edit2, Plus,
  CreditCard, FileText, Stethoscope, Trash2,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { usePatient, useUpdatePatient } from '@/hooks/use-patients';
import { useAppointments, useCreateAppointment } from '@/hooks/use-appointments';
import { useInvoices, useCreateInvoice, useRecordPayment } from '@/hooks/use-invoices';
import { useDentists } from '@/hooks/use-users';
import { TreatmentPlansTab } from '@/components/treatment-plans/treatment-plans-tab';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
}

const APPT_STATUS_COLORS: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-800',
  CONFIRMED: 'bg-green-100 text-green-800',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
  COMPLETED: 'bg-gray-100 text-gray-700',
  CANCELLED: 'bg-red-100 text-red-800',
  NO_SHOW: 'bg-orange-100 text-orange-800',
};

const INV_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SENT: 'bg-blue-100 text-blue-800',
  PARTIALLY_PAID: 'bg-yellow-100 text-yellow-800',
  PAID: 'bg-green-100 text-green-800',
  OVERDUE: 'bg-red-100 text-red-800',
};

const APPT_TYPES = [
  { value: 'CONSULTATION', label: 'Consultation' },
  { value: 'TREATMENT', label: 'Treatment' },
  { value: 'FOLLOW_UP', label: 'Follow-up' },
  { value: 'CLEANING', label: 'Cleaning' },
  { value: 'EMERGENCY', label: 'Emergency' },
  { value: 'OTHER', label: 'Other' },
];

// ─── Edit Patient Dialog ──────────────────────────────────────────────────────
function EditPatientDialog({
  patient,
  open,
  onClose,
}: {
  patient: ReturnType<typeof usePatient>['data'];
  open: boolean;
  onClose: () => void;
}) {
  const update = useUpdatePatient(patient?.id ?? '');
  const [form, setForm] = useState({
    firstName: patient?.firstName ?? '',
    lastName: patient?.lastName ?? '',
    email: patient?.email ?? '',
    phone: patient?.phone ?? '',
    whatsappNumber: patient?.whatsappNumber ?? '',
    address: patient?.address ?? '',
    city: patient?.city ?? '',
    country: patient?.country ?? '',
    notes: patient?.notes ?? '',
    diagnosis: patient?.diagnosis ?? '',
    insuranceInfo: patient?.insuranceInfo ?? '',
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = () => {
    update.mutate(
      { ...form, email: form.email || undefined, phone: form.phone || undefined },
      {
        onSuccess: () => { toast.success('Patient updated'); onClose(); },
        onError: () => toast.error('Failed to update'),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Edit Patient</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>First Name</Label><Input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} /></div>
            <div className="space-y-1"><Label>Last Name</Label><Input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Phone</Label><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
            <div className="space-y-1"><Label>WhatsApp</Label><Input value={form.whatsappNumber} onChange={(e) => set('whatsappNumber', e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
          <div className="space-y-1"><Label>Address</Label><Input value={form.address} onChange={(e) => set('address', e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>City</Label><Input value={form.city} onChange={(e) => set('city', e.target.value)} /></div>
            <div className="space-y-1"><Label>Country</Label><Input value={form.country} onChange={(e) => set('country', e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label>Notes</Label><Textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
          <div className="space-y-1"><Label>Diagnosis</Label><Textarea rows={2} value={form.diagnosis} onChange={(e) => set('diagnosis', e.target.value)} /></div>
          <div className="space-y-1"><Label>Insurance</Label><Input value={form.insuranceInfo} onChange={(e) => set('insuranceInfo', e.target.value)} placeholder="Provider — Policy #" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={update.isPending}>{update.isPending ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── New Appointment (inline for this patient) ────────────────────────────────
function NewAppointmentDialog({ patientId, open, onClose }: { patientId: string; open: boolean; onClose: () => void }) {
  const create = useCreateAppointment();
  const { data: dentists } = useDentists();
  const today = new Date().toISOString().slice(0, 16);
  const [form, setForm] = useState({ dentistId: '', type: 'CONSULTATION', startTime: today, endTime: today.slice(0, 11) + '10:00', notes: '' });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    create.mutate(
      { patientId, dentistId: form.dentistId || undefined, type: form.type, startTime: new Date(form.startTime).toISOString(), endTime: new Date(form.endTime).toISOString(), notes: form.notes || undefined },
      { onSuccess: () => { toast.success('Appointment booked'); onClose(); }, onError: (e: unknown) => toast.error((e as Error).message) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>New Appointment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Dentist</Label>
            <Select value={form.dentistId} onValueChange={(v) => set('dentistId', v)}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">Unassigned</SelectItem>
                {dentists?.map((d) => <SelectItem key={d.id} value={d.id}>Dr. {d.firstName} {d.lastName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={form.type} onValueChange={(v) => set('type', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{APPT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label>Start</Label><Input type="datetime-local" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} /></div>
            <div className="space-y-1"><Label>End</Label><Input type="datetime-local" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>{create.isPending ? 'Booking…' : 'Book'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── New Invoice (inline for this patient) ────────────────────────────────────
function QuickInvoiceDialog({ patientId, open, onClose }: { patientId: string; open: boolean; onClose: () => void }) {
  const create = useCreateInvoice();
  const [items, setItems] = useState([{ description: '', quantity: 1, unitPrice: 0 }]);
  const [discount, setDiscount] = useState('0');
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  const updateItem = (idx: number, k: string, v: string | number) =>
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, [k]: v } : it));

  const handleSubmit = () => {
    if (items.some((i) => !i.description || i.unitPrice <= 0)) { toast.error('Fill all line items'); return; }
    create.mutate(
      { patientId, items: items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) })), discount: parseFloat(discount) || undefined },
      { onSuccess: () => { toast.success('Invoice created'); onClose(); }, onError: () => toast.error('Failed') },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Create Invoice</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <Input className="col-span-6" placeholder="Description" value={item.description} onChange={(e) => updateItem(i, 'description', e.target.value)} />
              <Input className="col-span-2" type="number" min="1" placeholder="Qty" value={item.quantity} onChange={(e) => updateItem(i, 'quantity', parseInt(e.target.value) || 1)} />
              <Input className="col-span-3" type="number" step="0.01" placeholder="Price" value={item.unitPrice} onChange={(e) => updateItem(i, 'unitPrice', parseFloat(e.target.value) || 0)} />
              <button className="col-span-1 text-muted-foreground hover:text-destructive" onClick={() => items.length > 1 && setItems((p) => p.filter((_, idx) => idx !== i))}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setItems((p) => [...p, { description: '', quantity: 1, unitPrice: 0 }])}>
            <Plus className="h-3 w-3 mr-1" /> Add Item
          </Button>
          <div className="flex items-center justify-between text-sm pt-2 border-t">
            <span className="text-muted-foreground">Subtotal: <strong>{fmt(subtotal)}</strong></span>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">Discount:</span>
              <Input className="w-20 h-7 text-sm" type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create Invoice'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Appointments Tab ─────────────────────────────────────────────────────────
function AppointmentsTab({ patientId }: { patientId: string }) {
  const { data: appts, isLoading } = useAppointments(undefined, undefined, undefined, patientId);
  const [newOpen, setNewOpen] = useState(false);

  const patientAppts = appts ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Appointment
        </Button>
      </div>
      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : patientAppts.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <Calendar className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No appointments yet</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date & Time</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Dentist</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {patientAppts.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()).map((a) => (
              <AppointmentRow key={a.id} appt={a} />
            ))}
          </TableBody>
        </Table>
      )}
      <NewAppointmentDialog patientId={patientId} open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}

function AppointmentRow({ appt }: { appt: NonNullable<ReturnType<typeof useAppointments>['data']>[number] }) {
  return (
    <TableRow>
      <TableCell className="text-sm">{format(new Date(appt.startTime), 'MMM d, yyyy HH:mm')}</TableCell>
      <TableCell className="text-sm">{APPT_TYPES.find((t) => t.value === appt.type)?.label ?? appt.type}</TableCell>
      <TableCell className="text-sm">{appt.dentist ? `Dr. ${appt.dentist.firstName} ${appt.dentist.lastName}` : '—'}</TableCell>
      <TableCell>
        <Badge className={APPT_STATUS_COLORS[appt.status] ?? ''} variant="outline">
          {appt.status.replace(/_/g, ' ')}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground max-w-32 truncate">{appt.notes ?? '—'}</TableCell>
    </TableRow>
  );
}

// ─── Invoices Tab ─────────────────────────────────────────────────────────────
function InvoicesTab({ patientId }: { patientId: string }) {
  const { data: invoices, isLoading } = useInvoices(patientId);
  const [newOpen, setNewOpen] = useState(false);
  const [payInvoiceId, setPayInvoiceId] = useState<string | null>(null);

  const totalPaid = invoices?.filter((inv) => inv.status === 'PAID').reduce((s, inv) => s + Number(inv.total), 0) ?? 0;
  const totalOutstanding = invoices?.filter((inv) => ['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(inv.status)).reduce((s, inv) => s + Number(inv.total), 0) ?? 0;

  return (
    <div className="space-y-4">
      {invoices && invoices.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="py-3"><CardContent className="px-4 text-center"><p className="text-xs text-muted-foreground">Total Paid</p><p className="text-xl font-bold text-green-600">{fmt(totalPaid)}</p></CardContent></Card>
          <Card className="py-3"><CardContent className="px-4 text-center"><p className="text-xs text-muted-foreground">Outstanding</p><p className="text-xl font-bold text-orange-500">{fmt(totalOutstanding)}</p></CardContent></Card>
        </div>
      )}
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> New Invoice
        </Button>
      </div>
      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : !invoices?.length ? (
        <div className="text-center py-10 text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No invoices yet</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-mono text-sm">{inv.invoiceNumber}</TableCell>
                <TableCell className="text-sm">{format(new Date(inv.issuedAt ?? inv.createdAt), 'MMM d, yyyy')}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{inv.items.map((i) => i.description).join(', ').slice(0, 40)}{inv.items.length > 1 ? '…' : ''}</TableCell>
                <TableCell><Badge className={INV_STATUS_COLORS[inv.status] ?? ''} variant="outline">{inv.status.replace(/_/g, ' ')}</Badge></TableCell>
                <TableCell className="text-right font-medium">{fmt(Number(inv.total), inv.currency)}</TableCell>
                <TableCell>
                  {inv.status !== 'PAID' && inv.status !== 'CANCELLED' && (
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setPayInvoiceId(inv.id)}>
                      <CreditCard className="h-3.5 w-3.5 mr-1" /> Pay
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <QuickInvoiceDialog patientId={patientId} open={newOpen} onClose={() => setNewOpen(false)} />
      {payInvoiceId && (
        <QuickPayDialog invoiceId={payInvoiceId} onClose={() => setPayInvoiceId(null)} />
      )}
    </div>
  );
}

function QuickPayDialog({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const record = useRecordPayment(invoiceId);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const handleSubmit = () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { toast.error('Enter valid amount'); return; }
    record.mutate({ amount: amt, method }, { onSuccess: () => { toast.success('Payment recorded'); onClose(); }, onError: () => toast.error('Failed') });
  };
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-xs">
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Amount</Label><Input type="number" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="space-y-1">
            <Label>Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[['CASH','Cash'],['CARD','Card'],['BANK_TRANSFER','Bank Transfer'],['ONLINE','Online'],['INSTALLMENT','Installment'],['OTHER','Other']].map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={record.isPending}>{record.isPending ? 'Saving…' : 'Record'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PatientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: patient, isLoading } = usePatient(id);
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-4"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Patient not found.</p>
        <Button variant="link" onClick={() => router.push('/patients')}>Back to patients</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/patients')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">{patient.firstName} {patient.lastName}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant={patient.isActive ? 'success' : 'secondary'}>
              {patient.isActive ? 'Active' : 'Inactive'}
            </Badge>
            {patient.convertedFromLeadId && <Badge variant="info">Converted Lead</Badge>}
            {patient.tags.map(({ tag }) => (
              <Badge key={tag.id} variant="outline" style={{ borderColor: tag.color, color: tag.color }}>{tag.name}</Badge>
            ))}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          <Edit2 className="h-4 w-4 mr-2" /> Edit
        </Button>
      </div>

      {/* Info cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Contact</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {patient.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground shrink-0" />{patient.phone}</div>}
            {patient.whatsappNumber && patient.whatsappNumber !== patient.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-green-500 shrink-0" />{patient.whatsappNumber} <span className="text-xs text-green-600">WhatsApp</span></div>}
            {patient.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground shrink-0" />{patient.email}</div>}
            {(patient.address || patient.city || patient.country) && <div className="flex items-start gap-2"><MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />{[patient.address, patient.city, patient.country].filter(Boolean).join(', ')}</div>}
            {!patient.phone && !patient.email && <p className="text-muted-foreground italic">No contact info</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {patient.dateOfBirth && <div className="flex justify-between"><span className="text-muted-foreground">Date of Birth</span><span>{format(new Date(patient.dateOfBirth), 'MMM d, yyyy')}</span></div>}
            {patient.gender && <div className="flex justify-between"><span className="text-muted-foreground">Gender</span><span className="capitalize">{patient.gender.toLowerCase()}</span></div>}
            {patient.nationalId && <div className="flex justify-between"><span className="text-muted-foreground">National ID</span><span>{patient.nationalId}</span></div>}
            {patient.insuranceInfo && <div className="flex justify-between"><span className="text-muted-foreground">Insurance</span><span>{patient.insuranceInfo}</span></div>}
            <div className="flex justify-between"><span className="text-muted-foreground">Patient since</span><span>{format(new Date(patient.createdAt), 'MMM d, yyyy')}</span></div>
            {patient.diagnosis && <div className="pt-2 border-t"><p className="text-muted-foreground text-xs mb-1">Diagnosis</p><p className="text-xs leading-relaxed">{patient.diagnosis}</p></div>}
            {patient.notes && <div className="pt-2 border-t"><p className="text-muted-foreground text-xs mb-1">Notes</p><p className="text-xs leading-relaxed">{patient.notes}</p></div>}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="appointments">
        <TabsList>
          <TabsTrigger value="appointments" className="gap-2"><Calendar className="h-4 w-4" />Appointments</TabsTrigger>
          <TabsTrigger value="invoices" className="gap-2"><FileText className="h-4 w-4" />Invoices</TabsTrigger>
          <TabsTrigger value="plans" className="gap-2"><Stethoscope className="h-4 w-4" />Treatment Plans</TabsTrigger>
        </TabsList>

        <TabsContent value="appointments" className="mt-4">
          <AppointmentsTab patientId={id} />
        </TabsContent>
        <TabsContent value="invoices" className="mt-4">
          <InvoicesTab patientId={id} />
        </TabsContent>
        <TabsContent value="plans" className="mt-4">
          <TreatmentPlansTab patientId={id} patientPhone={patient.whatsappNumber || patient.phone} />
        </TabsContent>
      </Tabs>

      <EditPatientDialog patient={patient} open={editOpen} onClose={() => setEditOpen(false)} />
    </div>
  );
}
