'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, GitBranch, Calendar, DollarSign,
  MessageSquare, BarChart2, Settings, Stethoscope, Megaphone, ArrowLeftRight, Sunrise,
} from 'lucide-react';
import { canAccessRoute } from '@dental-crm/shared';
import { useAuth } from '@/context/auth-context';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/patients', label: 'Patients', icon: Users },
  { href: '/my-day', label: 'My Day', icon: Sunrise },
  { href: '/pipeline', label: 'Deals', icon: GitBranch },
  { href: '/team', label: 'Sales Team', icon: ArrowLeftRight },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/inbox', label: 'Inbox', icon: MessageSquare },
  { href: '/appointments', label: 'Appointments', icon: Calendar },
  { href: '/finance', label: 'Finance', icon: DollarSign },
  { href: '/reports', label: 'Reports', icon: BarChart2 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  // Offered only if it can actually be opened. The same policy decides the API's answer, so the
  // nav cannot advertise a page that greets the person with a 403 — which is how a product tells
  // somebody they may do something and then refuses when they try.
  const visible = navItems.filter((item) => canAccessRoute(item.href, user?.role));

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
        <Stethoscope className="h-7 w-7 text-primary" />
        <span className="text-lg font-bold tracking-tight">Dental CRM</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visible.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
