import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';

export interface MonthlyRevenue { month: string; revenue: number }
export interface AppointmentStat { status: string; count: number }
export interface PatientGrowth { month: string; newPatients: number; total: number }
export interface LeadFunnelStage { stage: string; count: number }
export interface LeadFunnel {
  stages: LeadFunnelStage[];
  summary: { won: number; lost: number; total: number; conversionRate: number };
}
export interface KpiSnapshot {
  totalPatients: number;
  newPatientsThisMonth: number;
  totalRevenue: number;
  revenueThisMonth: number;
  totalInvoices: number;
  overdueInvoices: number;
  totalAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  completionRate: number;
}
export interface ClinicSettings {
  id: string;
  clinicName: string;
  address: string | null;
  city: string | null;
  country: string | null;
  timezone: string;
  currency: string;
  logoUrl: string | null;
  updatedAt: string;
}

export function useKpi() {
  const { accessToken } = useAuth();
  return useQuery<KpiSnapshot>({
    queryKey: ['reports', 'kpi'],
    queryFn: () => apiRequest('/api/reports/kpi', {}, accessToken ?? undefined),
    staleTime: 60_000,
  });
}

export function useMonthlyRevenue() {
  const { accessToken } = useAuth();
  return useQuery<MonthlyRevenue[]>({
    queryKey: ['reports', 'revenue'],
    queryFn: () => apiRequest('/api/reports/revenue', {}, accessToken ?? undefined),
    staleTime: 60_000,
  });
}

export function useAppointmentStats() {
  const { accessToken } = useAuth();
  return useQuery<AppointmentStat[]>({
    queryKey: ['reports', 'appointments'],
    queryFn: () => apiRequest('/api/reports/appointments', {}, accessToken ?? undefined),
    staleTime: 60_000,
  });
}

export function usePatientGrowth() {
  const { accessToken } = useAuth();
  return useQuery<PatientGrowth[]>({
    queryKey: ['reports', 'patient-growth'],
    queryFn: () => apiRequest('/api/reports/patient-growth', {}, accessToken ?? undefined),
    staleTime: 60_000,
  });
}

export function useLeadFunnel() {
  const { accessToken } = useAuth();
  return useQuery<LeadFunnel>({
    queryKey: ['reports', 'lead-funnel'],
    queryFn: () => apiRequest('/api/reports/lead-funnel', {}, accessToken ?? undefined),
    staleTime: 60_000,
  });
}

export function useClinicSettings() {
  const { accessToken } = useAuth();
  return useQuery<ClinicSettings>({
    queryKey: ['settings'],
    queryFn: () => apiRequest('/api/settings', {}, accessToken ?? undefined),
  });
}

export function useUpdateClinicSettings() {
  const { accessToken } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Omit<ClinicSettings, 'id' | 'updatedAt'>>) =>
      apiRequest('/api/settings', { method: 'PATCH', body: JSON.stringify(data) }, accessToken ?? undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
}
