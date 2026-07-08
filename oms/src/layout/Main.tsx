import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { GitMerge, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { useLayout } from './LayoutContext';
import { Sidebar } from './Sidebar';
import { SidebarMenu } from './SidebarMenu';
import { SidebarAccount } from './SidebarAccount';
import { Header } from './Header';

export function Main() {
  const [dark, setDark]            = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { sidebarCollapse }         = useLayout();

  useEffect(() => {
    const body = document.body.classList;
    body.add('oms-app', 'sidebar-fixed', 'header-fixed');
    const t = setTimeout(() => body.add('layout-initialized'), 1000);
    return () => {
      body.remove('oms-app', 'sidebar-fixed', 'header-fixed', 'layout-initialized', 'sidebar-collapse');
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    const body = document.body.classList;
    if (sidebarCollapse) body.add('sidebar-collapse');
    else body.remove('sidebar-collapse');
  }, [sidebarCollapse]);

  return (
    <div className={cn(dark ? 'dark' : '', 'min-h-dvh flex w-full bg-background')}>
      <Toaster position="top-right" richColors closeButton />
      <Sidebar />

      <div className="wrapper flex flex-1 flex-col min-h-0 min-w-0 w-full">
        <Header dark={dark} setDark={setDark} onMobileMenuOpen={() => setMobileOpen(true)} />

        <main className="flex-1 min-h-0 w-full" role="content">
          <Outlet />
        </main>

        <footer className="shrink-0 border-t border-border bg-background w-full">
          <div className="container-fluid flex h-9 items-center justify-between text-[11px] leading-none text-muted-foreground">
            <span>© 2026 Pulse Platform — Commerce & Execution</span>
            <span>v1.0.0</span>
          </div>
        </footer>
      </div>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="absolute left-0 top-0 bottom-0 w-[min(18rem,88vw)] bg-[var(--pulse-sidebar)] border-r border-border flex flex-col shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 h-[var(--header-height)] border-b border-border shrink-0">
              <Link to="/dashboard" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
                <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary">
                  <GitMerge className="size-3.5 text-primary-foreground" />
                </div>
                <span className="text-xs font-bold">Pulse Commerce</span>
              </Link>
              <button
                type="button"
                className="p-1.5 rounded-md hover:bg-accent"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SidebarMenu />
            </div>
            <div className="shrink-0 border-t border-border px-4 py-3" onClick={() => setMobileOpen(false)}>
              <SidebarAccount />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
