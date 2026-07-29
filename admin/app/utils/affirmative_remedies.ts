import KVStore from '#models/kv_store'

/**
 * Affirmative-content gate for the drug-reference feature (upstream #1040).
 *
 * The verbatim FDA label search and the condition→OTC matching are grounded in
 * regulated label text and ship with the tier. The hand-authored self-care and
 * herbal REMEDY content is guidance we author, so it stays gated off by default
 * until a clinician has done the content pass; the maintainer flips this on in a
 * follow-up once that's signed off.
 *
 * Independent of the tier install-state (a `medicine-standard` install alone does
 * NOT enable remedies). Defaults off — a missing/null KV value reads as false —
 * and there is deliberately no user-facing toggle, so un-reviewed medical
 * guidance can't be self-enabled.
 *
 * Read at every HTTP boundary that could emit remedy data (the drug-reference
 * page prop and the conditions show / drugs API), so no affirmative content is
 * serialized to the client while the gate is closed.
 */
export async function affirmativeRemediesEnabled(): Promise<boolean> {
  return (await KVStore.getValue('drugReference.remediesEnabled')) === true
}
