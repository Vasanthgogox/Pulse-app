import { JSX, useCallback } from 'react';
import {
  LayoutGrid, Package, ShoppingCart, GitMerge, Users, Warehouse, Settings, Radio, Telescope, Truck,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useCommerce } from '@/context/CommerceProvider';
import { useExecution } from '@/context/ExecutionProvider';
import { getActiveWorkspace, PULSE_WORKSPACES } from '@/types/workspaces';
import { isExecutionWorkspacePath, isNavPathActive } from '@/lib/workspace-routes';

type NavHeading = { heading: string };
type NavLink = { title: string; path: string; icon: React.ComponentType<{ className?: string }> };
type NavItem = NavHeading | NavLink;

function isNavHeading(item: NavItem): item is NavHeading {
  return 'heading' in item;
}

const COMMERCE_NAV: NavItem[] = [
  { title: 'Dashboard', path: '/dashboard', icon: LayoutGrid },
  { heading: 'Catalog & CRM' },
  { title: 'Products', path: '/products', icon: Package },
  { title: 'Consignees', path: '/customers', icon: Users },
  { title: 'Warehouses', path: '/warehouses', icon: Warehouse },
  { heading: 'Orders & Planning' },
  { title: 'Orders', path: '/orders', icon: ShoppingCart },
  { title: 'Plan Builder', path: '/execution-plans/build', icon: GitMerge },
  { title: 'Published Plans', path: '/execution-plans', icon: GitMerge },
  { heading: 'Platform' },
  { title: 'Observatory', path: '/observatory', icon: Telescope },
  { title: 'Settings', path: '/settings', icon: Settings },
];

const EXECUTION_NAV: NavItem[] = [
  { title: 'Execution Home', path: '/execution', icon: Truck },
];

export function SidebarMenu() {
  const { pathname } = useLocation();
  const { orders, selectedOrderIds } = useCommerce();
  const { pendingJobs } = useExecution();
  const isExecution = isExecutionWorkspacePath(pathname);
  const workspace = isExecution
    ? PULSE_WORKSPACES.find(w => w.id === 'execution')!
    : getActiveWorkspace();
  const nav = isExecution ? EXECUTION_NAV : COMMERCE_NAV;
  const pendingCount = orders.filter(o => o.status === 'Pending Consolidation').length;

  const isActive = useCallback((path: string) => isNavPathActive(pathname, path), [pathname]);

  const buildItem = (item: NavItem, idx: number): JSX.Element => {
    if (isNavHeading(item)) {
      return (
        <div key={idx} className="px-4 pt-4 pb-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60">{item.heading}</span>
        </div>
      );
    }

    const active = isActive(item.path);
    const badge = item.path === '/execution-plans/build' && selectedOrderIds.length > 0
      ? selectedOrderIds.length
      : item.path === '/orders' && pendingCount > 0
        ? pendingCount
        : undefined;

    return (
      <div key={idx} className="px-2">
        <Link
          to={item.path}
          className={cn(
            'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-2sm font-medium transition-colors',
            active ? 'bg-[var(--pulse-brand-soft)] text-[var(--pulse-hero-blue)]' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          )}
        >
          <item.icon className={cn('size-3.5 shrink-0', active ? 'text-[var(--pulse-hero-blue)]' : 'text-muted-foreground')} />
          <span className="flex-1 truncate">{item.title}</span>
          {badge !== undefined && (
            <Badge variant={item.path === '/execution-plans/build' ? 'primary' : 'warning'} appearance="default" size="xs" className="min-w-[1.25rem] justify-center tabular-nums">
              {badge}
            </Badge>
          )}
        </Link>
      </div>
    );
  };

  return (
    <nav className="flex flex-col gap-0.5 py-4 overflow-y-auto">
      <div className="px-4 pb-3 mb-1 border-b border-border/60">
        <div className="flex items-center gap-2">
          <Radio className="size-3 text-[var(--pulse-hero-blue)]" />
          <span className="text-3xs font-bold uppercase tracking-wider text-[var(--pulse-hero-blue)]">{workspace.label} Workspace</span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 leading-snug">{workspace.description}</p>
      </div>

      {nav.map((item, idx) => buildItem(item, idx))}

      <div className="px-4 pt-5 mt-2 border-t border-border/60">
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/50">Workspaces</span>
        <div className="mt-2 space-y-1">
          <Link
            to="/dashboard"
            className={`block px-2 py-1 rounded-md text-3xs ${!isExecution ? 'text-[var(--pulse-hero-blue)] font-medium' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Commerce
          </Link>
          <Link
            to="/execution"
            className={`block px-2 py-1 rounded-md text-3xs ${isExecution ? 'text-[var(--pulse-hero-blue)] font-medium' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Operations / Execution {pendingJobs.length > 0 && !isExecution ? `· ${pendingJobs.length} to dispatch` : ''}
          </Link>
          {PULSE_WORKSPACES.filter(w => !['commerce', 'execution', 'operations'].includes(w.id)).map(w => (
            <div key={w.id} className="px-2 py-1.5 rounded-lg text-2xs text-muted-foreground/50 cursor-not-allowed" title={`${w.label} — ${w.description}`}>
              {w.label}
              {w.milestone && <span className="ml-1 opacity-60">M{w.milestone}</span>}
            </div>
          ))}
        </div>
      </div>
    </nav>
  );
}
