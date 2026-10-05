'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  LayoutDashboard,
  Users,
  GitBranch,
  Calendar,
  DollarSign,
  MessageSquare,
  BarChart2,
  Settings,
  Stethoscope,
  Megaphone,
  ArrowLeftRight,
  Sunrise,
  Smartphone,
} from 'lucide-react';
import { canAccessRoute } from '@dental-crm/shared';
import { useAuth } from '@/context/auth-context';
import { useUnreadSummary } from '@/hooks/use-conversations';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/travel', label: 'Patient Travel', icon: Calendar },
  { href: '/operations-finance', label: 'Costs & Compensation', icon: DollarSign },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/my-day', label: 'My Day', icon: Sunrise },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/patients', label: 'Patients', icon: Users },
  { href: '/pipeline', label: 'Deals', icon: GitBranch },
  { href: '/supervision', label: 'Lead Supervision', icon: BarChart2 },
  { href: '/access', label: 'Access Control', icon: Users },
  { href: '/team', label: 'Sales Team', icon: ArrowLeftRight },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/inbox', label: 'Conversations', icon: MessageSquare },
  { href: '/whatsapp', label: 'Work WhatsApp', icon: Smartphone },
  { href: '/appointments', label: 'Appointments', icon: Calendar },
  { href: '/finance', label: 'Finance', icon: DollarSign },
  { href: '/reports', label: 'Reports', icon: BarChart2 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  // Threads, not messages: "6" meaning six people waiting is actionable, where "137" meaning
  // message lines is only alarming.
  const { data: unread } = useUnreadSummary();

  // Offered only if it can actually be opened. The same policy decides the API's answer, so the
  // nav cannot advertise a page that greets the person with a 403 — which is how a product tells
  // somebody they may do something and then refuses when they try.
  const visible = navItems.filter((item) =>
    canAccessRoute(item.href, user?.role, user?.permissions),
  );

  return (
    <aside className="flex min-h-0 w-16 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border md:w-64">
      <div className="flex shrink-0 items-center justify-center gap-3 px-2 py-5 border-b border-sidebar-border md:justify-start md:px-6">
        <Stethoscope className="h-7 w-7 text-primary" />
        <span className="hidden text-lg font-bold tracking-tight md:inline">Dental CRM</span>
      </div>

      <nav
        aria-label="Main navigation"
        className="min-h-0 flex-1 px-2 py-4 space-y-1 overflow-y-auto md:px-3"
      >
        {visible.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-label={
                href === '/inbox' && unread?.conversations
                  ? `${label}, ${unread.conversations} conversations need a reply`
                  : label
              }
              title={label}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-white/10 hover:text-sidebar-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden flex-1 md:inline">{label}</span>
              {href === '/inbox' && !!unread?.conversations && (
                <span
                  className={cn(
                    'hidden shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums md:inline',
                    active
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-primary text-primary-foreground',
                  )}
                  aria-label={`${unread.conversations} conversations need a reply`}
                >
                  {unread.conversations}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
