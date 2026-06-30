import { useState } from 'react';
import { Bell, Search, Menu, Moon, Sun, Store } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useCommerce } from '@/context/CommerceProvider';
import { Badge } from '@/components/ui/badge';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/orders': 'Sales Orders',
  '/execution-plans/build': 'Plan Builder',
  '/execution-plans': 'Execution Plans',
  '/products': 'Product Catalog',
  '/customers': 'Consignees',
  '/warehouses': 'Warehouses',
  '/settings': 'Settings',
};

const STORE_NAV = [
  { label: 'Home', path: '/dashboard' },
  { label: 'Products', path: '/products' },
  { label: 'Orders', path: '/orders' },
  { label: 'Plan Builder', path: '/execution-plans/build' },
  { label: 'Plans', path: '/execution-plans' },
];

interface HeaderProps {
  dark: boolean;
  setDark: (v: boolean) => void;
  onMobileMenuOpen: () => void;
}

export function Header({ dark, setDark, onMobileMenuOpen }: HeaderProps) {
  const { pathname } = useLocation();
  const { orders } = useCommerce();
  const [search, setSearch] = useState('');
  const pending = orders.filter(o => o.status === 'Pending Consolidation').length;
  const pageTitle = Object.entries(PAGE_TITLES).find(([k]) => pathname === k || pathname.startsWith(k + '/'))?.[1] ?? 'Commerce';

  return (
    <header className="header fixed top-0 z-10 start-0 end-0 flex flex-col shrink-0 bg-card border-b border-border">
      <div className="container-fluid flex items-center justify-between gap-4 h-[var(--header-height)]">
        <div className="flex lg:hidden items-center gap-3">
          <button type="button" onClick={onMobileMenuOpen} className="p-1.5 rounded-md hover:bg-accent"><Menu className="size-4" /></button>
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="size-6 rounded-md bg-primary flex items-center justify-center"><Store className="size-3.5 text-primary-foreground" /></div>
            <span className="text-sm font-bold">Pulse Commerce</span>
          </Link>
        </div>

        <div className="hidden lg:flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Pulse Platform</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-muted-foreground">Commerce</span>
          <span className="text-muted-foreground">/</span>
          <span className="font-semibold">{pageTitle}</span>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <div className="hidden sm:flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5 w-52">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="bg-transparent outline-none text-[13px] w-full" />
            <Badge variant="outline" size="sm">⌘ K</Badge>
          </div>
          <button type="button" className="relative p-2 rounded-lg hover:bg-accent"><Bell className="size-4" /></button>
          {pending > 0 && (
            <Link to="/orders"><Badge variant="warning" appearance="light" size="sm">{pending} pending</Badge></Link>
          )}
          <button type="button" onClick={() => setDark(!dark)} className="p-2 rounded-lg hover:bg-accent">
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">CM</div>
        </div>
      </div>

      <div className="hidden lg:flex border-t border-border/60 container-fluid gap-5 text-2sm">
        {STORE_NAV.map(item => (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              'py-2 border-b-2 -mb-px transition-colors text-xs',
              pathname === item.path || pathname.startsWith(item.path + '/')
                ? 'border-[var(--pulse-hero-blue)] text-[var(--pulse-hero-blue)] font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </header>
  );
}
