import { requirePlatformDb } from '../db/platformDb';
import { ensurePublicUserRecord } from './userRepository';
import type { SalesOrderForPublish } from './orderRepository';
import type { WorkspaceId } from '../types/master-data';

export type CreatedIndentRef = {
  id: string;
  salesOrderId: string | null;
};

export const indentRepository = {
  async findBySalesOrderId(
    workspaceId: WorkspaceId,
    salesOrderId: string,
  ): Promise<CreatedIndentRef | null> {
    const { data, error } = await requirePlatformDb()
      .from('indents')
      .select('id,sales_order_id')
      .eq('organization_id', workspaceId)
      .eq('sales_order_id', salesOrderId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return { id: String(data.id), salesOrderId: data.sales_order_id as string | null };
  },

  async createFromSalesOrder(input: {
    workspaceId: WorkspaceId;
    order: SalesOrderForPublish;
    requestedBy: string;
  }): Promise<CreatedIndentRef> {
    await ensurePublicUserRecord(input.requestedBy);
    const weightKg = Math.max(input.order.totalWeightKg, 1);
    const { data, error } = await requirePlatformDb()
      .from('indents')
      .insert({
        organization_id: input.workspaceId,
        sales_order_id: input.order.id,
        pickup_area: input.order.pickupArea,
        drop_location: input.order.dropLocation,
        client_name: input.order.customerName,
        client_price: input.order.clientPrice,
        supplier_target: 0,
        vehicle_type: 'Truck',
        load_type: 'General',
        weight: weightKg,
        status: 'broadcast',
        shared_at: new Date().toISOString(),
        owner_user_id: input.requestedBy,
        created_by_user_id: input.requestedBy,
        indent_number: null,
      })
      .select('id,sales_order_id')
      .single();
    if (error) {
      if (error.code === '23505') {
        const existing = await indentRepository.findBySalesOrderId(input.workspaceId, input.order.id);
        if (existing) return existing;
      }
      throw new Error(error.message);
    }
    return { id: String(data.id), salesOrderId: data.sales_order_id as string | null };
  },
};
