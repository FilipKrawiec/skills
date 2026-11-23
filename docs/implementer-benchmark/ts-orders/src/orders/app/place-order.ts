import { orderId, placeOrder as place, type Orders } from '../domain/orders.ts';

export async function placeOrder(orders: Orders, rawId: string): Promise<{ type: 'Placed' }> {
  await orders.save(place(orderId(rawId)).order);
  return { type: 'Placed' };
}
