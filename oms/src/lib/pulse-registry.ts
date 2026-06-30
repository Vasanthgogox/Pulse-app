import type { GatewayService } from '@/types/platform';

export type ServiceHealth = 'healthy' | 'degraded' | 'down';

export interface RegisteredService {
  id:        GatewayService;
  name:      string;
  version:   string;
  region:    string;
  basePath:  string;
  health:    ServiceHealth;
  activeSlot?: 'blue' | 'green';
}

const REGISTRY: RegisteredService[] = [
  { id: 'execution', name: 'Pulse Execution', version: '1.0.0', region: 'ap-south-1', basePath: '/execution', health: 'healthy', activeSlot: 'blue' },
  { id: 'finance',   name: 'Pulse Finance',   version: '0.9.0', region: 'ap-south-1', basePath: '/finance',   health: 'healthy', activeSlot: 'blue' },
  { id: 'commerce',  name: 'Pulse Commerce',  version: '1.0.0', region: 'ap-south-1', basePath: '/commerce',  health: 'healthy', activeSlot: 'blue' },
  { id: 'identity',  name: 'Pulse Identity',  version: '0.8.0', region: 'ap-south-1', basePath: '/identity',  health: 'degraded', activeSlot: 'blue' },
  { id: 'network',   name: 'Pulse Network',   version: '0.5.0', region: 'ap-south-1', basePath: '/network',   health: 'healthy', activeSlot: 'green' },
  { id: 'ai',        name: 'Pulse AI',        version: '0.7.0', region: 'ap-south-1', basePath: '/ai',        health: 'healthy', activeSlot: 'blue' },
];

const GATEWAY_BASE = '/api/gateway/v1';

/** Resolve downstream endpoint via registry — supports multi-region and blue/green. */
export function resolveServiceEndpoint(service: GatewayService, path: string): string {
  const entry = REGISTRY.find(s => s.id === service);
  if (!entry) return `${GATEWAY_BASE}/${service}${path}`;
  const slot = entry.activeSlot ? `/${entry.activeSlot}` : '';
  return `${GATEWAY_BASE}${entry.basePath}${slot}${path}`;
}

export function getRegisteredServices(): RegisteredService[] {
  return [...REGISTRY];
}

export function getServiceHealth(service: GatewayService): ServiceHealth {
  return REGISTRY.find(s => s.id === service)?.health ?? 'down';
}

export function gatewayRoute(service: GatewayService, path: string): string {
  return resolveServiceEndpoint(service, path);
}
