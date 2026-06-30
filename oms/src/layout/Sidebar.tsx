import { ChevronFirst, GitMerge } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useLayout } from './LayoutContext';
import { SidebarMenu } from './SidebarMenu';

export function Sidebar() {
  const { sidebarCollapse, setSidebarCollapse } = useLayout();

  return (
    <aside
      className={cn(
        'sidebar pulse-sidebar border-e border-border fixed top-0 bottom-0 z-20 hidden lg:flex flex-col shrink-0 overflow-hidden',
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
            sidebarCollapse && 'rotate-180'
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
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="size-7 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
            VA
          </div>
          <div className="default-logo overflow-hidden">
            <p className="text-xs font-semibold text-foreground truncate">Vasanth Admin</p>
            <p className="text-[10px] text-muted-foreground truncate">vasanth@gogox.com</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
