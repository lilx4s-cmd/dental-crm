import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/auth-context';
import { apiRequest } from '@/lib/api-client';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  calendarColor: string | null;
  specialization: string | null;
}

export function useUsers() {
  const { accessToken } = useAuth();
  return useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => apiRequest('/api/users', {}, accessToken ?? undefined),
  });
}

export function useDentists() {
  const { data: users, ...rest } = useUsers();
  return { data: users?.filter((u) => u.role === 'DENTIST' && u.isActive), ...rest };
}

// Treatment coordinators reuse the SALES_CONSULTANT role (confirmed product decision:
// no dedicated TREATMENT_COORDINATOR role). Mirrors useDentists().
export function useCoordinators() {
  const { data: users, ...rest } = useUsers();
  return { data: users?.filter((u) => u.role === 'SALES_CONSULTANT' && u.isActive), ...rest };
}
