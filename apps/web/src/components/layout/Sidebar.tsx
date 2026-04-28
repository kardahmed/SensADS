import { useState, type ComponentType } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Tag,
  TrendingUp,
  FileText,
  Receipt,
  Megaphone,
  BarChart3,
  FileBarChart,
  CalendarRange,
  Settings,
  ScrollText,
  UsersRound,
  Webhook,
  ChevronsLeft,
  ChevronsRight,
  Sparkles,
  Calculator,
  CreditCard,
  ClipboardList,
  Coins,
  PiggyBank,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { Logo } from '@/components/ui/Logo';
import { cn } from '@/lib/cn';

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  roles: string[];
}

export function Sidebar(): JSX.Element {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const role = profile?.role;

  const items: NavItem[] = [
    // ADMIN
    { to: '/admin', label: t('nav.dashboard'), icon: LayoutDashboard, roles: ['super_admin', 'admin'] },
    { to: '/admin/clients', label: t('nav.clients'), icon: Users, roles: ['super_admin', 'admin'] },
    { to: '/admin/tariffs', label: t('nav.tariffs'), icon: Tag, roles: ['super_admin', 'admin'] },
    { to: '/admin/benchmarks', label: t('nav.benchmarks'), icon: TrendingUp, roles: ['super_admin', 'admin'] },
    { to: '/admin/quotes', label: t('nav.quotes'), icon: FileText, roles: ['super_admin', 'admin'] },
    { to: '/admin/purchase-orders', label: t('nav.purchaseOrders'), icon: Receipt, roles: ['super_admin', 'admin'] },
    { to: '/admin/campaigns', label: t('nav.campaigns'), icon: Megaphone, roles: ['super_admin', 'admin'] },
    { to: '/admin/invoices', label: t('nav.invoices'), icon: Receipt, roles: ['super_admin', 'admin'] },
    { to: '/admin/reports', label: t('nav.reports'), icon: FileBarChart, roles: ['super_admin', 'admin'] },
    { to: '/admin/forecasts', label: t('nav.forecasts'), icon: CalendarRange, roles: ['super_admin', 'admin'] },
    { to: '/admin/suggestions', label: t('nav.suggestions', { defaultValue: 'Suggestions' }), icon: Sparkles, roles: ['super_admin', 'admin'] },
    { to: '/admin/calculator', label: t('nav.calculator', { defaultValue: 'Calculator' }), icon: Calculator, roles: ['super_admin', 'admin'] },
    { to: '/admin/profitability', label: t('nav.profitability', { defaultValue: 'Rentabilité' }), icon: PiggyBank, roles: ['super_admin', 'admin'] },
    { to: '/admin/exchange-rates', label: t('nav.exchangeRates', { defaultValue: 'Taux change' }), icon: Coins, roles: ['super_admin', 'admin'] },
    { to: '/admin/ad-accounts', label: t('nav.adAccounts', { defaultValue: 'Comptes pub' }), icon: CreditCard, roles: ['super_admin', 'admin'] },
    { to: '/admin/media-plans', label: t('nav.mediaPlans', { defaultValue: 'Plans Média' }), icon: ClipboardList, roles: ['super_admin', 'admin'] },
    { to: '/admin/audit-logs', label: t('nav.audit'), icon: ScrollText, roles: ['super_admin'] },
    { to: '/admin/settings', label: t('nav.settings'), icon: Settings, roles: ['super_admin'] },

    // TM
    { to: '/tm', label: t('nav.dashboard'), icon: LayoutDashboard, roles: ['traffic_manager'] },
    { to: '/tm/campaigns', label: t('nav.campaigns'), icon: Megaphone, roles: ['traffic_manager'] },
    { to: '/tm/kpis', label: t('nav.kpis'), icon: BarChart3, roles: ['traffic_manager'] },
    { to: '/tm/forecasts', label: t('nav.forecasts'), icon: CalendarRange, roles: ['traffic_manager'] },
    { to: '/tm/suggestions', label: t('nav.suggestions', { defaultValue: 'Suggestions' }), icon: Sparkles, roles: ['traffic_manager'] },

    // CLIENT
    { to: '/client', label: t('nav.dashboard'), icon: LayoutDashboard, roles: ['client_owner', 'client_member'] },
    { to: '/client/quotes', label: t('nav.quotes'), icon: FileText, roles: ['client_owner', 'client_member'] },
    { to: '/client/purchase-orders', label: t('nav.purchaseOrders'), icon: Receipt, roles: ['client_owner', 'client_member'] },
    { to: '/client/campaigns', label: t('nav.campaigns'), icon: Megaphone, roles: ['client_owner', 'client_member'] },
    { to: '/client/invoices', label: t('nav.invoices'), icon: Receipt, roles: ['client_owner', 'client_member'] },
    { to: '/client/reports', label: t('nav.reports'), icon: FileBarChart, roles: ['client_owner', 'client_member'] },
    { to: '/client/forecasts', label: t('nav.forecasts'), icon: CalendarRange, roles: ['client_owner', 'client_member'] },
    { to: '/client/suggestions', label: t('nav.suggestions', { defaultValue: 'Suggestions' }), icon: Sparkles, roles: ['client_owner', 'client_member'] },
    { to: '/client/media-plans', label: t('nav.mediaPlans', { defaultValue: 'Plans Média' }), icon: ClipboardList, roles: ['client_owner', 'client_member'] },
    { to: '/client/team', label: t('nav.team'), icon: UsersRound, roles: ['client_owner'] },
    { to: '/client/webhooks', label: t('nav.webhooks'), icon: Webhook, roles: ['client_owner'] },
  ];

  const filtered = role ? items.filter((item) => item.roles.includes(role)) : [];

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-border bg-sidebar transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className={cn('flex h-16 items-center border-b border-border', collapsed ? 'justify-center px-2' : 'px-4')}>
        <Logo size={32} showText={!collapsed} />
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-0.5">
          {filtered.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === '/admin' || item.to === '/tm' || item.to === '/client'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                    'text-textSecondary hover:bg-card hover:text-textPrimary',
                    isActive && 'bg-accent/10 text-accent hover:bg-accent/20 hover:text-accent',
                    collapsed && 'justify-center',
                  )
                }
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <button
        onClick={() => setCollapsed((c) => !c)}
        className="m-2 flex items-center gap-2 rounded-lg p-2 text-sm text-textSecondary hover:bg-card hover:text-textPrimary"
        aria-label={collapsed ? 'Étendre' : 'Réduire'}
      >
        {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        {!collapsed && <span className="text-xs">Réduire</span>}
      </button>
    </aside>
  );
}
