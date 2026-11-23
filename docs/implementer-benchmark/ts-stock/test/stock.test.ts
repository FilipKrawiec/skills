import test from 'node:test';
import assert from 'node:assert/strict';
import { quantity, receiveStock, sku } from '../src/stock/domain/stock.ts';
import { receiveStock as receiveStockUseCase } from '../src/stock/app/receive-stock.ts';
import { MemoryStock } from '../src/stock/infra/memory-stock.ts';

test('receiving stock adds to what is on hand and records the event', () => {
  const first = receiveStock(undefined, sku('s1'), quantity(5));
  assert.equal(first.item.onHand, 5);
  assert.deepEqual(first.event, { type: 'StockReceived', sku: 's1', quantity: 5 });
  assert.equal(receiveStock(first.item, sku('s1'), quantity(2)).item.onHand, 7);
});

test('the use case stores the received stock', async () => {
  const stock = new MemoryStock();
  assert.deepEqual(await receiveStockUseCase(stock, 's1', 5), { type: 'Received' });
  assert.equal((await stock.find(sku('s1')))?.onHand, 5);
});

test('a write against a stale version is refused', async () => {
  const stock = new MemoryStock();
  await receiveStockUseCase(stock, 's1', 5);
  const loaded = await stock.find(sku('s1'));
  await receiveStockUseCase(stock, 's1', 1);
  assert.equal(await stock.save(receiveStock(loaded, sku('s1'), quantity(1)).item, loaded?.version), false);
});
