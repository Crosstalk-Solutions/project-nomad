import env from '#start/env'
import type { SpecResource } from '../../types/collections.js'
import { isGatedResource } from './hosted_content.js'

/**
 * Auth for curated content that WE host and pay egress for.
 *
 * Content we host sits in a private R2 bucket behind the entitlement Worker,
 * which requires a bearer key that only official release builds bake in (see the
 * Dockerfile ARG/ENV pair, fed from the CI secret). That is the whole point: a
 * fork rebuilt from source cannot point at our bucket and spend our bandwidth.
 *
 * A manifest resource opts in with `auth: 'nomad_app_key'`. Everything else keeps
 * downloading unauthenticated exactly as before.
 *
 * Note on the key name: this deliberately reuses CREATOR_PACKS_APP_KEY rather
 * than minting a second secret. The question it answers ("is this an official
 * build?") is identical for Creator Packs and for our own hosted content, so a
 * second CI secret plus a second Dockerfile ARG would be real cost for no
 * security gain. The name is narrower than the use; this comment is cheaper than
 * the churn of renaming it across CI, the Dockerfile and the Worker.
 *
 * The pure `isGatedResource` predicate lives in hosted_content.ts so that
 * modules which must not pull in env validation can still use it.
 */
export function getHostedContentHeaders(
  resource: Pick<SpecResource, 'auth'>
): Record<string, string> | undefined {
  if (!isGatedResource(resource)) return undefined

  const appKey = env.get('CREATOR_PACKS_APP_KEY')
  if (!appKey) return undefined

  // Deliberately still dispatches with no header when the key is absent: the
  // Worker answers 401 and the download surfaces "official release build
  // required", which is a more useful signal than a silent no-op.
  return { Authorization: `Bearer ${appKey}` }
}
