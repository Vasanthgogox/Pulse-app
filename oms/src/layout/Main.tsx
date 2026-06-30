import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { useLayout } from './LayoutContext';
import { Sidebar } from './Sidebar';
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
    <div className={cn(dark ? 'dark' : '', 'min-h-dvh flex flex-col bg-background')}>
      <Toaster position="top-right" richColors closeButton />
      <Sidebar />

      <div className="wrapper flex flex-1 flex-col min-h-0">
        <Header dark={dark} setDark={setDark} onMobileMenuOpen={() => setMobileOpen(true)} />

        <main className="flex-1 min-h-0" role="content">
          <Outlet />
        </main>

        <footer className="shrink-0 border-t border-border bg-background">
          <div className="container-fluid flex h-9 items-center justify-between text-[11px] leading-none text-muted-foreground">
            <span>© 2026 Pulse Platform — Commerce & Execution</span>
            <span>v1.0.0</span>
          </div>
        </footer>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="absolute left-0 top-0 bottom-0 w-64 bg-background border-r border-border flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <Sidebar />
          </div>
        </div>
      )}
    </div>
  );
}
