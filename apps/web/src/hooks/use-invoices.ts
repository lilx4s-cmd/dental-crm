import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Payment {
  id: string;
  amount: number;
  method: string;
  status: string;
  paidAt: string | null;
  reference: string | null;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  currency: string;
  dueDate: string | null;
  issuedAt: string | null;
  createdAt: string;
  patient: { id: string; firstName: string; lastName: string; phone: string | null };
  createdBy: { id: string; firstName: string; lastName: string };
  items: InvoiceItem[];
  payments: Payment[];
}

export interface FinanceSummary {
  totalRevenue: number;
  pendingAmount: number;
  invoiceCount: number;
}

export function useInvoices(patientId?: string, status?: string) {
  const { accessToken } = useAuth();
  const params = new URLSearchParams();
  if (patientId) params.set('patientId', patientId);
  if (status) params.set('status', status);

  return useQuery<Invoice[]>({
    queryKey: ['invoices', patientId, status],
    queryFn: () => apiRequest(`/api/invoices?${params}`, {}, accessToken ?? undefined),
  });
}

export function useFinanceSummary() {
  const { accessToken } = useAuth();
  return useQuery<FinanceSummary>({
    queryKey: ['invoices', 'summary'],
    queryFn: () => apiRequest('/api/invoices/summary', {}, accessToken ?? undefined),
    staleTime: 30_000,
  });
}

export function useCreateInvoice() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      patientId: string;
      items: { description: string; quantity: number; unitPrice: number }[];
      discount?: number;
      tax?: number;
      dueDate?: string;
      currency?: string;
    }) => apiRequest('/api/invoices', { method: 'POST', body: JSON.stringify(data) }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  });
}

export function useRecordPayment(invoiceId: string) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { amount: number; method: string; reference?: string }) =>
      apiRequest(`/api/invoices/${invoiceId}/payments`, { method: 'POST', body: JSON.stringify(data) }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  });
}

export function useUpdateInvoiceStatus(id: string) {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: string) =>
      apiRequest(`/api/invoices/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  });
}
