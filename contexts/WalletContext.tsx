/**
 * Wallet context — balance for header (aligned with Q-unified-base WalletContext).
 * Balance can be wired to API later; currently uses a placeholder for UI.
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface WalletContextType {
  balance: number;
  setBalance: (value: number) => void;
  refreshBalance: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (ctx === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return ctx;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [balance, setBalance] = useState(0);

  const refreshBalance = useCallback(async () => {
    // TODO: fetch from wallet API (same source as Q-unified-base); placeholder for UI
    setBalance((b) => (b === 0 ? 0 : b));
  }, []);

  return (
    <WalletContext.Provider value={{ balance, setBalance, refreshBalance }}>
      {children}
    </WalletContext.Provider>
  );
}
