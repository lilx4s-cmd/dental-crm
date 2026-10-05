'use client';

import { usePathname } from 'next/navigation';
import { canAccessRoute, ROUTE_ACCESS, ROUTE_PERMISSIONS } from '@dental-crm/shared';
import { useAuth } from '@/context/auth-context';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, user } = useAuth();
  if (!ready || !user) return <div className="flex min-h-screen items-center justify-center text-muted-foreground" role="status">Loading your workspace…</div>;
  const route = Object.keys(ROUTE_ACCESS).find(path => pathname === path || pathname.startsWith(`${path}/`));
  const readKey = route ? ROUTE_PERMISSIONS[route] : undefined;
  const readOnly = readKey?.endsWith('.read') && user.permissions?.[readKey.replace('.read', '.write')] === false;
  const allowed = !route || canAccessRoute(route, user.role, user.permissions);
  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar />
      <div className="min-h-0 min-w-0 flex-1 flex flex-col overflow-hidden">
        <Topbar />
        <main className="min-h-0 min-w-0 flex-1 overflow-auto p-6 bg-muted/30">
          {allowed && readOnly && <p className="mb-4 rounded border bg-background p-3 text-sm text-muted-foreground">Your access to this workspace is read-only. Editing is disabled for your profile.</p>}
          {allowed ? children : <p role="alert">This page is not enabled for your access profile. Choose an available workspace page or contact your administrator.</p>}
        </main>
      </div>
    </div>
  );
}
