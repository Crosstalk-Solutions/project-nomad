import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import StyledSectionHeader from '~/components/StyledSectionHeader'
import { getRoutingCoverage } from '~/lib/map_regions_api'
import { mapApiErrorMessage } from '~/lib/map_api_error'
import { createLatestSelectionSaver } from '~/lib/latest_selection_saver'
import {
  getMapRoutingSettings,
  saveMapRoutingSettings,
  MAP_ROUTING_SETTINGS_KEY,
  type MapRoutingSettingsState,
} from '~/lib/map_routing_settings_api'

type RoutingSaver = ReturnType<typeof createLatestSelectionSaver<string, MapRoutingSettingsState>>
// A navigation/remount must not start a competing queue of writes.
const routingSavers = new WeakMap<QueryClient, RoutingSaver>()
function getRoutingSaver(client: QueryClient) {
  let saver = routingSavers.get(client)
  if (!saver) {
    saver = createLatestSelectionSaver({
      save: async (value: string) => {
        await client.cancelQueries(
          { queryKey: MAP_ROUTING_SETTINGS_KEY, exact: true },
          { revert: false, silent: true }
        )
        return saveMapRoutingSettings(
          value ? { mode: 'fixed', regionId: value } : { mode: 'automatic' }
        )
      },
      committed: async (result) => {
        // A GET started before the PUT must never overwrite its confirmed value.
        await client.cancelQueries(
          { queryKey: MAP_ROUTING_SETTINGS_KEY, exact: true },
          { revert: false, silent: true }
        )
        client.setQueryData(MAP_ROUTING_SETTINGS_KEY, result)
      },
      failed: () => {},
    })
    routingSavers.set(client, saver)
  }
  return saver
}

export default function MapRoutingSettings() {
  const client = useQueryClient()
  const settings = useQuery({
    queryKey: MAP_ROUTING_SETTINGS_KEY,
    queryFn: ({ signal }) => getMapRoutingSettings(signal),
  })
  const coverage = useQuery({ queryKey: ['routing-coverage'], queryFn: getRoutingCoverage })
  const [draft, setDraft] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<unknown>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const saver = getRoutingSaver(client)
  const selection = draft ?? (settings.data?.mode === 'fixed' ? settings.data.regionId : '')
  const regions = coverage.data?.regions ?? []
  const unavailable = !!selection && !regions.some((region) => region.id === selection)
  const select = (value: string) => {
    setDraft(value)
    setSaveError(null)
    void client.cancelQueries(
      { queryKey: MAP_ROUTING_SETTINGS_KEY, exact: true },
      { revert: false, silent: true }
    )
    saver.select(value, {
      committed: () => {
        if (mounted.current) setDraft(null)
      },
      failed: (error) => {
        if (mounted.current) setSaveError(error)
      },
    })
  }
  const error = saveError || settings.error || coverage.error
  return (
    <section
      id="routing-settings"
      className="mb-8 mt-6 rounded border border-border-default bg-surface-primary p-4"
      aria-label="Routing settings"
    >
      <StyledSectionHeader title="Routing" />
      <p className="mb-3 text-sm text-text-secondary">
        Choose how this NOMAD selects installed road data. Automatic routing chooses a region
        covering the whole journey; separate graphs are not joined.
      </p>
      {settings.isPending || coverage.isPending ? (
        <p role="status" className="text-sm text-text-secondary">
          Loading routing settings…
        </p>
      ) : (
        <>
          <label
            htmlFor="map-routing-region"
            className="block text-sm font-medium text-text-primary"
          >
            Routing region
          </label>
          <select
            id="map-routing-region"
            value={selection}
            disabled={coverage.isError}
            onChange={(event) => select(event.target.value)}
            className="mt-1 w-full max-w-xl rounded border border-border-default bg-surface-primary px-3 py-2 text-sm text-text-primary"
          >
            <option value="">Automatic — recommended</option>
            {unavailable && <option value={selection}>{selection} (not installed)</option>}
            {regions.map((region) => (
              <option key={region.id} value={region.id}>
                {region.name}
              </option>
            ))}
          </select>
          <p className="my-2 text-xs text-text-secondary">
            A fixed region limits normal routes to its coverage. Explicit region selections in local
            API requests or map links override this preference.
          </p>
          {unavailable && (
            <p role="alert" className="mb-2 text-sm text-desert-red">
              The selected region is no longer installed. Choose another installed region or
              Automatic.
            </p>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-desert-red">
          {mapApiErrorMessage(error, 'Routing settings could not be loaded or saved.')}
          {!!saveError && !unavailable && (
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => select(selection ?? '')}
            >
              Retry
            </button>
          )}
        </p>
      )}
    </section>
  )
}
