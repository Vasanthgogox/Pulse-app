import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type {
  Organization, AdminContextValue, AccountFilter,
  AuditEntry, AuditEventType, OrgUser, UsageMetric, FeatureFlag,
  BillingTier, BusinessApplication, AppStatus,
} from '@/types/admin';
import { adminApi, ApiNotConfiguredError } from '@/lib/api';

// ─── Data helpers ─────────────────────────────────────────────────────────────

let _eid = 1;
const eid = () => `e${_eid++}`;

function auditEntry(
  ts: string, actor: string, actor_type: 'system' | 'admin' | 'applicant',
  event_type: AuditEventType, title: string, detail?: string,
): AuditEntry {
  return { id: eid(), timestamp: ts, actor, actor_type, event_type, title, detail };
}

const TIER_LIMITS: Record<BillingTier, { api: number; txn: number; gb: number; seats: number }> = {
  Starter:    { api: 1_000,   txn: 500,        gb: 5,   seats: 3  },
  Growth:     { api: 10_000,  txn: 5_000,      gb: 50,  seats: 10 },
  Enterprise: { api: 100_000, txn: 999_999_999, gb: 500, seats: 999 },
};

function mkMetrics(tier: BillingTier, apiPct: number, txnPct: number, storagePct: number): UsageMetric[] {
  const lim = TIER_LIMITS[tier];
  const apiUsed  = Math.round(lim.api  * apiPct     / 100);
  const txnUsed  = tier === 'Enterprise' ? Math.round(50000 * txnPct / 100) : Math.round(lim.txn * txnPct / 100);
  const gbUsed   = parseFloat((lim.gb * storagePct / 100).toFixed(1));

  const variant = (p: number) => p >= 90 ? 'danger' : p >= 70 ? 'warning' : 'default';

  return [
    { id: 'api',     label: 'API Credits',         pct: apiPct,     detail: `${apiUsed.toLocaleString('en-IN')} / ${lim.api.toLocaleString('en-IN')} calls/mo`, variant: variant(apiPct) },
    { id: 'txn',     label: 'Monthly Transactions', pct: txnPct,     detail: tier === 'Enterprise' ? `${txnUsed.toLocaleString('en-IN')} / Unlimited` : `${txnUsed.toLocaleString('en-IN')} / ${lim.txn.toLocaleString('en-IN')}`, variant: variant(txnPct) },
    { id: 'storage', label: 'Document Storage',     pct: storagePct, detail: `${gbUsed} GB / ${lim.gb} GB`, variant: variant(storagePct) },
    { id: 'seats',   label: 'Team Seats',           pct: 0,          detail: `— / ${tier === 'Enterprise' ? 'Unlimited' : lim.seats}`, variant: 'default' },
  ];
}

function mkFlags(overrides: Partial<Record<'beta' | 'bypass' | 'reporting' | 'webhooks' | 'multicurrency', boolean>> = {}): FeatureFlag[] {
  return [
    { id: 'beta',          label: 'Beta Features Enabled',  description: 'Early access to experimental capabilities', enabled: overrides.beta          ?? false },
    { id: 'bypass',        label: 'Bypass Auto-Routing',    description: 'Skip intelligent load-balancing on dispatch', enabled: overrides.bypass        ?? false },
    { id: 'reporting',     label: 'Enhanced Reporting',     description: 'Advanced analytics and custom report builder', enabled: overrides.reporting     ?? false },
    { id: 'webhooks',      label: 'API Webhooks v2',         description: 'Next-gen webhook delivery with retry & replay', enabled: overrides.webhooks      ?? false },
    { id: 'multicurrency', label: 'Multi-Currency Support',  description: 'Accept and settle in INR, USD, and EUR',        enabled: overrides.multicurrency ?? false },
  ];
}

function mkUser(id: string, name: string, email: string, role: OrgUser['role'], status: OrgUser['status'], lastLogin: string | null): OrgUser {
  return { id, name, email, role, status, lastLogin };
}

// ─── Base KYC applications ────────────────────────────────────────────────────

const BASE_APPS: BusinessApplication[] = [
  {
    id: 'APP-0001', company_name: 'Bharat Freight Solutions Pvt Ltd', entity_type: 'Pvt Ltd',
    gstin: '27AABFB4321R1ZM', pan: 'AABFB4321R', cin: 'U63090MH2019PTC321456',
    registration_number: 'MH-321456', registration_date: '2019-03-15',
    directors: [
      { name: 'Ramesh Kumar Bajaj', din: '06234891', designation: 'Managing Director' },
      { name: 'Priya Bajaj', din: '07812345', designation: 'Director' },
    ],
    registered_address: '401, Nirmal Corporate Centre, LBS Marg', pincode: '400080', city: 'Mumbai', state: 'Maharashtra',
    contact_name: 'Ramesh Kumar Bajaj', contact_email: 'ramesh@bharatfreight.in', contact_phone: '+91 98201 45678',
    submission_date: '2026-06-27T09:14:00Z', status: 'Pending', risk_score: 'Low', risk_factors: [], assigned_to: 'Anita Sharma',
    automated_checks: [
      { id: 'c1', label: 'PAN API Match', status: 'Passed', detail: 'Name matches MCA records', checked_at: '2026-06-27T09:16:00Z' },
      { id: 'c2', label: 'GST Status', status: 'Passed', detail: 'Active — registered 2019', checked_at: '2026-06-27T09:16:00Z' },
      { id: 'c3', label: 'MCA Director Check', status: 'Passed', detail: '2 of 2 directors verified', checked_at: '2026-06-27T09:16:00Z' },
      { id: 'c4', label: 'CIBIL Score', status: 'Passed', detail: 'Score: 762', checked_at: '2026-06-27T09:17:00Z' },
    ],
    documents: [
      { id: 'd1', type: 'COI', file_name: 'BFS_COI.pdf', status: 'Valid', uploaded_at: '2026-06-27T09:14:00Z', url: '', mime_type: 'application/pdf', size_kb: 420, page_count: 2 },
      { id: 'd2', type: 'PAN Card', file_name: 'BFS_PAN.pdf', status: 'Valid', uploaded_at: '2026-06-27T09:14:00Z', url: '', mime_type: 'application/pdf', size_kb: 190, page_count: 1 },
      { id: 'd3', type: 'GST Certificate', file_name: 'BFS_GST.pdf', status: 'Valid', uploaded_at: '2026-06-27T09:14:00Z', url: '', mime_type: 'application/pdf', size_kb: 310, page_count: 1 },
      { id: 'd4', type: 'Board Resolution', file_name: 'BFS_BR.pdf', status: 'Valid', uploaded_at: '2026-06-27T09:14:00Z', url: '', mime_type: 'application/pdf', size_kb: 280, page_count: 3 },
    ],
    audit_trail: [
      auditEntry('2026-06-27T09:14:00Z', 'Applicant Portal', 'applicant', 'submitted', 'Application submitted'),
      auditEntry('2026-06-27T09:16:45Z', 'System', 'system', 'pre_check_passed', 'All automated checks passed', '4/4 checks completed'),
      auditEntry('2026-06-27T09:30:00Z', 'System', 'system', 'assigned', 'Assigned to Anita Sharma'),
    ],
  },
  {
    id: 'APP-0002', company_name: 'Skyway Logistics LLP', entity_type: 'LLP',
    gstin: '06ABCSL7812K1ZN', pan: 'ABCSL7812K', registration_number: 'AAC-1234', registration_date: '2021-07-01',
    directors: [
      { name: 'Suresh Pillai', din: '08123456', designation: 'Designated Partner' },
      { name: 'Meenakshi Nair', din: '09234567', designation: 'Designated Partner' },
    ],
    registered_address: 'Plot 14, Udyog Vihar Phase IV', pincode: '122015', city: 'Gurugram', state: 'Haryana',
    contact_name: 'Suresh Pillai', contact_email: 'suresh@skywayllp.com', contact_phone: '+91 99999 12345',
    submission_date: '2026-06-26T14:30:00Z', status: 'Pending', risk_score: 'Medium',
    risk_factors: ['Address mismatch — GST vs COI', 'Newly registered LLP < 1 year'], assigned_to: 'Vikram Patel',
    automated_checks: [
      { id: 'c1', label: 'PAN API Match', status: 'Passed', checked_at: '2026-06-26T14:32:00Z' },
      { id: 'c2', label: 'GST Status', status: 'Passed', detail: 'Active', checked_at: '2026-06-26T14:32:00Z' },
      { id: 'c3', label: 'MCA Director Check', status: 'Manual Review', detail: 'Address discrepancy flagged', checked_at: '2026-06-26T14:33:00Z' },
      { id: 'c4', label: 'CIBIL Score', status: 'Pending' },
    ],
    documents: [
      { id: 'd1', type: 'COI', file_name: 'Skyway_COI.pdf', status: 'Valid', uploaded_at: '2026-06-26T14:30:00Z', url: '', mime_type: 'application/pdf', size_kb: 390, page_count: 2 },
      { id: 'd2', type: 'PAN Card', file_name: 'Skyway_PAN.jpg', status: 'Valid', uploaded_at: '2026-06-26T14:30:00Z', url: '', mime_type: 'image/jpeg', size_kb: 210 },
      { id: 'd3', type: 'GST Certificate', file_name: 'Skyway_GST.pdf', status: 'Flagged', flag_reason: 'Registered address differs from COI', uploaded_at: '2026-06-26T14:30:00Z', url: '', mime_type: 'application/pdf', size_kb: 290, page_count: 1 },
    ],
    audit_trail: [
      auditEntry('2026-06-26T14:30:00Z', 'Applicant Portal', 'applicant', 'submitted', 'Application submitted'),
      auditEntry('2026-06-26T14:33:30Z', 'System', 'system', 'pre_check_failed', 'Partial check failure', 'MCA Director Check flagged address discrepancy'),
      auditEntry('2026-06-26T14:40:00Z', 'System', 'system', 'document_flagged', 'GST Certificate flagged', 'Address differs from COI'),
      auditEntry('2026-06-26T15:00:00Z', 'System', 'system', 'assigned', 'Assigned to Vikram Patel'),
    ],
  },
  {
    id: 'APP-0003', company_name: 'Indus Trade Connect Pvt Ltd', entity_type: 'Pvt Ltd',
    gstin: '07AAACI9012D1ZC', pan: 'AAACI9012D', cin: 'U51909DL2020PTC367812',
    registration_number: 'DL-367812', registration_date: '2020-11-20',
    directors: [
      { name: 'Ashok Chandra Gupta', din: '01923456', designation: 'Managing Director' },
      { name: 'Nisha Verma', din: '02834567', designation: 'Director' },
      { name: 'Rakesh Singh', din: '03745678', designation: 'Director' },
    ],
    registered_address: '304, Antriksh Bhawan, 22 Kasturba Gandhi Marg', pincode: '110001', city: 'New Delhi', state: 'Delhi',
    contact_name: 'Ashok Chandra Gupta', contact_email: 'ashok@industrade.co.in', contact_phone: '+91 98112 67890',
    submission_date: '2026-06-24T11:00:00Z', status: 'Under Review', risk_score: 'High',
    risk_factors: ['Director DIN mismatch for one director', 'Blurry COI scan', 'High-value transaction threshold'], assigned_to: 'Priya Mehta',
    automated_checks: [
      { id: 'c1', label: 'PAN API Match', status: 'Passed', checked_at: '2026-06-24T11:02:00Z' },
      { id: 'c2', label: 'GST Status', status: 'Passed', checked_at: '2026-06-24T11:02:00Z' },
      { id: 'c3', label: 'MCA Director Check', status: 'Failed', detail: 'DIN 03745678 not linked to company in MCA', checked_at: '2026-06-24T11:03:00Z' },
      { id: 'c4', label: 'CIBIL Score', status: 'Manual Review', detail: 'Score: 648 — below threshold', checked_at: '2026-06-24T11:04:00Z' },
    ],
    documents: [
      { id: 'd1', type: 'COI', file_name: 'ITC_COI.pdf', status: 'Unreadable', flag_reason: 'Page 2 is blurry', uploaded_at: '2026-06-24T11:00:00Z', url: '', mime_type: 'application/pdf', size_kb: 180, page_count: 2 },
      { id: 'd2', type: 'PAN Card', file_name: 'ITC_PAN.pdf', status: 'Valid', uploaded_at: '2026-06-24T11:00:00Z', url: '', mime_type: 'application/pdf', size_kb: 200, page_count: 1 },
      { id: 'd3', type: 'Board Resolution', file_name: 'ITC_BR.pdf', status: 'Flagged', flag_reason: 'Missing signature of Director Rakesh Singh', uploaded_at: '2026-06-24T11:00:00Z', url: '', mime_type: 'application/pdf', size_kb: 340, page_count: 4 },
    ],
    audit_trail: [
      auditEntry('2026-06-24T11:00:00Z', 'Applicant Portal', 'applicant', 'submitted', 'Application submitted'),
      auditEntry('2026-06-24T11:04:00Z', 'System', 'system', 'pre_check_failed', '2 checks failed', 'MCA Director mismatch + CIBIL below threshold'),
      auditEntry('2026-06-24T11:20:00Z', 'System', 'system', 'assigned', 'Assigned to Priya Mehta'),
      auditEntry('2026-06-24T14:30:00Z', 'Priya Mehta', 'admin', 'comment', 'Reviewer note', 'Requested fresh COI and countersigned Board Resolution'),
    ],
  },
  {
    id: 'APP-0004', company_name: 'Kalpana Roadways Proprietorship', trade_name: 'Kalpana Transport', entity_type: 'Proprietorship',
    gstin: '29BFKPK7234M1ZR', pan: 'BFKPK7234M', registration_number: 'KA-PROP-7234', registration_date: '2017-04-01',
    directors: [{ name: 'Kalpana Krishnamurthy', din: '00000000', designation: 'Proprietor' }],
    registered_address: 'No 45, 2nd Cross, Rajajinagar Industrial Area', pincode: '560010', city: 'Bengaluru', state: 'Karnataka',
    contact_name: 'Kalpana Krishnamurthy', contact_email: 'kalpana@kalpanaroads.com', contact_phone: '+91 93412 88901',
    submission_date: '2026-06-28T08:45:00Z', status: 'Pending', risk_score: 'Low', risk_factors: [], assigned_to: 'Anita Sharma',
    automated_checks: [
      { id: 'c1', label: 'PAN API Match', status: 'Passed', checked_at: '2026-06-28T08:47:00Z' },
      { id: 'c2', label: 'GST Status', status: 'Passed', detail: 'Active since 2017', checked_at: '2026-06-28T08:47:00Z' },
      { id: 'c3', label: 'MCA Director Check', status: 'N/A', detail: 'Not applicable for Proprietorship', checked_at: '2026-06-28T08:47:00Z' },
      { id: 'c4', label: 'CIBIL Score', status: 'Passed', detail: 'Score: 798', checked_at: '2026-06-28T08:48:00Z' },
    ],
    documents: [
      { id: 'd1', type: 'PAN Card', file_name: 'KR_PAN.jpg', status: 'Valid', uploaded_at: '2026-06-28T08:45:00Z', url: '', mime_type: 'image/jpeg', size_kb: 230 },
      { id: 'd2', type: 'GST Certificate', file_name: 'KR_GST.pdf', status: 'Valid', uploaded_at: '2026-06-28T08:45:00Z', url: '', mime_type: 'application/pdf', size_kb: 280, page_count: 1 },
    ],
    audit_trail: [
      auditEntry('2026-06-28T08:45:00Z', 'Applicant Portal', 'applicant', 'submitted', 'Application submitted'),
      auditEntry('2026-06-28T08:48:30Z', 'System', 'system', 'pre_check_passed', 'All applicable checks passed'),
      auditEntry('2026-06-28T09:00:00Z', 'System', 'system', 'assigned', 'Assigned to Anita Sharma'),
    ],
  },
  {
    id: 'APP-0005', company_name: 'Global Cargo Express Pvt Ltd', entity_type: 'Pvt Ltd',
    gstin: '19AADCG5678F1ZP', pan: 'AADCG5678F', cin: 'U60232WB2016PTC214567',
    registration_number: 'WB-214567', registration_date: '2016-08-12',
    directors: [
      { name: 'Dipankar Ghosh', din: '04456789', designation: 'Managing Director' },
      { name: 'Samira Biswas', din: '05567890', designation: 'Director' },
    ],
    registered_address: '12A, Park Street, 3rd Floor', pincode: '700016', city: 'Kolkata', state: 'West Bengal',
    contact_name: 'Dipankar Ghosh', contact_email: 'dipankar@globalcargoexp.com', contact_phone: '+91 97321 45678',
    submission_date: '2026-06-20T10:30:00Z', status: 'Escalated', risk_score: 'High',
    risk_factors: ['Forged document suspected — COI serial watermark mismatch', 'Director linked to 3 previously rejected entities'],
    assigned_to: 'Vikram Patel',
    escalation_reason: 'Possible document forgery — COI watermark inconsistent with MCA records.',
    automated_checks: [
      { id: 'c1', label: 'PAN API Match', status: 'Passed', checked_at: '2026-06-20T10:33:00Z' },
      { id: 'c2', label: 'GST Status', status: 'Passed', checked_at: '2026-06-20T10:33:00Z' },
      { id: 'c3', label: 'MCA Director Check', status: 'Manual Review', detail: 'Director linked to 3 prior rejected apps', checked_at: '2026-06-20T10:34:00Z' },
      { id: 'c4', label: 'CIBIL Score', status: 'Failed', detail: 'Score: 512', checked_at: '2026-06-20T10:35:00Z' },
    ],
    documents: [
      { id: 'd1', type: 'COI', file_name: 'GCE_COI.pdf', status: 'Flagged', flag_reason: 'Watermark serial does not match MCA digital record', uploaded_at: '2026-06-20T10:30:00Z', url: '', mime_type: 'application/pdf', size_kb: 390, page_count: 2 },
      { id: 'd2', type: 'PAN Card', file_name: 'GCE_PAN.pdf', status: 'Valid', uploaded_at: '2026-06-20T10:30:00Z', url: '', mime_type: 'application/pdf', size_kb: 210, page_count: 1 },
    ],
    audit_trail: [
      auditEntry('2026-06-20T10:30:00Z', 'Applicant Portal', 'applicant', 'submitted', 'Application submitted'),
      auditEntry('2026-06-20T10:35:00Z', 'System', 'system', 'pre_check_failed', '2 checks flagged'),
      auditEntry('2026-06-20T11:00:00Z', 'System', 'system', 'assigned', 'Assigned to Vikram Patel'),
      auditEntry('2026-06-21T09:15:00Z', 'Vikram Patel', 'admin', 'escalated', 'Escalated to legal review', 'Possible document forgery — COI watermark inconsistent with MCA records'),
    ],
  },
  {
    id: 'APP-0006', company_name: 'Pinnacle Supply Chain Solutions Pvt Ltd', entity_type: 'Pvt Ltd',
    gstin: '33AADCP3456R1ZQ', pan: 'AADCP3456R', cin: 'U63090TN2015PTC123780',
    registration_number: 'TN-123780', registration_date: '2015-02-18',
    directors: [
      { name: 'Arvind Subramaniam', din: '07890123', designation: 'Managing Director' },
      { name: 'Lalitha Subramaniam', din: '08901234', designation: 'Director' },
    ],
    registered_address: '23, NSK Salai, Arumbakkam', pincode: '600106', city: 'Chennai', state: 'Tamil Nadu',
    contact_name: 'Arvind Subramaniam', contact_email: 'arvind@pinnaclechain.in', contact_phone: '+91 94441 23456',
    submission_date: '2026-06-15T09:00:00Z', status: 'Approved', risk_score: 'Low', risk_factors: [], assigned_to: 'Anita Sharma',
    automated_checks: [
      { id: 'c1', label: 'PAN API Match', status: 'Passed', checked_at: '2026-06-15T09:03:00Z' },
      { id: 'c2', label: 'GST Status', status: 'Passed', detail: 'Active — 11 years', checked_at: '2026-06-15T09:03:00Z' },
      { id: 'c3', label: 'MCA Director Check', status: 'Passed', detail: '2/2 directors verified', checked_at: '2026-06-15T09:04:00Z' },
      { id: 'c4', label: 'CIBIL Score', status: 'Passed', detail: 'Score: 831', checked_at: '2026-06-15T09:04:00Z' },
    ],
    documents: [
      { id: 'd1', type: 'COI', file_name: 'PSCS_COI.pdf', status: 'Valid', uploaded_at: '2026-06-15T09:00:00Z', url: '', mime_type: 'application/pdf', size_kb: 450, page_count: 2 },
      { id: 'd2', type: 'PAN Card', file_name: 'PSCS_PAN.pdf', status: 'Valid', uploaded_at: '2026-06-15T09:00:00Z', url: '', mime_type: 'application/pdf', size_kb: 200, page_count: 1 },
      { id: 'd3', type: 'Board Resolution', file_name: 'PSCS_BR.pdf', status: 'Valid', uploaded_at: '2026-06-15T09:00:00Z', url: '', mime_type: 'application/pdf', size_kb: 310, page_count: 3 },
    ],
    audit_trail: [
      auditEntry('2026-06-15T09:00:00Z', 'Applicant Portal', 'applicant', 'submitted', 'Application submitted'),
      auditEntry('2026-06-15T09:04:00Z', 'System', 'system', 'pre_check_passed', 'All checks passed'),
      auditEntry('2026-06-16T10:30:00Z', 'Anita Sharma', 'admin', 'approved', 'Application approved', 'Clean documentation, strong credit history'),
    ],
  },
  {
    id: 'APP-0007', company_name: 'Fast Move Logistics LLP', entity_type: 'LLP',
    gstin: '08AABFL9001H1ZV', pan: 'AABFL9001H', registration_number: 'AAD-5678', registration_date: '2023-09-01',
    directors: [
      { name: 'Harish Choudhary', din: '09012345', designation: 'Designated Partner' },
      { name: 'Pooja Rawat', din: '10123456', designation: 'Designated Partner' },
    ],
    registered_address: '56, Vikas Marg, Laxmi Nagar', pincode: '110092', city: 'New Delhi', state: 'Delhi',
    contact_name: 'Harish Choudhary', contact_email: 'harish@fastmovellp.in', contact_phone: '+91 88001 23456',
    submission_date: '2026-06-18T16:00:00Z', status: 'Rejected', risk_score: 'High',
    risk_factors: ['GSTIN inactive', 'Name mismatch on PAN'], assigned_to: 'Vikram Patel',
    rejection_reason: 'GSTIN inactive or cancelled',
    rejection_notes: 'GST registration was cancelled effective 2025-12-01. PAN name mismatch.',
    automated_checks: [
      { id: 'c1', label: 'PAN API Match', status: 'Failed', detail: 'Name mismatch: PAN vs LLP deed', checked_at: '2026-06-18T16:03:00Z' },
      { id: 'c2', label: 'GST Status', status: 'Failed', detail: 'GSTIN cancelled 2025-12-01', checked_at: '2026-06-18T16:03:00Z' },
      { id: 'c3', label: 'MCA Director Check', status: 'Passed', checked_at: '2026-06-18T16:04:00Z' },
      { id: 'c4', label: 'CIBIL Score', status: 'Pending' },
    ],
    documents: [
      { id: 'd1', type: 'COI', file_name: 'FML_COI.pdf', status: 'Valid', uploaded_at: '2026-06-18T16:00:00Z', url: '', mime_type: 'application/pdf', size_kb: 380, page_count: 2 },
      { id: 'd2', type: 'PAN Card', file_name: 'FML_PAN.jpg', status: 'Flagged', flag_reason: 'Name on PAN does not match LLP deed', uploaded_at: '2026-06-18T16:00:00Z', url: '', mime_type: 'image/jpeg', size_kb: 195 },
      { id: 'd3', type: 'GST Certificate', file_name: 'FML_GST.pdf', status: 'Expired', flag_reason: 'GST registration cancelled', uploaded_at: '2026-06-18T16:00:00Z', url: '', mime_type: 'application/pdf', size_kb: 250, page_count: 1 },
    ],
    audit_trail: [
      auditEntry('2026-06-18T16:00:00Z', 'Applicant Portal', 'applicant', 'submitted', 'Application submitted'),
      auditEntry('2026-06-18T16:03:00Z', 'System', 'system', 'pre_check_failed', '2 critical checks failed'),
      auditEntry('2026-06-19T09:00:00Z', 'Vikram Patel', 'admin', 'rejected', 'Application rejected', 'GSTIN cancelled and PAN name mismatch'),
    ],
  },
  {
    id: 'APP-0008', company_name: 'Deccan Haulage Pvt Ltd', entity_type: 'Pvt Ltd',
    gstin: '36AABCD4567P1ZU', pan: 'AABCD4567P', cin: 'U60210TG2020PTC145123',
    registration_number: 'TG-145123', registration_date: '2020-05-15',
    directors: [
      { name: 'Venkat Rao Reddy', din: '11234567', designation: 'Managing Director' },
      { name: 'Kavitha Rao', din: '12345678', designation: 'Director' },
    ],
    registered_address: '14-2-109, Begum Bazaar', pincode: '500012', city: 'Hyderabad', state: 'Telangana',
    contact_name: 'Venkat Rao Reddy', contact_email: 'venkat@deccanhaulage.com', contact_phone: '+91 91234 56789',
    submission_date: '2026-06-25T11:30:00Z', status: 'Pending', risk_score: 'Medium',
    risk_factors: ['Board Resolution dated > 90 days'], assigned_to: 'Priya Mehta',
    automated_checks: [
      { id: 'c1', label: 'PAN API Match', status: 'Passed', checked_at: '2026-06-25T11:32:00Z' },
      { id: 'c2', label: 'GST Status', status: 'Passed', checked_at: '2026-06-25T11:32:00Z' },
      { id: 'c3', label: 'MCA Director Check', status: 'Passed', detail: '2/2 verified', checked_at: '2026-06-25T11:33:00Z' },
      { id: 'c4', label: 'CIBIL Score', status: 'Passed', detail: 'Score: 714', checked_at: '2026-06-25T11:33:00Z' },
    ],
    documents: [
      { id: 'd1', type: 'COI', file_name: 'DH_COI.pdf', status: 'Valid', uploaded_at: '2026-06-25T11:30:00Z', url: '', mime_type: 'application/pdf', size_kb: 420, page_count: 2 },
      { id: 'd2', type: 'Board Resolution', file_name: 'DH_BR.pdf', status: 'Flagged', flag_reason: 'Dated 2026-03-01 — older than 90 days', uploaded_at: '2026-06-25T11:30:00Z', url: '', mime_type: 'application/pdf', size_kb: 330, page_count: 3 },
    ],
    audit_trail: [
      auditEntry('2026-06-25T11:30:00Z', 'Applicant Portal', 'applicant', 'submitted', 'Application submitted'),
      auditEntry('2026-06-25T11:34:00Z', 'System', 'system', 'document_flagged', 'Board Resolution flagged', 'Dated > 90 days'),
      auditEntry('2026-06-25T11:45:00Z', 'System', 'system', 'assigned', 'Assigned to Priya Mehta'),
    ],
  },
  {
    id: 'APP-0009', company_name: 'Rajputana Transport Partnership', entity_type: 'Partnership',
    gstin: '08AAAPR4321Q1ZK', pan: 'AAAPR4321Q', registration_number: 'RJ-PART-4321', registration_date: '2014-10-01',
    directors: [
      { name: 'Mahendra Singh Rathore', din: '00000001', designation: 'Partner' },
      { name: 'Govind Lal Sharma', din: '00000002', designation: 'Partner' },
    ],
    registered_address: 'Plot 7, Industrial Area, Sitapura', pincode: '302022', city: 'Jaipur', state: 'Rajasthan',
    contact_name: 'Mahendra Singh Rathore', contact_email: 'mahendra@rajputanatransport.com', contact_phone: '+91 94143 12345',
    submission_date: '2026-06-28T10:00:00Z', status: 'Pending', risk_score: 'Low', risk_factors: [], assigned_to: 'Anita Sharma',
    automated_checks: [
      { id: 'c1', label: 'PAN API Match', status: 'Passed', checked_at: '2026-06-28T10:02:00Z' },
      { id: 'c2', label: 'GST Status', status: 'Passed', detail: 'Active since 2014', checked_at: '2026-06-28T10:02:00Z' },
      { id: 'c3', label: 'MCA Director Check', status: 'N/A', detail: 'Partnership — not applicable', checked_at: '2026-06-28T10:02:00Z' },
      { id: 'c4', label: 'CIBIL Score', status: 'Passed', detail: 'Score: 745', checked_at: '2026-06-28T10:03:00Z' },
    ],
    documents: [
      { id: 'd1', type: 'PAN Card', file_name: 'RT_PAN.pdf', status: 'Valid', uploaded_at: '2026-06-28T10:00:00Z', url: '', mime_type: 'application/pdf', size_kb: 200, page_count: 1 },
      { id: 'd2', type: 'GST Certificate', file_name: 'RT_GST.pdf', status: 'Valid', uploaded_at: '2026-06-28T10:00:00Z', url: '', mime_type: 'application/pdf', size_kb: 270, page_count: 1 },
    ],
    audit_trail: [
      auditEntry('2026-06-28T10:00:00Z', 'Applicant Portal', 'applicant', 'submitted', 'Application submitted'),
      auditEntry('2026-06-28T10:03:00Z', 'System', 'system', 'pre_check_passed', 'All applicable checks passed'),
      auditEntry('2026-06-28T10:15:00Z', 'System', 'system', 'assigned', 'Assigned to Anita Sharma'),
    ],
  },
  {
    id: 'APP-0010', company_name: 'Narmada Cold Chain Pvt Ltd', entity_type: 'Pvt Ltd',
    gstin: '23AAACN6789S1ZH', pan: 'AAACN6789S', cin: 'U63090MP2022PTC567123',
    registration_number: 'MP-567123', registration_date: '2022-01-10',
    directors: [
      { name: 'Sunil Dewangan', din: '13456789', designation: 'Managing Director' },
      { name: 'Anjali Dewangan', din: '14567890', designation: 'Director' },
    ],
    registered_address: 'Ward 12, Bhopal Industrial Estate', pincode: '462023', city: 'Bhopal', state: 'Madhya Pradesh',
    contact_name: 'Sunil Dewangan', contact_email: 'sunil@narmadacoldchain.in', contact_phone: '+91 98930 67890',
    submission_date: '2026-06-26T09:00:00Z', status: 'Pending', risk_score: 'Medium',
    risk_factors: ['Newly registered — < 2 years', 'Address Proof missing'], assigned_to: 'Priya Mehta',
    automated_checks: [
      { id: 'c1', label: 'PAN API Match', status: 'Passed', checked_at: '2026-06-26T09:02:00Z' },
      { id: 'c2', label: 'GST Status', status: 'Passed', checked_at: '2026-06-26T09:02:00Z' },
      { id: 'c3', label: 'MCA Director Check', status: 'Passed', checked_at: '2026-06-26T09:03:00Z' },
      { id: 'c4', label: 'CIBIL Score', status: 'Manual Review', detail: 'Score: 668', checked_at: '2026-06-26T09:04:00Z' },
    ],
    documents: [
      { id: 'd1', type: 'COI', file_name: 'NCC_COI.pdf', status: 'Valid', uploaded_at: '2026-06-26T09:00:00Z', url: '', mime_type: 'application/pdf', size_kb: 400, page_count: 2 },
      { id: 'd2', type: 'GST Certificate', file_name: 'NCC_GST.pdf', status: 'Valid', uploaded_at: '2026-06-26T09:00:00Z', url: '', mime_type: 'application/pdf', size_kb: 260, page_count: 1 },
      { id: 'd3', type: 'Address Proof', file_name: '', status: 'Missing', uploaded_at: '', url: '', mime_type: 'application/pdf', size_kb: 0 },
    ],
    audit_trail: [
      auditEntry('2026-06-26T09:00:00Z', 'Applicant Portal', 'applicant', 'submitted', 'Application submitted'),
      auditEntry('2026-06-26T09:05:00Z', 'System', 'system', 'document_flagged', 'Address Proof missing'),
      auditEntry('2026-06-26T09:15:00Z', 'System', 'system', 'assigned', 'Assigned to Priya Mehta'),
    ],
  },
  {
    id: 'APP-0011', company_name: 'Mahanadi Agri Transport LLP', entity_type: 'LLP',
    gstin: '21AAACM2345V1ZA', pan: 'AAACM2345V', registration_number: 'AAB-2345', registration_date: '2018-06-15',
    directors: [
      { name: 'Bijay Kumar Sahoo', din: '15678901', designation: 'Designated Partner' },
      { name: 'Pratima Mishra', din: '16789012', designation: 'Designated Partner' },
    ],
    registered_address: 'Plot C-14, Mancheswar Industrial Estate', pincode: '751017', city: 'Bhubaneswar', state: 'Odisha',
    contact_name: 'Bijay Kumar Sahoo', contact_email: 'bijay@mahanadillp.com', contact_phone: '+91 96584 34567',
    submission_date: '2026-06-27T13:00:00Z', status: 'Pending', risk_score: 'Low', risk_factors: [], assigned_to: 'Anita Sharma',
    automated_checks: [
      { id: 'c1', label: 'PAN API Match', status: 'Passed', checked_at: '2026-06-27T13:02:00Z' },
      { id: 'c2', label: 'GST Status', status: 'Passed', checked_at: '2026-06-27T13:02:00Z' },
      { id: 'c3', label: 'MCA Director Check', status: 'Passed', detail: '2/2 partners verified', checked_at: '2026-06-27T13:03:00Z' },
      { id: 'c4', label: 'CIBIL Score', status: 'Passed', detail: 'Score: 776', checked_at: '2026-06-27T13:03:00Z' },
    ],
    documents: [
      { id: 'd1', type: 'COI', file_name: 'MAT_COI.pdf', status: 'Valid', uploaded_at: '2026-06-27T13:00:00Z', url: '', mime_type: 'application/pdf', size_kb: 410, page_count: 2 },
      { id: 'd2', type: 'GST Certificate', file_name: 'MAT_GST.pdf', status: 'Valid', uploaded_at: '2026-06-27T13:00:00Z', url: '', mime_type: 'application/pdf', size_kb: 280, page_count: 1 },
    ],
    audit_trail: [
      auditEntry('2026-06-27T13:00:00Z', 'Applicant Portal', 'applicant', 'submitted', 'Application submitted'),
      auditEntry('2026-06-27T13:03:00Z', 'System', 'system', 'pre_check_passed', 'All checks passed'),
      auditEntry('2026-06-27T13:15:00Z', 'System', 'system', 'assigned', 'Assigned to Anita Sharma'),
    ],
  },
  {
    id: 'APP-0012', company_name: 'Coromandel Fleet Services Pvt Ltd', entity_type: 'Pvt Ltd',
    gstin: '33AACCF8901W1ZB', pan: 'AACCF8901W', cin: 'U45201TN2013PTC098234',
    registration_number: 'TN-098234', registration_date: '2013-07-22',
    directors: [
      { name: 'Muthukrishnan Arumugam', din: '17890123', designation: 'Managing Director' },
      { name: 'Jayalakshmi Muthukrishnan', din: '18901234', designation: 'Director' },
    ],
    registered_address: '7, Whites Road, Royapettah', pincode: '600014', city: 'Chennai', state: 'Tamil Nadu',
    contact_name: 'Muthukrishnan Arumugam', contact_email: 'muthukrishnan@coromandel.in', contact_phone: '+91 98400 56789',
    submission_date: '2026-06-12T08:30:00Z', status: 'Approved', risk_score: 'Low', risk_factors: [], assigned_to: 'Priya Mehta',
    automated_checks: [
      { id: 'c1', label: 'PAN API Match', status: 'Passed', checked_at: '2026-06-12T08:33:00Z' },
      { id: 'c2', label: 'GST Status', status: 'Passed', detail: 'Active — 13 years', checked_at: '2026-06-12T08:33:00Z' },
      { id: 'c3', label: 'MCA Director Check', status: 'Passed', checked_at: '2026-06-12T08:34:00Z' },
      { id: 'c4', label: 'CIBIL Score', status: 'Passed', detail: 'Score: 856', checked_at: '2026-06-12T08:34:00Z' },
    ],
    documents: [
      { id: 'd1', type: 'COI', file_name: 'CFS_COI.pdf', status: 'Valid', uploaded_at: '2026-06-12T08:30:00Z', url: '', mime_type: 'application/pdf', size_kb: 440, page_count: 2 },
      { id: 'd2', type: 'Board Resolution', file_name: 'CFS_BR.pdf', status: 'Valid', uploaded_at: '2026-06-12T08:30:00Z', url: '', mime_type: 'application/pdf', size_kb: 320, page_count: 3 },
      { id: 'd3', type: 'GST Certificate', file_name: 'CFS_GST.pdf', status: 'Valid', uploaded_at: '2026-06-12T08:30:00Z', url: '', mime_type: 'application/pdf', size_kb: 275, page_count: 1 },
    ],
    audit_trail: [
      auditEntry('2026-06-12T08:30:00Z', 'Applicant Portal', 'applicant', 'submitted', 'Application submitted'),
      auditEntry('2026-06-12T08:34:00Z', 'System', 'system', 'pre_check_passed', 'All checks passed'),
      auditEntry('2026-06-12T14:00:00Z', 'Priya Mehta', 'admin', 'approved', 'Application approved', 'Longstanding entity, excellent credit, clean documents'),
    ],
  },
  {
    id: 'APP-0013', company_name: 'Zephyr Carriers Pvt Ltd', entity_type: 'Pvt Ltd',
    gstin: '09AAACZ1234K1ZD', pan: 'AAACZ1234K', cin: 'U60210UP2024PTC789456',
    registration_number: 'UP-789456', registration_date: '2024-01-15',
    directors: [{ name: 'Ajay Verma', din: '19012345', designation: 'Managing Director' }],
    registered_address: 'A-23, Sector 58, NOIDA', pincode: '201301', city: 'Noida', state: 'Uttar Pradesh',
    contact_name: 'Ajay Verma', contact_email: 'ajay@zephyrcarriers.in', contact_phone: '+91 88123 45678',
    submission_date: '2026-06-22T15:00:00Z', status: 'Rejected', risk_score: 'High',
    risk_factors: ['COI expired — entity struck off', 'Less than 6 months old'], assigned_to: 'Vikram Patel',
    rejection_reason: 'Expired Certificate of Incorporation',
    rejection_notes: 'MCA records show entity was struck off in May 2026 for non-filing of annual returns.',
    automated_checks: [
      { id: 'c1', label: 'PAN API Match', status: 'Passed', checked_at: '2026-06-22T15:02:00Z' },
      { id: 'c2', label: 'GST Status', status: 'Failed', detail: 'GST suspended — linked to struck-off entity', checked_at: '2026-06-22T15:02:00Z' },
      { id: 'c3', label: 'MCA Director Check', status: 'Failed', detail: 'Company struck off — May 2026', checked_at: '2026-06-22T15:03:00Z' },
      { id: 'c4', label: 'CIBIL Score', status: 'N/A', detail: 'Not applicable — entity invalid' },
    ],
    documents: [
      { id: 'd1', type: 'COI', file_name: 'ZC_COI.pdf', status: 'Expired', flag_reason: 'Entity struck off by MCA May 2026', uploaded_at: '2026-06-22T15:00:00Z', url: '', mime_type: 'application/pdf', size_kb: 360, page_count: 2 },
      { id: 'd2', type: 'PAN Card', file_name: 'ZC_PAN.pdf', status: 'Valid', uploaded_at: '2026-06-22T15:00:00Z', url: '', mime_type: 'application/pdf', size_kb: 195, page_count: 1 },
    ],
    audit_trail: [
      auditEntry('2026-06-22T15:00:00Z', 'Applicant Portal', 'applicant', 'submitted', 'Application submitted'),
      auditEntry('2026-06-22T15:03:00Z', 'System', 'system', 'pre_check_failed', '2 critical checks failed'),
      auditEntry('2026-06-22T16:45:00Z', 'Vikram Patel', 'admin', 'rejected', 'Application rejected', 'Entity struck off by MCA'),
    ],
  },
  {
    id: 'APP-0014', company_name: 'Himalayan Cargo Movers LLP', entity_type: 'LLP',
    gstin: '05AAAHC3456L1ZF', pan: 'AAAHC3456L', registration_number: 'AAE-3456', registration_date: '2019-12-01',
    directors: [
      { name: 'Ravi Shankar Negi', din: '20123456', designation: 'Designated Partner' },
      { name: 'Sunita Negi', din: '21234567', designation: 'Designated Partner' },
    ],
    registered_address: '3, Rajpur Road, Dehradun', pincode: '248001', city: 'Dehradun', state: 'Uttarakhand',
    contact_name: 'Ravi Shankar Negi', contact_email: 'ravi@himalayanllp.com', contact_phone: '+91 93590 78901',
    submission_date: '2026-06-23T10:00:00Z', status: 'Under Review', risk_score: 'Medium',
    risk_factors: ['Board Resolution missing authorised signatory', 'Unreadable MOA/AOA'], assigned_to: 'Anita Sharma',
    automated_checks: [
      { id: 'c1', label: 'PAN API Match', status: 'Passed', checked_at: '2026-06-23T10:02:00Z' },
      { id: 'c2', label: 'GST Status', status: 'Passed', checked_at: '2026-06-23T10:02:00Z' },
      { id: 'c3', label: 'MCA Director Check', status: 'Passed', checked_at: '2026-06-23T10:03:00Z' },
      { id: 'c4', label: 'CIBIL Score', status: 'Manual Review', detail: 'Score: 691', checked_at: '2026-06-23T10:04:00Z' },
    ],
    documents: [
      { id: 'd1', type: 'COI', file_name: 'HCM_COI.pdf', status: 'Valid', uploaded_at: '2026-06-23T10:00:00Z', url: '', mime_type: 'application/pdf', size_kb: 395, page_count: 2 },
      { id: 'd2', type: 'Board Resolution', file_name: 'HCM_BR.pdf', status: 'Flagged', flag_reason: 'Missing authorised signatory', uploaded_at: '2026-06-23T10:00:00Z', url: '', mime_type: 'application/pdf', size_kb: 290, page_count: 3 },
      { id: 'd3', type: 'MOA/AOA', file_name: 'HCM_MOA.pdf', status: 'Unreadable', flag_reason: 'Heavily compressed scan', uploaded_at: '2026-06-23T10:00:00Z', url: '', mime_type: 'application/pdf', size_kb: 120, page_count: 8 },
    ],
    audit_trail: [
      auditEntry('2026-06-23T10:00:00Z', 'Applicant Portal', 'applicant', 'submitted', 'Application submitted'),
      auditEntry('2026-06-23T10:05:00Z', 'System', 'system', 'document_flagged', 'Board Resolution flagged', 'Missing co-signatory'),
      auditEntry('2026-06-23T14:00:00Z', 'Anita Sharma', 'admin', 'comment', 'Reviewer note', 'Requested fresh MOA/AOA and countersigned Board Resolution'),
    ],
  },
  {
    id: 'APP-0015', company_name: 'Triton Maritime & Logistics Pvt Ltd', entity_type: 'Pvt Ltd',
    gstin: '32AAACT7890N1ZG', pan: 'AAACT7890N', cin: 'U61200KL2018PTC056789',
    registration_number: 'KL-056789', registration_date: '2018-04-05',
    directors: [
      { name: 'Thomas Kuriakose', din: '22345678', designation: 'Managing Director' },
      { name: 'Rosamma Thomas', din: '23456789', designation: 'Director' },
      { name: 'Binu Mathew', din: '24567890', designation: 'Director' },
    ],
    registered_address: 'TC 14/1292, Vazhuthacaud', pincode: '695014', city: 'Thiruvananthapuram', state: 'Kerala',
    contact_name: 'Thomas Kuriakose', contact_email: 'thomas@tritonmaritime.in', contact_phone: '+91 94470 23456',
    submission_date: '2026-06-19T12:00:00Z', status: 'Escalated', risk_score: 'High',
    risk_factors: ['Beneficial ownership disclosure incomplete', 'Director listed as PEP — politically exposed'],
    assigned_to: 'Vikram Patel',
    escalation_reason: 'Director Thomas Kuriakose flagged as PEP. Enhanced Due Diligence required per PMLA guidelines.',
    automated_checks: [
      { id: 'c1', label: 'PAN API Match', status: 'Passed', checked_at: '2026-06-19T12:03:00Z' },
      { id: 'c2', label: 'GST Status', status: 'Passed', checked_at: '2026-06-19T12:03:00Z' },
      { id: 'c3', label: 'MCA Director Check', status: 'Manual Review', detail: 'PEP flag on Thomas Kuriakose', checked_at: '2026-06-19T12:04:00Z' },
      { id: 'c4', label: 'CIBIL Score', status: 'Passed', detail: 'Score: 788', checked_at: '2026-06-19T12:05:00Z' },
    ],
    documents: [
      { id: 'd1', type: 'COI', file_name: 'TML_COI.pdf', status: 'Valid', uploaded_at: '2026-06-19T12:00:00Z', url: '', mime_type: 'application/pdf', size_kb: 430, page_count: 2 },
      { id: 'd2', type: 'Board Resolution', file_name: 'TML_BR.pdf', status: 'Valid', uploaded_at: '2026-06-19T12:00:00Z', url: '', mime_type: 'application/pdf', size_kb: 360, page_count: 4 },
    ],
    audit_trail: [
      auditEntry('2026-06-19T12:00:00Z', 'Applicant Portal', 'applicant', 'submitted', 'Application submitted'),
      auditEntry('2026-06-19T12:06:00Z', 'System', 'system', 'pre_check_failed', 'PEP flag raised', 'Director Thomas Kuriakose is a Politically Exposed Person'),
      auditEntry('2026-06-20T09:30:00Z', 'Vikram Patel', 'admin', 'escalated', 'Escalated — EDD required', 'PEP director identified. Enhanced Due Diligence required.'),
    ],
  },
];

// ─── Org extensions (billing tier, users, usage, flags) ─────────────────────

type OrgExt = Pick<Organization, 'billing_tier' | 'api_usage' | 'users' | 'usage_metrics' | 'feature_flags'>;

const ORG_EXT: Record<string, OrgExt> = {
  'APP-0001': {
    billing_tier: 'Growth', api_usage: 0,
    users: [
      mkUser('u001a', 'Ramesh Kumar Bajaj', 'ramesh@bharatfreight.in', 'Owner', 'Active', '2026-06-27T09:00:00Z'),
      mkUser('u001b', 'Priya Bajaj', 'priya@bharatfreight.in', 'Admin', 'Invited', null),
    ],
    usage_metrics: mkMetrics('Growth', 0, 0, 0),
    feature_flags: mkFlags(),
  },
  'APP-0002': {
    billing_tier: 'Starter', api_usage: 0,
    users: [
      mkUser('u002a', 'Suresh Pillai', 'suresh@skywayllp.com', 'Owner', 'Active', '2026-06-26T14:00:00Z'),
      mkUser('u002b', 'Meenakshi Nair', 'meenakshi@skywayllp.com', 'Admin', 'Invited', null),
    ],
    usage_metrics: mkMetrics('Starter', 0, 0, 0),
    feature_flags: mkFlags(),
  },
  'APP-0003': {
    billing_tier: 'Growth', api_usage: 0,
    users: [
      mkUser('u003a', 'Ashok Chandra Gupta', 'ashok@industrade.co.in', 'Owner', 'Active', '2026-06-24T11:00:00Z'),
      mkUser('u003b', 'Nisha Verma', 'nisha@industrade.co.in', 'Admin', 'Invited', null),
      mkUser('u003c', 'Rakesh Singh', 'rakesh@industrade.co.in', 'Member', 'Invited', null),
    ],
    usage_metrics: mkMetrics('Growth', 0, 0, 0),
    feature_flags: mkFlags(),
  },
  'APP-0004': {
    billing_tier: 'Starter', api_usage: 0,
    users: [
      mkUser('u004a', 'Kalpana Krishnamurthy', 'kalpana@kalpanaroads.com', 'Owner', 'Active', '2026-06-28T08:30:00Z'),
    ],
    usage_metrics: mkMetrics('Starter', 0, 0, 0),
    feature_flags: mkFlags(),
  },
  'APP-0005': {
    billing_tier: 'Growth', api_usage: 0,
    users: [
      mkUser('u005a', 'Dipankar Ghosh', 'dipankar@globalcargoexp.com', 'Owner', 'Active', '2026-06-20T10:00:00Z'),
      mkUser('u005b', 'Samira Biswas', 'samira@globalcargoexp.com', 'Admin', 'Suspended', '2026-06-19T09:00:00Z'),
    ],
    usage_metrics: mkMetrics('Growth', 0, 0, 0),
    feature_flags: mkFlags(),
  },
  'APP-0006': {
    billing_tier: 'Enterprise', api_usage: 72,
    users: [
      mkUser('u006a', 'Arvind Subramaniam',  'arvind@pinnaclechain.in',        'Owner',  'Active',    '2026-06-28T09:00:00Z'),
      mkUser('u006b', 'Lalitha Subramaniam', 'lalitha@pinnaclechain.in',       'Admin',  'Active',    '2026-06-27T16:30:00Z'),
      mkUser('u006c', 'Rajesh Iyer',         'rajesh.iyer@pinnaclechain.in',   'Admin',  'Active',    '2026-06-26T11:00:00Z'),
      mkUser('u006d', 'Deepa Krishnan',      'deepa.k@pinnaclechain.in',       'Member', 'Active',    '2026-06-25T08:45:00Z'),
      mkUser('u006e', 'Sundar Rajan',        'sundar@pinnaclechain.in',        'Member', 'Active',    '2026-06-24T14:00:00Z'),
      mkUser('u006f', 'Preethi Nair',        'preethi@pinnaclechain.in',       'Member', 'Invited',   null),
    ],
    usage_metrics: mkMetrics('Enterprise', 72, 58, 34),
    feature_flags: mkFlags({ reporting: true, webhooks: true, multicurrency: true }),
  },
  'APP-0007': {
    billing_tier: 'Starter', api_usage: 0,
    users: [
      mkUser('u007a', 'Harish Choudhary', 'harish@fastmovellp.in', 'Owner', 'Active', '2026-06-18T16:00:00Z'),
      mkUser('u007b', 'Pooja Rawat', 'pooja@fastmovellp.in', 'Admin', 'Suspended', '2026-06-17T10:00:00Z'),
    ],
    usage_metrics: mkMetrics('Starter', 0, 0, 0),
    feature_flags: mkFlags(),
  },
  'APP-0008': {
    billing_tier: 'Growth', api_usage: 0,
    users: [
      mkUser('u008a', 'Venkat Rao Reddy', 'venkat@deccanhaulage.com', 'Owner', 'Active', '2026-06-25T11:00:00Z'),
      mkUser('u008b', 'Kavitha Rao', 'kavitha@deccanhaulage.com', 'Admin', 'Invited', null),
    ],
    usage_metrics: mkMetrics('Growth', 0, 0, 0),
    feature_flags: mkFlags(),
  },
  'APP-0009': {
    billing_tier: 'Starter', api_usage: 0,
    users: [
      mkUser('u009a', 'Mahendra Singh Rathore', 'mahendra@rajputanatransport.com', 'Owner', 'Active', '2026-06-28T09:30:00Z'),
      mkUser('u009b', 'Govind Lal Sharma', 'govind@rajputanatransport.com', 'Admin', 'Invited', null),
    ],
    usage_metrics: mkMetrics('Starter', 0, 0, 0),
    feature_flags: mkFlags(),
  },
  'APP-0010': {
    billing_tier: 'Starter', api_usage: 0,
    users: [
      mkUser('u010a', 'Sunil Dewangan', 'sunil@narmadacoldchain.in', 'Owner', 'Active', '2026-06-26T09:00:00Z'),
      mkUser('u010b', 'Anjali Dewangan', 'anjali@narmadacoldchain.in', 'Admin', 'Invited', null),
    ],
    usage_metrics: mkMetrics('Starter', 0, 0, 0),
    feature_flags: mkFlags(),
  },
  'APP-0011': {
    billing_tier: 'Starter', api_usage: 0,
    users: [
      mkUser('u011a', 'Bijay Kumar Sahoo', 'bijay@mahanadillp.com', 'Owner', 'Active', '2026-06-27T13:00:00Z'),
      mkUser('u011b', 'Pratima Mishra', 'pratima@mahanadillp.com', 'Admin', 'Invited', null),
    ],
    usage_metrics: mkMetrics('Starter', 0, 0, 0),
    feature_flags: mkFlags(),
  },
  'APP-0012': {
    billing_tier: 'Enterprise', api_usage: 85,
    users: [
      mkUser('u012a', 'Muthukrishnan Arumugam', 'muthukrishnan@coromandel.in',     'Owner',  'Active',  '2026-06-29T08:00:00Z'),
      mkUser('u012b', 'Jayalakshmi Muthukrishnan', 'jayalakshmi@coromandel.in',   'Admin',  'Active',  '2026-06-28T17:00:00Z'),
      mkUser('u012c', 'Karthik Selvam',    'karthik@coromandel.in',               'Admin',  'Active',  '2026-06-28T10:00:00Z'),
      mkUser('u012d', 'Annamalai S.',      'annamalai@coromandel.in',             'Member', 'Active',  '2026-06-27T09:00:00Z'),
      mkUser('u012e', 'Vimala Devi',       'vimala@coromandel.in',                'Member', 'Active',  '2026-06-26T14:00:00Z'),
      mkUser('u012f', 'Senthil Kumar',     'senthil@coromandel.in',               'Member', 'Suspended', '2026-06-10T10:00:00Z'),
      mkUser('u012g', 'Padmini Rajan',     'padmini@coromandel.in',               'Member', 'Invited', null),
    ],
    usage_metrics: mkMetrics('Enterprise', 85, 71, 62),
    feature_flags: mkFlags({ beta: true, reporting: true, webhooks: true, multicurrency: true, bypass: false }),
  },
  'APP-0013': {
    billing_tier: 'Starter', api_usage: 0,
    users: [
      mkUser('u013a', 'Ajay Verma', 'ajay@zephyrcarriers.in', 'Owner', 'Suspended', '2026-06-22T15:00:00Z'),
    ],
    usage_metrics: mkMetrics('Starter', 0, 0, 0),
    feature_flags: mkFlags(),
  },
  'APP-0014': {
    billing_tier: 'Growth', api_usage: 0,
    users: [
      mkUser('u014a', 'Ravi Shankar Negi', 'ravi@himalayanllp.com', 'Owner', 'Active', '2026-06-23T10:00:00Z'),
      mkUser('u014b', 'Sunita Negi', 'sunita@himalayanllp.com', 'Admin', 'Invited', null),
    ],
    usage_metrics: mkMetrics('Growth', 0, 0, 0),
    feature_flags: mkFlags(),
  },
  'APP-0015': {
    billing_tier: 'Enterprise', api_usage: 42,
    users: [
      mkUser('u015a', 'Thomas Kuriakose', 'thomas@tritonmaritime.in',  'Owner',  'Active',    '2026-06-19T12:00:00Z'),
      mkUser('u015b', 'Rosamma Thomas',   'rosamma@tritonmaritime.in', 'Admin',  'Active',    '2026-06-18T11:00:00Z'),
      mkUser('u015c', 'Binu Mathew',      'binu@tritonmaritime.in',    'Member', 'Invited',   null),
    ],
    usage_metrics: mkMetrics('Enterprise', 42, 29, 15),
    feature_flags: mkFlags({ reporting: true }),
  },
};

// ─── Merge base + extensions ──────────────────────────────────────────────────

const INITIAL_ORGS: Organization[] = BASE_APPS.map(app => ({
  ...app,
  ...(ORG_EXT[app.id] ?? {
    billing_tier: 'Starter' as const,
    api_usage: 0,
    users: [],
    usage_metrics: mkMetrics('Starter', 0, 0, 0),
    feature_flags: mkFlags(),
  }),
}));

// ─── Context ──────────────────────────────────────────────────────────────────

const AdminContext = createContext<AdminContextValue | null>(null);

// ─── Mock-mode local mutation helper ─────────────────────────────────────────
// Used when VITE_API_URL is not set — computes the updated org entirely in memory.

function applyOrgStatusLocally(
  org: Organization,
  status: AppStatus,
  payload?: { reason?: string; notes?: string },
): Organization {
  const ts = new Date().toISOString();
  const eventMap: Record<AppStatus, AuditEventType> = {
    Approved:      'approved',
    Rejected:      'rejected',
    Escalated:     'escalated',
    Pending:       'comment',
    'Under Review': 'comment',
  };
  const entry = auditEntry(ts, 'Admin', 'admin', eventMap[status], `Status set to ${status}`, payload?.notes);
  return {
    ...org,
    status,
    ...(status === 'Rejected'  ? { rejection_reason: payload?.reason, rejection_notes: payload?.notes } : {}),
    ...(status === 'Escalated' ? { escalation_reason: payload?.reason } : {}),
    audit_trail: [...org.audit_trail, entry],
  };
}

function applyUserStatusLocally(org: Organization, userId: string, updates: Partial<OrgUser>): Organization {
  return {
    ...org,
    users: org.users.map(u => u.id === userId ? { ...u, ...updates } : u),
  };
}

function applyFeatureFlagLocally(org: Organization, flagId: string): Organization {
  return {
    ...org,
    feature_flags: org.feature_flags.map(f => f.id === flagId ? { ...f, enabled: !f.enabled } : f),
  };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AdminDataProvider({ children }: { children: React.ReactNode }) {
  const [orgs,          setOrgs]          = useState<Organization[]>(INITIAL_ORGS);
  const [selectedId,    setSelectedId]    = useState<string | null>(INITIAL_ORGS[0].id);
  const [accountFilter, setAccountFilter] = useState<AccountFilter>('All Orgs');
  const [searchQuery,   setSearchQuery]   = useState('');
  const [isActing,      setIsActing]      = useState(false);
  const [isLoading,     setIsLoading]     = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  const selectedApp = orgs.find(o => o.id === selectedId) ?? null;

  // ─── Initial data load ──────────────────────────────────────────────────────

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminApi.getOrganizations();
      if (data.length > 0) {
        setOrgs(data);
        setSelectedId(prev => prev ?? data[0].id);
      }
    } catch (e) {
      if (e instanceof ApiNotConfiguredError) {
        // No backend configured — keep INITIAL_ORGS silently
        console.info('[AdminDataProvider] %s', (e as Error).message);
      } else {
        setError((e as Error).message);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);

  // ─── Generic mutation runner ────────────────────────────────────────────────
  // Calls the API; on ApiNotConfiguredError falls back to a local patch function.
  // On real API errors: surfaces a non-blocking alert and does NOT mutate state.

  async function mutateOrg(
    id: string,
    apiCall: () => Promise<Organization>,
    localFallback: (org: Organization) => Organization,
  ): Promise<void> {
    setIsActing(true);
    try {
      let updated: Organization;
      try {
        updated = await apiCall();
      } catch (e) {
        if (!(e instanceof ApiNotConfiguredError)) throw e;
        // Mock mode — compute locally
        const existing = orgs.find(o => o.id === id);
        if (!existing) throw new Error(`Organization ${id} not found in local state`);
        updated = localFallback(existing);
      }
      setOrgs(prev => prev.map(o => o.id === id ? updated : o));
    } catch (err) {
      alert(`Sync failed — database did not acknowledge: ${(err as Error).message}`);
    } finally {
      setIsActing(false);
    }
  }

  // ─── KYC actions ───────────────────────────────────────────────────────────

  async function approveApp(id: string): Promise<void> {
    return mutateOrg(
      id,
      () => adminApi.updateOrgStatus(id, 'Approved'),
      org => applyOrgStatusLocally(org, 'Approved'),
    );
  }

  async function rejectApp(id: string, reason: string, notes: string): Promise<void> {
    return mutateOrg(
      id,
      () => adminApi.updateOrgStatus(id, 'Rejected', { reason, notes }),
      org => applyOrgStatusLocally(org, 'Rejected', { reason, notes }),
    );
  }

  async function escalateApp(id: string, reason: string): Promise<void> {
    return mutateOrg(
      id,
      () => adminApi.updateOrgStatus(id, 'Escalated', { reason }),
      org => applyOrgStatusLocally(org, 'Escalated', { reason }),
    );
  }

  // ─── User actions ──────────────────────────────────────────────────────────

  async function suspendUser(orgId: string, userId: string): Promise<void> {
    const targetOrg  = orgs.find(o => o.id === orgId);
    const targetUser = targetOrg?.users.find(u => u.id === userId);
    if (!targetUser) return;
    const newStatus  = targetUser.status === 'Active' ? 'Suspended' : 'Active';

    setIsActing(true);
    try {
      let updatedUser: OrgUser;
      try {
        updatedUser = await adminApi.updateUserStatus(orgId, userId, { status: newStatus });
      } catch (e) {
        if (!(e instanceof ApiNotConfiguredError)) throw e;
        updatedUser = { ...targetUser, status: newStatus };
      }
      setOrgs(prev => prev.map(o =>
        o.id !== orgId ? o : applyUserStatusLocally(o, userId, updatedUser),
      ));
    } catch (err) {
      alert(`Sync failed — database did not acknowledge: ${(err as Error).message}`);
    } finally {
      setIsActing(false);
    }
  }

  // ─── Feature flag toggle ───────────────────────────────────────────────────

  async function toggleFeatureFlag(orgId: string, flagId: string): Promise<void> {
    const targetOrg  = orgs.find(o => o.id === orgId);
    const targetFlag = targetOrg?.feature_flags.find(f => f.id === flagId);
    if (!targetFlag) return;

    // Optimistic update first — flags are low-risk, snappy UX is preferred
    setOrgs(prev => prev.map(o => o.id !== orgId ? o : applyFeatureFlagLocally(o, flagId)));

    try {
      try {
        await adminApi.toggleFeatureFlag(orgId, flagId);
      } catch (e) {
        if (!(e instanceof ApiNotConfiguredError)) throw e;
        // Mock mode: optimistic update already applied, nothing more to do
      }
    } catch (err) {
      // Rollback optimistic update
      setOrgs(prev => prev.map(o => o.id !== orgId ? o : applyFeatureFlagLocally(o, flagId)));
      alert(`Feature flag sync failed: ${(err as Error).message}`);
    }
  }

  // ─── Context value ─────────────────────────────────────────────────────────

  const value: AdminContextValue = {
    applications:       orgs,
    selectedId,
    selectedApp,
    selectedOrg:        selectedApp,             // alias
    selectApplication:  setSelectedId,
    setSelectedOrgById: setSelectedId,           // alias
    accountFilter,
    setAccountFilter,
    searchQuery,
    setSearchQuery,
    isLoading,
    error,
    refreshData,
    isActing,
    approveApp,
    rejectApp,
    escalateApp,
    suspendUser,
    toggleFeatureFlag,
  };

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used within AdminDataProvider');
  return ctx;
}
