import test from 'node:test';
import assert from 'node:assert/strict';
import { orderId, placeOrder, shipOrder } from '../src/orders/domain/orders.ts';
import { placeOrder as placeOrderUseCase } from '../src/orders/app/place-order.ts';
import { MemoryOrders } from '../src/orders/infra/memory-orders.ts';

test('placing an order starts it as Placed and records the event', () => {
  const { order, event } = placeOrder(orderId('o1'));
  assert.equal(order.status, 'Placed');
  assert.deepEqual(event, { type: 'OrderPlaced', id: 'o1' });
});

test('shipping marks the order Shipped', () => {
  assert.equal(shipOrder(placeOrder(orderId('o1')).order).status, 'Shipped');
});

test('the use case stores the placed order', async () => {
  const orders = new MemoryOrders();
  assert.deepEqual(await placeOrderUseCase(orders, 'o1'), { type: 'Placed' });
  assert.equal((await orders.find(orderId('o1')))?.status, 'Placed');
});
