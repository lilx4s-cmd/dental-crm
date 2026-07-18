'use client';

import { useState } from 'react';
import { DollarSign, Clock, FileText, Plus, Trash2, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useInvoices,
  useFinanceSummary,
  useCreateInvoice,
  useRecordPayment,
  useUpdateInvoiceStatus,
  type Invoice,
} from '@/hooks/use-invoices';
import { usePatients } from '@/hooks/use-patients';

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  SENT: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  PARTIALLY_PAID: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  PAID: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  OVERDUE: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  CANCELLED: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
  REFUNDED: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
};

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card (Credit/Debit)' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'ONLINE', label: 'Online Payment' },
  { value: 'INSTALLMENT', label: 'Installment' },
  { value: 'OTHER', label: 'Other' },
];

// ─── Format currency ──────────────────────────────────────────────────────────
function fmt(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

// ─── Summary card ─────────────────────────────────────────────────────────────
function SummaryCard({
  label,
  value,
  icon: Icon,
  color,
  loading,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={`h-5 w-5 ${color}`} />
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-28" /> : <p className="text-2xl font-bold">{value}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Record Payment Dialog ─────────────────────────────────────────────────────
function RecordPaymentDialog({
  invoice,
  onClose,
}: {
  invoice: Invoice | null;
  onClose: () => void;
}) {
  const record = useRecordPayment(invoice?.id ?? '');
  const remaining = invoice
    ? Number(invoice.total) -
      invoice.payments
        .filter((p) => p.status === 'COMPLETED')
        .reduce((s, p) => s + Number(p.amount), 0)
    : 0;

  const [form, setForm] = useState({
    amount: String(Math.max(0, remaining)),
    method: 'CASH',
    reference: '',
  });

  if (!invoice) return null;

  const handleSubmit = () => {
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) { toast.error('Enter a valid amount'); return; }
    record.mutate(
      { amount, method: form.method, reference: form.reference || undefined },
      {
        onSuccess: () => { toast.success('Payment recorded'); onClose(); },
        onError: () => toast.error('Failed to record payment'),
      }
    );
  };

  return (
    <Dialog open={!!invoice} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Record Payment — {invoice.invoiceNumber}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Total: {fmt(Number(invoice.total), invoice.currency)} · Remaining:{' '}
            <span className="font-semibold text-foreground">{fmt(remaining, invoice.currency)}</span>
          </div>

          <div className="space-y-1">
            <Label>Amount</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </div>

          <div className="space-y-1">
            <Label>Payment Method</Label>
            <Select value={form.method} onValueChange={(v) => setForm((f) => ({ ...f, method: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Reference (optional)</Label>
            <Input
              placeholder="Transaction ID, cheque no..."
              value={form.reference}
              onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={record.isPending}>
            {record.isPending ? 'Saving...' : 'Record Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Invoice Detail Dialog ─────────────────────────────────────────────────────
function InvoiceDetailDialog({
  invoice,
  onClose,
  onPay,
}: {
  invoice: Invoice | null;
  onClose: () => void;
  onPay: (inv: Invoice) => void;
}) {
  const updateStatus = useUpdateInvoiceStatus(invoice?.id ?? '');

  if (!invoice) return null;

  const totalPaid = invoice.payments
    .filter((p) => p.status === 'COMPLETED')
    .reduce((s, p) => s + Number(p.amount), 0);

  const handleSend = () => {
    updateStatus.mutate('SENT', {
      onSuccess: () => { toast.success('Invoice marked as Sent'); onClose(); },
      onError: () => toast.error('Failed to update'),
    });
  };

  return (
    <Dialog open={!!invoice} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {invoice.invoiceNumber}
            <Badge className={STATUS_COLORS[invoice.status] ?? ''} variant="outline">
              {invoice.status.replace(/_/g, ' ')}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Patient: <span className="font-medium text-foreground">
              {invoice.patient.firstName} {invoice.patient.lastName}
            </span>
            {invoice.dueDate && (
              <> · Due: <span className="font-medium text-foreground">{format(new Date(invoice.dueDate), 'PP')}</span></>
            )}
          </div>

          {/* Line items */}
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Description</th>
                  <th className="text-right px-3 py-2">Qty</th>
                  <th className="text-right px-3 py-2">Unit Price</th>
                  <th className="text-right px-3 py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="px-3 py-2">{item.description}</td>
                    <td className="text-right px-3 py-2">{item.quantity}</td>
                    <td className="text-right px-3 py-2">{fmt(Number(item.unitPrice), invoice.currency)}</td>
                    <td className="text-right px-3 py-2">{fmt(Number(item.total), invoice.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmt(Number(invoice.subtotal), invoice.currency)}</span></div>
            {Number(invoice.discount) > 0 && (
              <div className="flex justify-between text-green-600"><span>Discount</span><span>-{fmt(Number(invoice.discount), invoice.currency)}</span></div>
            )}
            {Number(invoice.tax) > 0 && (
              <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{fmt(Number(invoice.tax), invoice.currency)}</span></div>
            )}
            <div className="flex justify-between font-bold border-t pt-1">
              <span>Total</span><span>{fmt(Number(invoice.total), invoice.currency)}</span>
            </div>
            <div className="flex justify-between text-green-600">
              <span>Paid</span><span>{fmt(totalPaid, invoice.currency)}</span>
            </div>
            {totalPaid < Number(invoice.total) && (
              <div className="flex justify-between font-semibold text-orange-600">
                <span>Remaining</span><span>{fmt(Number(invoice.total) - totalPaid, invoice.currency)}</span>
              </div>
            )}
          </div>

          {/* Payments */}
          {invoice.payments.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Payment History</p>
              {invoice.payments.map((p) => (
                <div key={p.id} className="flex justify-between text-sm py-1 border-t">
                  <span>{p.method.replace(/_/g, ' ')}{p.reference ? ` · ${p.reference}` : ''}</span>
                  <span className="font-medium">{fmt(Number(p.amount), invoice.currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {invoice.status === 'DRAFT' && (
            <Button variant="outline" size="sm" onClick={handleSend} disabled={updateStatus.isPending}>
              Mark as Sent
            </Button>
          )}
          {invoice.status !== 'PAID' && invoice.status !== 'CANCELLED' && invoice.status !== 'REFUNDED' && (
            <Button size="sm" onClick={() => { onClose(); onPay(invoice); }}>
              <CreditCard className="h-4 w-4 mr-2" />
              Record Payment
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Invoice Dialog ─────────────────────────────────────────────────────
interface LineItem { description: string; quantity: number; unitPrice: number }

function CreateInvoiceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateInvoice();
  const [patientSearch, setPatientSearch] = useState('');
  const { data: patientsData } = usePatients({ search: patientSearch, limit: 8 });

  const [patientId, setPatientId] = useState('');
  const [discount, setDiscount] = useState('0');
  const [tax, setTax] = useState('0');
  const [dueDate, setDueDate] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [items, setItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unitPrice: 0 },
  ]);

  const updateItem = (i: number, k: keyof LineItem, v: string | number) => {
    setItems((prev) => prev.map((item, idx) => idx === i ? { ...item, [k]: v } : item));
  };

  const addItem = () => setItems((prev) => [...prev, { description: '', quantity: 1, unitPrice: 0 }]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const subtotal = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const totalCalc = subtotal - parseFloat(discount || '0') + parseFloat(tax || '0');

  const handleSubmit = () => {
    if (!patientId) { toast.error('Select a patient'); return; }
    if (items.some((it) => !it.description || it.unitPrice <= 0)) {
      toast.error('Fill in all line items'); return;
    }
    create.mutate(
      {
        patientId,
        items: items.map((it) => ({
          description: it.description,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
        })),
        discount: parseFloat(discount || '0') || undefined,
        tax: parseFloat(tax || '0') || undefined,
        dueDate: dueDate || undefined,
        currency,
      },
      {
        onSuccess: () => {
          toast.success('Invoice created');
          // reset
          setPatientId(''); setPatientSearch(''); setItems([{ description: '', quantity: 1, unitPrice: 0 }]);
          setDiscount('0'); setTax('0'); setDueDate(''); setCurrency('USD');
          onClose();
        },
        onError: () => toast.error('Failed to create invoice'),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Invoice</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Patient */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Patient</Label>
              <Input
                placeholder="Search patient..."
                value={patientSearch}
                onChange={(e) => { setPatientSearch(e.target.value); setPatientId(''); }}
              />
              {patientSearch && patientsData?.data && patientsData.data.length > 0 && !patientId && (
                <div className="border rounded-md max-h-36 overflow-y-auto shadow-sm bg-background z-10">
                  {patientsData.data.map((p) => (
                    <button
                      key={p.id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                      onClick={() => { setPatientId(p.id); setPatientSearch(`${p.firstName} ${p.lastName}`); }}
                    >
                      {p.firstName} {p.lastName}
                    </button>
                  ))}
                </div>
              )}
              {patientId && <p className="text-xs text-green-600">✓ Selected</p>}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['USD', 'EUR', 'GBP', 'SAR', 'AED', 'EGP'].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Due Date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Line Items</Label>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-3 w-3 mr-1" /> Add Item
              </Button>
            </div>
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left px-3 py-2 w-1/2">Description</th>
                    <th className="text-right px-3 py-2 w-16">Qty</th>
                    <th className="text-right px-3 py-2 w-28">Unit Price</th>
                    <th className="text-right px-3 py-2 w-24">Total</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1">
                        <Input
                          className="h-8 text-sm border-0 shadow-none focus-visible:ring-0 px-1"
                          placeholder="Description..."
                          value={item.description}
                          onChange={(e) => updateItem(i, 'description', e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Input
                          className="h-8 text-sm border-0 shadow-none focus-visible:ring-0 text-right px-1"
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(i, 'quantity', parseInt(e.target.value) || 1)}
                        />
                      </td>
                      <td className="px-2 py-1">
                        <Input
                          className="h-8 text-sm border-0 shadow-none focus-visible:ring-0 text-right px-1"
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(i, 'unitPrice', parseFloat(e.target.value) || 0)}
                        />
                      </td>
                      <td className="px-3 py-1 text-right font-medium">
                        {fmt(item.quantity * item.unitPrice, currency)}
                      </td>
                      <td className="px-1 py-1 text-center">
                        {items.length > 1 && (
                          <button onClick={() => removeItem(i)} className="text-muted-foreground hover:text-destructive transition-colors">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Discount / Tax / Total */}
          <div className="flex justify-end">
            <div className="w-64 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{fmt(subtotal, currency)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Discount</span>
                <Input
                  className="h-7 w-24 text-right text-sm"
                  type="number"
                  step="0.01"
                  min="0"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Tax</span>
                <Input
                  className="h-7 w-24 text-right text-sm"
                  type="number"
                  step="0.01"
                  min="0"
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between border-t pt-2 font-bold">
                <span>Total</span>
                <span>{fmt(Math.max(0, totalCalc), currency)}</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={create.isPending}>
            {create.isPending ? 'Creating...' : 'Create Invoice'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function FinancePage() {
  const { data: summary, isLoading: summaryLoading } = useFinanceSummary();
  const { data: invoices, isLoading: invoicesLoading } = useInvoices();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const filtered = statusFilter
    ? invoices?.filter((inv) => inv.status === statusFilter)
    : invoices;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Finance</h1>
          <p className="text-muted-foreground mt-1">Invoices, payments & revenue</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Invoice
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="Total Revenue"
          value={summaryLoading ? '—' : fmt(summary?.totalRevenue ?? 0)}
          icon={DollarSign}
          color="text-green-500"
          loading={summaryLoading}
        />
        <SummaryCard
          label="Pending Amount"
          value={summaryLoading ? '—' : fmt(summary?.pendingAmount ?? 0)}
          icon={Clock}
          color="text-orange-500"
          loading={summaryLoading}
        />
        <SummaryCard
          label="Total Invoices"
          value={summaryLoading ? '—' : String(summary?.invoiceCount ?? 0)}
          icon={FileText}
          color="text-blue-500"
          loading={summaryLoading}
        />
      </div>

      {/* Invoice table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <CardTitle>Invoices</CardTitle>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 h-8">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All</SelectItem>
              {['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'].map((s) => (
                <SelectItem key={s} value={s}>{s.replace(/_/g, ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          {invoicesLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered && filtered.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((inv) => {
                  const paid = inv.payments
                    .filter((p) => p.status === 'COMPLETED')
                    .reduce((s, p) => s + Number(p.amount), 0);

                  return (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedInvoice(inv)}
                    >
                      <TableCell className="font-mono text-sm font-medium">{inv.invoiceNumber}</TableCell>
                      <TableCell>
                        {inv.patient.firstName} {inv.patient.lastName}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {format(new Date(inv.issuedAt ?? inv.createdAt), 'PP')}
                      </TableCell>
                      <TableCell className="text-sm">
                        {inv.dueDate ? format(new Date(inv.dueDate), 'PP') : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[inv.status] ?? ''} variant="outline">
                          {inv.status.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {fmt(Number(inv.total), inv.currency)}
                      </TableCell>
                      <TableCell className={`text-right text-sm ${paid >= Number(inv.total) ? 'text-green-600' : paid > 0 ? 'text-orange-600' : 'text-muted-foreground'}`}>
                        {fmt(paid, inv.currency)}
                      </TableCell>
                      <TableCell>
                        {inv.status !== 'PAID' && inv.status !== 'CANCELLED' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={(e) => { e.stopPropagation(); setPayInvoice(inv); }}
                          >
                            <CreditCard className="h-3.5 w-3.5 mr-1" />
                            Pay
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="py-16 text-center text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No invoices{statusFilter ? ` with status "${statusFilter}"` : ''} yet.</p>
              <Button variant="link" className="mt-2 text-sm" onClick={() => setCreateOpen(true)}>
                Create the first invoice
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CreateInvoiceDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <InvoiceDetailDialog
        invoice={selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        onPay={(inv) => setPayInvoice(inv)}
      />
      <RecordPaymentDialog invoice={payInvoice} onClose={() => setPayInvoice(null)} />
    </div>
  );
}
