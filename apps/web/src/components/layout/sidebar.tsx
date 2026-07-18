'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, GitBranch, Calendar, DollarSign,
  MessageSquare, BarChart2, Settings, Stethoscope, Megaphone,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, phase: 1 },
  { href: '/patients', label: 'Patients', icon: Users, phase: 2 },
  { href: '/pipeline', label: 'Pipeline', icon: GitBranch, phase: 2 },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone, phase: 3 },
  { href: '/inbox', label: 'Inbox', icon: MessageSquare, phase: 3 },
  { href: '/appointments', label: 'Appointments', icon: Calendar, phase: 4 },
  { href: '/finance', label: 'Finance', icon: DollarSign, phase: 4 },
  { href: '/reports', label: 'Reports', icon: BarChart2, phase: 5 },
  { href: '/settings', label: 'Settings', icon: Settings, phase: 1 },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
        <Stethoscope className="h-7 w-7 text-primary" />
        <span className="text-lg font-bold tracking-tight">Dental CRM</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon, phase }) => {
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
              {phase > 5 && (
                <span className="ml-auto text-xs opacity-40">Ph{phase}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-6 py-4 border-t border-sidebar-border">
        <p className="text-xs text-sidebar-foreground/40">Phase 5 — Reports & Settings ✓</p>
      </div>
    </aside>
  );
}
