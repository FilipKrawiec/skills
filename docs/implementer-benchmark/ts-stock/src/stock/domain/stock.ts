export type Sku = string & { readonly __brand: 'Sku' };
export type Quantity = number & { readonly __brand: 'Quantity' };
export type Version = number & { readonly __brand: 'Version' };

export function sku(raw: string): Sku {
  if (!raw.trim()) throw new Error('A sku is not empty');
  return raw as Sku;
}

export function quantity(raw: number): Quantity {
  if (!Number.isInteger(raw) || raw < 0) throw new Error('A quantity is a whole number, zero or more');
  return raw as Quantity;
}

export const firstVersion = 0 as Version;
export const nextVersion = (version: Version): Version => (version + 1) as Version;

export type StockItem = { readonly sku: Sku; readonly onHand: Quantity; readonly reserved: Quantity; readonly version: Version };
export type StockReceived = { readonly type: 'StockReceived'; readonly sku: Sku; readonly quantity: Quantity };

export function receiveStock(item: StockItem | undefined, id: Sku, received: Quantity): { item: StockItem; event: StockReceived } {
  const base = item ?? { sku: id, onHand: quantity(0), reserved: quantity(0), version: firstVersion };
  return { item: { ...base, onHand: quantity(base.onHand + received) }, event: { type: 'StockReceived', sku: id, quantity: received } };
}

export interface Stock {
  find(id: Sku): Promise<StockItem | undefined>;
  // Stores the item only when the stored version is still the one the caller loaded; false means another write got there first.
  save(item: StockItem, loaded: Version | undefined): Promise<boolean>;
}
