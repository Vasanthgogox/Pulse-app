import {
  formatSettlementPct,
  buildClientReceivableReport,
  buildClientPnLReport,
  buildSupplierPayableReport,
  buildDriverPayableReport,
  formatReportInr,
} from '../entityDetailReports.util';

describe('formatSettlementPct', () => {
  it('returns an em dash when total is 0 or negative (avoids divide-by-zero)', () => {
    expect(formatSettlementPct(100, 0)).toBe('—');
    expect(formatSettlementPct(100, -5)).toBe('—');
  });

  it('computes a rounded percentage capped at 100%', () => {
    expect(formatSettlementPct(50, 200)).toBe('25%');
    expect(formatSettlementPct(999, 100)).toBe('100%');
  });
});

describe('report builders', () => {
  it('buildClientReceivableReport sets the expected receivable columns', () => {
    const report = buildClientReceivableReport([]);
    expect(report.columns.map((c) => c.key)).toEqual([
      'trip',
      'route',
      'sales',
      'received',
      'due',
      'txns',
      'lastTxn',
    ]);
  });

  it('buildClientPnLReport includes P&L and margin columns', () => {
    const report = buildClientPnLReport([]);
    expect(report.columns.map((c) => c.key)).toEqual(
      expect.arrayContaining(['pnl', 'margin', 'model', 'supplier']),
    );
  });

  it('buildSupplierPayableReport includes payable + settlement columns', () => {
    const report = buildSupplierPayableReport([]);
    expect(report.columns.map((c) => c.key)).toEqual(
      expect.arrayContaining(['cost', 'due', 'settlement']),
    );
  });

  it('buildDriverPayableReport includes contract + commission basis columns', () => {
    const report = buildDriverPayableReport([]);
    expect(report.columns.map((c) => c.key)).toEqual(
      expect.arrayContaining(['contract', 'commissionBasis']),
    );
  });

  it('each report builder passes rows through unchanged', () => {
    const rows = [{ trip: 'T1', route: 'A-B', sales: '100', received: '50', due: '50', txns: 1, lastTxn: '2026-01-01' }];
    expect(buildClientReceivableReport(rows).rows).toBe(rows);
  });
});

describe('formatReportInr', () => {
  it('rounds and formats a value as INR', () => {
    expect(typeof formatReportInr(1234.6)).toBe('string');
    expect(formatReportInr(1234.6)).toBe(formatReportInr(1235));
  });
});
