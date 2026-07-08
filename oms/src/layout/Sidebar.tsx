import { ChevronFirst, GitMerge } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useLayout } from './LayoutContext';
import { SidebarMenu } from './SidebarMenu';
import { SidebarAccount } from './SidebarAccount';

interface SidebarProps {
  variant?: 'desktop' | 'drawer';
}

export function Sidebar({ variant = 'desktop' }: SidebarProps) {
  const { sidebarCollapse, setSidebarCollapse } = useLayout();
  const isDrawer = variant === 'drawer';

  return (
    <aside
      className={cn(
        'sidebar pulse-sidebar border-e border-border flex flex-col shrink-0 overflow-hidden bg-[var(--pulse-sidebar)]',
        isDrawer ? 'relative w-full h-full z-0' : 'fixed top-0 bottom-0 z-20 hidden lg:flex',
      )}
    >
      {/* Logo Header */}
      <div className="sidebar-header flex items-center justify-between px-4 shrink-0 border-b border-border">
        <Link to="/dashboard" className="flex items-center gap-2 overflow-hidden">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary">
            <GitMerge className="size-3.5 text-primary-foreground" />
          </div>
          <div className="default-logo overflow-hidden">
            <span className="block text-xs font-bold text-foreground whitespace-nowrap">Pulse</span>
            <span className="block text-3xs font-medium text-muted-foreground leading-tight whitespace-nowrap">Commerce</span>
          </div>
          <div className="small-logo hidden">
          </div>
        </Link>
        <button
          onClick={() => setSidebarCollapse(!sidebarCollapse)}
          className={cn(
            'size-7 flex items-center justify-center rounded-md border border-border hover:bg-accent text-muted-foreground transition-transform',
            sidebarCollapse && 'rotate-180',
            isDrawer && 'hidden',
          )}
        >
          <ChevronFirst className="size-3.5" />
        </button>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div style={{ width: 'var(--sidebar-default-width)' }}>
          <SidebarMenu />
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-border px-4 py-3">
        <SidebarAccount />
      </div>
    </aside>
  );
}
