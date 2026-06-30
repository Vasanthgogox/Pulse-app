import type { ExecutionPlan, Order } from '@/types/commerce';

const ORDERS_KEY = 'pulse-commerce-orders-v1';
const PLANS_KEY  = 'pulse-commerce-plans-v1';

export function loadOrders(): Order[] {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    return raw ? (JSON.parse(raw) as Order[]) : [];
  } catch {
    return [];
  }
}

export function saveOrders(orders: Order[]): void {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
}

export function loadPlans(): ExecutionPlan[] {
  try {
    const raw = localStorage.getItem(PLANS_KEY);
    return raw ? (JSON.parse(raw) as ExecutionPlan[]) : [];
  } catch {
    return [];
  }
}

export function savePlans(plans: ExecutionPlan[]): void {
  localStorage.setItem(PLANS_KEY, JSON.stringify(plans));
}
