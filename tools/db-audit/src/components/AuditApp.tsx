import { useAudit } from '@/context/AuditContext';
import { ConfigModal } from '@/components/ConfigModal';
import { TitleBar } from '@/components/TitleBar';
import { Ribbon } from '@/components/Ribbon';
import { FormulaBar } from '@/components/FormulaBar';
import { MainArea } from '@/components/MainArea';
import { SheetTabs } from '@/components/SheetTabs';
import { SqlModal } from '@/components/SqlModal';
import { SelBar } from '@/components/SelBar';
import { Toast } from '@/components/Toast';

export function AuditApp() {
  const { connected, showConfig } = useAudit();

  return (
    <>
      {showConfig && <ConfigModal />}
      {connected && (
        <div className="app">
          <TitleBar />
          <Ribbon />
          <FormulaBar />
          <MainArea />
          <SheetTabs />
        </div>
      )}
      <SqlModal />
      <SelBar />
      <Toast />
    </>
  );
}
