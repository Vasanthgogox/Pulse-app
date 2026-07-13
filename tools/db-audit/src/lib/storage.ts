import type { AuditConfig } from '@/types';

const CFG_KEY = 'pulse_audit_cfg';

export function getCfg(): AuditConfig {
  try {
    return JSON.parse(localStorage.getItem(CFG_KEY) || '{}') as AuditConfig;
  } catch {
    return {};
  }
}

export function saveCfg(cfg: AuditConfig) {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
}

export function getServiceRoleKey(): string {
  const k = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  return typeof k === 'string' && k.trim() ? k.trim() : '';
}

export function getDefaultSupabaseUrl(): string {
  return import.meta.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || '';
}

export function getDefaultAnonKey(): string {
  return import.meta.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';
}
