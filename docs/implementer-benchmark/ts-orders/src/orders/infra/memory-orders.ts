import type { Order, OrderId, Orders } from '../domain/orders.ts';

export class MemoryOrders implements Orders {
  private readonly rows = new Map<string, Order>();

  async find(id: OrderId): Promise<Order | undefined> {
    return this.rows.get(id);
  }

  async save(order: Order): Promise<void> {
    this.rows.set(order.id, order);
  }
}
