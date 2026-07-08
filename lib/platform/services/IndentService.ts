import { indentRepository } from '../repositories/indentRepository';
import type { SalesOrderForPublish } from '../repositories/orderRepository';
import type { WorkspaceId } from '../types/master-data';

export const IndentService = {
  findBySalesOrderId(workspaceId: WorkspaceId, salesOrderId: string) {
    return indentRepository.findBySalesOrderId(workspaceId, salesOrderId);
  },
  createFromSalesOrder(input: {
    workspaceId: WorkspaceId;
    order: SalesOrderForPublish;
    requestedBy: string;
  }) {
    return indentRepository.createFromSalesOrder(input);
  },
};
