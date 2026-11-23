export type OrderId = string & { readonly __brand: 'OrderId' };

export function orderId(raw: string): OrderId {
  if (!raw.trim()) throw new Error('An order id is not empty');
  return raw as OrderId;
}

export type Order = { readonly id: OrderId; readonly status: 'Placed' | 'Shipped' };
export type OrderPlaced = { readonly type: 'OrderPlaced'; readonly id: OrderId };

export function placeOrder(id: OrderId): { order: Order; event: OrderPlaced } {
  return { order: { id, status: 'Placed' }, event: { type: 'OrderPlaced', id } };
}

export function shipOrder(order: Order): Order {
  return { ...order, status: 'Shipped' };
}

export interface Orders {
  find(id: OrderId): Promise<Order | undefined>;
  save(order: Order): Promise<void>;
}
