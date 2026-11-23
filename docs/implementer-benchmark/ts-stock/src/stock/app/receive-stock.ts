import { quantity, receiveStock as receive, sku, type Stock } from '../domain/stock.ts';

export async function receiveStock(stock: Stock, rawSku: string, rawQuantity: number): Promise<{ type: 'Received' } | { type: 'Conflict' }> {
  const id = sku(rawSku);
  const loaded = await stock.find(id);
  const stored = await stock.save(receive(loaded, id, quantity(rawQuantity)).item, loaded?.version);
  return stored ? { type: 'Received' } : { type: 'Conflict' };
}
