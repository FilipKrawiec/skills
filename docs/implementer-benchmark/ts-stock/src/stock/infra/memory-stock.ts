import { nextVersion, firstVersion, type SaveOutcome, type Sku, type Stock, type StockItem, type Version } from '../domain/stock.ts';

export class MemoryStock implements Stock {
  private readonly rows = new Map<string, StockItem>();

  async find(id: Sku): Promise<StockItem | undefined> {
    return this.rows.get(id);
  }

  async save(item: StockItem, loaded: Version | undefined): Promise<SaveOutcome> {
    const stored = this.rows.get(item.sku);
    if (stored?.version !== loaded) return { type: 'Refused' };
    this.rows.set(item.sku, { ...item, version: stored ? nextVersion(stored.version) : firstVersion });
    return { type: 'Saved' };
  }
}
