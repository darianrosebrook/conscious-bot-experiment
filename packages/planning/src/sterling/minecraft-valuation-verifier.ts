/**
 * Valuation Decision Verifier — Re-export barrel (Rig F Observability Layer)
 *
 * This module re-exports from the split verifier modules for backwards compat.
 * New code should import directly:
 * - Client-safe: `./minecraft-valuation-verifier-fast`
 * - Server/test: `./minecraft-valuation-verifier-full`
 *
 * @deprecated Import from the specific module instead.
 * @author @darianrosebrook
 */

export { verifyValuationFast } from './minecraft-valuation-verifier-fast';
export { verifyValuationFull } from './minecraft-valuation-verifier-full';
