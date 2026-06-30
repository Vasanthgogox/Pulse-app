import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

interface LayoutState {
  sidebarCollapse: boolean;
  setSidebarCollapse: (v: boolean) => void;
}

const LayoutContext = createContext<LayoutState | undefined>(undefined);

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [sidebarCollapse, setSidebarCollapse] = useState(false);
  return (
    <LayoutContext.Provider value={{ sidebarCollapse, setSidebarCollapse }}>
      {children}
    </LayoutContext.Provider>
  );
}

export function useLayout() {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useLayout must be used inside LayoutProvider');
  return ctx;
}
