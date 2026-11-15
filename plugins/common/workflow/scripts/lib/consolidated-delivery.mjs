import { createHash } from 'node:crypto';
import { resolveNativeEpicEvidence } from './epic-attestation.mjs';

// The independent review binds the entire current issue body and one merged PR.
export function verifyConsolidatedDelivery({ epic, child, repo, base }, adapters = {}) {
  try {
    if (child.state !== 'CLOSED' || typeof child.body !== 'string') return false;
    const packet = (adapters.native || resolveNativeEpicEvidence)({ repo, issue: epic });
    if (packet.version !== 1 || packet.epic !== epic || !Array.isArray(packet.consolidated)) return false;
    const entries = packet.consolidated.filter(entry => entry?.issue === child.number);
    if (entries.length !== 1) return false;
    const entry = entries[0];
    return entry.state === 'met' && Number.isSafeInteger(entry.pr) && entry.pr > 0 &&
      entry.bodySha256 === createHash('sha256').update(child.body).digest('hex') &&
      adapters.mergedPr(entry.pr, base) === true;
  } catch { return false; }
}
