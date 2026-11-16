import { resolveNativeEpicEvidence } from './epic-attestation.mjs';

// The Reviewer's newest outcome comment names the merged PR that delivered a closed child without its own closing PR.
export function verifyConsolidatedDelivery({ epic, child, repo, base }, adapters = {}) {
  try {
    if (child.state !== 'CLOSED') return false;
    const packet = (adapters.native || resolveNativeEpicEvidence)({ repo, issue: epic });
    if (packet.version !== 1 || packet.epic !== epic || !Array.isArray(packet.consolidated)) return false;
    const entries = packet.consolidated.filter(entry => entry?.issue === child.number);
    if (entries.length !== 1) return false;
    const entry = entries[0];
    return entry.state === 'met' && Number.isSafeInteger(entry.pr) && entry.pr > 0 && adapters.mergedPr(entry.pr, base) === true;
  } catch { return false; }
}
