import { useAudit } from '@/context/AuditContext';
import { FlowSheet } from '@/sheets/FlowSheet';
import { StateSheet } from '@/sheets/StateSheet';
import { CoverageSheet } from '@/sheets/CoverageSheet';
import { SqlSheet } from '@/sheets/SqlSheet';
import { VerifyLogSheet } from '@/sheets/VerifyLogSheet';
import { DetailDrawer } from '@/components/DetailDrawer';
import { SnapPanel } from '@/components/SnapPanel';

export function MainArea() {
  const { sheet, loading } = useAudit();

  return (
    <div className="main-area">
      <div className="gridarea">
        <div className={`loading-bar${loading ? ' active' : ''}`} />
        {sheet === 'flow' && <FlowSheet />}
        {sheet === 'state' && <StateSheet />}
        {sheet === 'coverage' && <CoverageSheet />}
        {sheet === 'sql' && <SqlSheet />}
        {sheet === 'log' && <VerifyLogSheet />}
      </div>
      <DetailDrawer />
      <SnapPanel />
    </div>
  );
}
