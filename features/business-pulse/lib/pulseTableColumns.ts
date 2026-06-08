import type { PulseTableColumn } from "@/features/business-pulse/components/PulseRankingTable";

export const PULSE_CLIENT_MINI_COLUMNS: PulseTableColumn[] = [
  { key: "name", label: "Member", flex: 2 },
  { key: "revenue", label: "Revenue", width: 88, align: "right", money: true },
];

export const PULSE_ROUTE_MINI_COLUMNS: PulseTableColumn[] = [
  { key: "name", label: "Lane", flex: 2 },
  { key: "margin", label: "Margin", width: 88, align: "right", money: true },
];

export const PULSE_SUPPLIER_MINI_COLUMNS: PulseTableColumn[] = [
  { key: "name", label: "Member", flex: 2 },
  { key: "settlement", label: "Due", width: 88, align: "right", money: true },
];

export const PULSE_FLEET_VEHICLE_MINI_COLUMNS: PulseTableColumn[] = [
  { key: "name", label: "Vehicle", flex: 2 },
  { key: "pnl", label: "P&L", width: 88, align: "right", money: true },
];

export const PULSE_DRIVER_MINI_COLUMNS: PulseTableColumn[] = [
  { key: "name", label: "Driver", flex: 2 },
  { key: "payable", label: "Payable", width: 88, align: "right", money: true },
];

export const PULSE_COMPLIANCE_MINI_COLUMNS: PulseTableColumn[] = [
  { key: "name", label: "Vehicle", flex: 2 },
  { key: "state", label: "State", width: 88, align: "right" },
];

export const PULSE_CLIENT_COLUMNS: PulseTableColumn[] = [
  { key: "name", label: "Member", flex: 2.2 },
  { key: "revenue", label: "Revenue", width: 96, align: "right", money: true },
  { key: "margin", label: "Margin", width: 96, align: "right", money: true },
];

export const PULSE_ROUTE_COLUMNS: PulseTableColumn[] = [
  { key: "name", label: "Lane", flex: 2.2 },
  { key: "revenue", label: "Revenue", width: 96, align: "right", money: true },
  { key: "margin", label: "Margin", width: 96, align: "right", money: true },
];

export const PULSE_SUPPLIER_COLUMNS: PulseTableColumn[] = [
  { key: "name", label: "Member", flex: 2.2 },
  { key: "reliability", label: "Reliability", width: 72, align: "right" },
  { key: "margin", label: "Margin", width: 96, align: "right", money: true },
  { key: "settlement", label: "Due", width: 96, align: "right", money: true },
];

export const PULSE_COMPLIANCE_COLUMNS: PulseTableColumn[] = [
  { key: "name", label: "Vehicle", flex: 2.2 },
  { key: "state", label: "State", width: 88, align: "right" },
  { key: "docs", label: "Docs", width: 48, align: "right" },
];

export const PULSE_FLEET_VEHICLE_COLUMNS: PulseTableColumn[] = [
  { key: "name", label: "Vehicle", flex: 2.2 },
  { key: "trips", label: "Trips", width: 52, align: "right" },
  { key: "operators", label: "Operators", flex: 1 },
  { key: "expenses", label: "Expenses", width: 96, align: "right", money: true },
  { key: "pnl", label: "P&L", width: 96, align: "right", money: true },
];

export const PULSE_DRIVER_PAYROLL_COLUMNS: PulseTableColumn[] = [
  { key: "name", label: "Driver", flex: 2.2 },
  { key: "trips", label: "Trips", width: 44, align: "right" },
  { key: "vehicles", label: "Vehicles", flex: 1 },
  { key: "commission", label: "Comm", width: 68, align: "right", money: true },
  { key: "salary", label: "Salary", width: 64, align: "right" },
  { key: "payable", label: "Payable", width: 76, align: "right", money: true },
];
