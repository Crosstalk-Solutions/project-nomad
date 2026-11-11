/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/
import BenchmarkController from '#controllers/benchmark_controller'
import ChatsController from '#controllers/chats_controller'
import ConditionsController from '#controllers/conditions_controller'
import DocsController from '#controllers/docs_controller'
import DrugReferenceController from '#controllers/drug_reference_controller'
import DownloadsController from '#controllers/downloads_controller'
import EasySetupController from '#controllers/easy_setup_controller'
import HomeController from '#controllers/home_controller'
import MapsController from '#controllers/maps_controller'
import MapPacksController from '#controllers/map_packs_controller'
import OfflineRoutesController from '#controllers/offline_routes_controller'
import MapRegionsController from '#controllers/map_regions_controller'
import MapRegionEstimatesController from '#controllers/map_region_estimates_controller'
import MapRoutingSettingsController from '#controllers/map_routing_settings_controller'
import NomadMdController from '#controllers/nomad_md_controller'
import OllamaController from '#controllers/ollama_controller'
import OpenApiController from '#controllers/openapi_controller'
import RagController from '#controllers/rag_controller'
import SettingsController from '#controllers/settings_controller'
import SupplyDepotController from '#controllers/supply_depot_controller'
import SystemController from '#controllers/system_controller'
import CollectionUpdatesController from '#controllers/collection_updates_controller'
import CreatorPacksController from '#controllers/creator_packs_controller'
import ZimController from '#controllers/zim_controller'
import router from '@adonisjs/core/services/router'
import transmit from '@adonisjs/transmit/services/main'
import { documented } from '#start/openapi/documented'
import {
  remoteDownloadValidator,
  remoteDownloadWithMetadataValidator,
  remoteDownloadValidatorOptional,
  filenameParamValidator,
  downloadCollectionValidator,
  downloadCategoryTierValidator,
  selectWikipediaValidator,
  applyContentUpdateValidator,
  applyAllContentUpdatesValidator,
  mapExtractPreflightValidator,
  mapExtractValidator,
} from '#validators/common'
import {
  listRemoteZimValidator,
  addCustomLibraryValidator,
  browseLibraryValidator,
  idParamValidator,
} from '#validators/zim'
import {
  getJobStatusSchema,
  deleteFileSchema,
  embedFileSchema,
  fileSourceSchema,
  estimateBatchSchema,
} from '#validators/rag'
import {
  installServiceValidator,
  affectServiceValidator,
  subscribeToReleaseNotesValidator,
  checkLatestVersionValidator,
  updateServiceValidator,
  preflightValidator,
  setServiceAutoUpdateValidator,
  preflightCustomValidator,
  customAppValidator,
  setServiceCustomUrlValidator,
  deleteCustomAppValidator,
  uninstallServiceValidator,
  serviceLogsValidator,
  updateCustomAppValidator,
} from '#validators/system'
import {
  chatSchema,
  unloadChatModelsSchema,
  getAvailableModelsSchema,
} from '#validators/ollama'
import { getSettingSchema, updateSettingSchema } from '#validators/settings'
import {
  createSessionSchema,
  updateSessionSchema,
  addMessageSchema,
} from '#validators/chat'
import { downloadJobsByFiletypeSchema, modelNameSchema } from '#validators/download'
import { runBenchmarkValidator, submitBenchmarkValidator } from '#validators/benchmark'
import { healthResponse, errorResponse } from '#validators/responses/common'
import {
  chatSessionResponse,
  chatSessionListResponse,
  chatMessageResponse,
} from '#validators/responses/chat'
import { updateNomadMdSchema } from '#validators/nomad_md'
import { searchDrugValidator, interactionsValidator } from '#validators/drug_reference'
import { conditionDrugsValidator } from '#validators/conditions'
import {
  mapRegionRequestValidator,
  mapRegionCheckUpdatesValidator,
  mapRegionCancelValidator,
  mapRegionEstimateParamsValidator,
  mapRegionEstimateQueryValidator,
  mapRoutingSettingsValidator,
  mapRegionComponentParamsValidator,
  mapOfflineRouteValidator,
} from '#validators/maps'
import {
  mapAcceptedResponse,
  mapRegionEstimateResponse,
  mapRoutingSettingsResponse,
  mapCatalogRefreshResponse,
  mapMessageResponse,
  mapRegionsResponse,
  mapRegionOperationsResponse,
  mapRouteResponse,
  mapRouteErrorResponse,
  mapRoutingCoverageResponse,
  mapUpdateCheckResponse,
  mapValidationResponse,
} from '#validators/responses/maps'

transmit.registerRoutes()

router.get('/', [HomeController, 'index'])
router.get('/home', [HomeController, 'home'])
router.on('/about').renderInertia('about')
router.get('/chat', [ChatsController, 'inertia'])
router.get('/maps', [MapsController, 'index'])
router.get('/supply-depot', [SupplyDepotController, 'index'])
router.on('/knowledge-base').redirectToPath('/chat?knowledge_base=true') // redirect for legacy knowledge-base links

router.get('/easy-setup', [EasySetupController, 'index'])
router.get('/easy-setup/complete', [EasySetupController, 'complete'])
documented(
  router.get('/api/easy-setup/curated-categories', [EasySetupController, 'listCuratedCategories']),
  {
    summary: 'List curated easy-setup categories',
    tags: ['easy-setup'],
  }
)
documented(router.post('/api/manifests/refresh', [EasySetupController, 'refreshManifests']), {
  summary: 'Refresh content manifests',
  tags: ['easy-setup'],
})
router
  .group(() => {
    documented(router.post('/check', [CollectionUpdatesController, 'checkForUpdates']), {
      summary: 'Check for available content updates',
      tags: ['content-updates'],
    })
    documented(router.post('/apply', [CollectionUpdatesController, 'applyUpdate']), {
      summary: 'Apply a content update',
      tags: ['content-updates'],
      request: applyContentUpdateValidator,
    })
    documented(router.post('/apply-all', [CollectionUpdatesController, 'applyAllUpdates']), {
      summary: 'Apply all available content updates',
      tags: ['content-updates'],
      request: applyAllContentUpdatesValidator,
    })
  })
  .prefix('/api/content-updates')

router
  .group(() => {
    router.get('/system', [SettingsController, 'system'])
    router.on('/apps').redirectToPath('/supply-depot') // superseded by Supply Depot
    router.get('/legal', [SettingsController, 'legal'])
    router.get('/maps', [SettingsController, 'maps'])
    router.get('/models', [SettingsController, 'models'])
    router.get('/update', [SettingsController, 'update'])
    router.get('/zim', [SettingsController, 'zim'])
    router.get('/zim/remote-explorer', [SettingsController, 'zimRemote'])
    router.get('/creator-packs', [SettingsController, 'creatorPacks'])
    router.get('/benchmark', [SettingsController, 'benchmark'])
    router.get('/support', [SettingsController, 'support'])
    router.get('/advanced', [SettingsController, 'advanced'])
  })
  .prefix('/settings')

router
  .group(() => {
    router.get('/:slug', [DocsController, 'show'])
    router.get('/', ({ response }) => {
      // redirect to /docs/home if accessing root
      response.redirect('/docs/home')
    })
  })
  .prefix('/docs')

router
  .group(() => {
    documented(router.get('/packs', [MapPacksController, 'index']), {
      summary: 'Inspect previously imported routing packs',
      tags: ['maps'],
      description:
        'Compatibility inventory for local version 1 routing packs. The region catalog is the unified manager; these assets retain their original coverage and versions.',
    })
    documented(router.get('/operations', [MapRegionsController, 'operations']), {
      summary: 'Read lightweight offline map operations and real preparation phases',
      tags: ['maps'],
      description:
        'Local read-only snapshot of queue state, transfer counters, preparation phases and liveness. Legacy jobs expose file activity when reported counters are unavailable. Polling does not advance jobs or require internet. A worker heartbeat is distinct from actual progress.',
      responses: { 200: mapRegionOperationsResponse, 503: mapMessageResponse },
    })
    documented(router.post('/regions/retry', [MapRegionsController, 'retry']), {
      summary:
        'Retry stopped map operations while preserving their original intent and cached source',
      tags: ['maps'],
      description:
        'Retries a failed or cancelled country or published subregion routing operation only after reconciling prior preparation. A validated local source is reused without a provider request; a partial transfer may resume against its original source. Continents and multi-country preparations cannot be retried. Active or unconfirmed jobs cannot be retried.',
      request: mapRegionCancelValidator,
      responses: {
        202: mapAcceptedResponse,
        400: mapMessageResponse,
        404: mapMessageResponse,
        409: mapMessageResponse,
        422: mapMessageResponse,
        503: mapMessageResponse,
      },
    })
    documented(router.get('/regions/catalog', [MapRegionsController, 'index']), {
      summary: 'Get the offline region tree and effective component availability',
      tags: ['maps'],
      description:
        'Reads the local public-provider routing catalog and installed data. territoryScope and countryCodes identify countries, actual provider subregions and navigation collections. A compatible installed country can cover its descendants; continents and multi-country graphs never provide automatic routing coverage. pendingProvider avoids redundant downloads without implying readiness. This request never checks remote updates or initiates downloads.',
      responses: { 200: mapRegionsResponse, 503: mapMessageResponse },
    })
    documented(router.post('/regions/install', [MapRegionsController, 'install']), {
      summary: 'Queue missing components of a published region',
      tags: ['maps'],
      description:
        'Install routing for one published country or subregion. Existing coverage and cached local sources avoid duplicate transfers. Download, verification and routing preparation are one operation. Continents and multi-country sources cannot be installed or joined. Example body: {"regionId":"brazil","components":["routing"]}.',
      request: mapRegionRequestValidator,
      responses: {
        202: mapAcceptedResponse,
        400: mapMessageResponse,
        404: mapMessageResponse,
        409: mapMessageResponse,
        422: mapValidationResponse,
        503: mapMessageResponse,
      },
    })
    documented(router.post('/regions/check-updates', [MapRegionsController, 'checkUpdates']), {
      summary: 'Check source updates for a region or all installed components',
      tags: ['maps'],
      description:
        'Checks public source identity without downloading source datasets or queueing preparation. Omit regionId to check all installed components. A covered child checks its owning ancestor package. up_to_date is a confirmed check; unknown or unavailable does not mean current. checkedAt records when the source was checked, separately from its data date. Installed data remains usable offline.',
      request: mapRegionCheckUpdatesValidator,
      responses: {
        200: mapUpdateCheckResponse,
        400: mapMessageResponse,
        404: mapMessageResponse,
        422: mapValidationResponse,
      },
    })
    documented(router.get('/regions/:regionId/estimate', [MapRegionEstimatesController, 'show']), {
      summary: 'Preview source transfer and preparation space',
      tags: ['maps'],
      params: mapRegionEstimateParamsValidator,
      query: mapRegionEstimateQueryValidator,
      description:
        'Uses bounded public HEAD metadata with a one-hour local cache. components is routing; operation=update previews replacement inputs. Shared input is counted once. Cached bytes are reusable subject to verification. minimumFreeBytes is a conservative preparation admission requirement, not the final installed size. Offline last-known sizes are marked stale. Collections and multi-country packages are navigation only and cannot be estimated or installed.',
      responses: {
        200: mapRegionEstimateResponse,
        400: mapMessageResponse,
        404: mapMessageResponse,
        409: mapMessageResponse,
      },
    })
    documented(router.post('/regions/cancel', [MapRegionsController, 'cancel']), {
      summary: 'Cancel queued, downloading or preparing region components',
      tags: ['maps'],
      request: mapRegionCancelValidator,
      description:
        'Requests cooperative cancellation of routing (also the default when components is omitted). cancelling remains visible until the worker and preparation process confirm their stop. Eligible country and subregion operations may be retried after cancellation. Existing installed versions and cached sources are preserved; cancellation does not uninstall a region.',
      responses: {
        202: mapAcceptedResponse,
        400: mapMessageResponse,
        404: mapMessageResponse,
        409: mapMessageResponse,
        503: mapMessageResponse,
      },
    })
    documented(router.post('/regions/update', [MapRegionsController, 'update']), {
      summary: 'Queue an explicit update of an installed region component',
      tags: ['maps'],
      description:
        'Queues an explicit source download/preparation while keeping the installed version usable. The prepared artifact is verified before its version becomes installed. An inherited child must be managed through the owner shown in providedBy. Checking updates is a separate operation and never calls this endpoint automatically.',
      request: mapRegionRequestValidator,
      responses: {
        202: mapAcceptedResponse,
        400: mapMessageResponse,
        404: mapMessageResponse,
        409: mapMessageResponse,
        422: mapValidationResponse,
        503: mapMessageResponse,
      },
    })
    documented(router.post('/regions/refresh-catalog', [MapRegionsController, 'refreshCatalog']), {
      summary: 'Refresh the published region catalog',
      tags: ['maps'],
      description:
        'Online maintenance operation that refreshes the Geofabrik public hierarchy for independent routing countries and actual published subregions. Stores the refreshed catalog locally for offline browsing. It does not create custom geographic extracts, install newly listed regions, or remove installed data when a provider changes its catalog.',
      responses: { 200: mapCatalogRefreshResponse, 503: mapMessageResponse },
    })
    documented(router.delete('/regions/:regionId/:component', [MapRegionsController, 'remove']), {
      summary: 'Remove a directly owned component',
      tags: ['maps'],
      description:
        'Remove a directly owned routing region. Busy components cannot be removed. Inspect dependents in the region catalog before removing an ancestor package; its descendant coverage disappears with that owner. A covered child does not own another copy of the artifact. Pins, other routing graphs and visual map archives remain installed.',
      params: mapRegionComponentParamsValidator,
      responses: {
        200: mapAcceptedResponse,
        400: mapMessageResponse,
        409: mapMessageResponse,
        503: mapMessageResponse,
      },
    })
    documented(router.get('/routing/coverage', [OfflineRoutesController, 'coverage']), {
      summary: 'List installed routing graphs and supported profiles',
      tags: ['maps'],
      description:
        'Returns the graph IDs and versions available to the routing API, including configured prepared packs. IDs are namespaced, for example regions:brazil or packs:monaco. Separate country graphs are not joined.',
      responses: { 200: mapRoutingCoverageResponse },
    })
    documented(router.get('/routing/settings', [MapRoutingSettingsController, 'index']), {
      summary: 'Read the persistent routing-region preference',
      tags: ['maps'],
      description:
        'Shared NOMAD configuration: automatic chooses an installed graph covering the trip; fixed selects one namespaced installed graph. Missing fixed data is reported explicitly. Navigation does not contain a region selector.',
      responses: { 200: mapRoutingSettingsResponse, 503: mapMessageResponse },
    })
    documented(router.put('/routing/settings', [MapRoutingSettingsController, 'update']), {
      summary: 'Configure automatic routing or a fixed installed region',
      tags: ['maps'],
      request: mapRoutingSettingsValidator,
      description:
        'Persists locally. Fixed mode requires a currently installed graph; automatic clears a fixed selection. Explicit regionId in a route API request or map URL takes precedence, then this preference, then automatic selection. A missing selected region returns an error instead of silently falling back.',
      responses: {
        200: mapRoutingSettingsResponse,
        400: mapMessageResponse,
        409: mapMessageResponse,
        503: mapMessageResponse,
      },
    })
    documented(router.post('/packs/install', [MapPacksController, 'install']), {
      summary: 'Install a configured version 1 routing pack',
      tags: ['maps'],
      description:
        'Queue an artifact from the administrator-configured prepared-pack catalog. To prepare routes from public country/region data, use /api/maps/regions/install.',
    })
    documented(router.post('/packs/activate', [MapPacksController, 'activate']), {
      summary: 'Activate a version 1 routing pack for legacy clients',
      tags: ['maps'],
    })
    documented(router.post('/packs/deactivate', [MapPacksController, 'deactivate']), {
      summary: 'Deactivate the legacy routing pack',
      tags: ['maps'],
    })
    documented(router.delete('/packs/:packageId', [MapPacksController, 'uninstall']), {
      summary: 'Remove a retained version 1 routing pack',
      tags: ['maps'],
    })
    documented(router.post('/route', [OfflineRoutesController, 'route']), {
      summary: 'Calculate an offline car or walking route',
      tags: ['maps'],
      description:
        'Recommended request: {"automatic":true,"profile":"auto","locations":[{"lat":-22.9068,"lon":-43.1729},{"lat":-23.5505,"lon":-46.6333}]}. profile is auto for car or pedestrian for walking. Accepts 2 to 7 ordered points A to G, producing up to 6 route legs. Automatic routing chooses one installed graph covering every point. Optional regionId selects the namespaced graph from /routing/coverage; packageVersion pins its exact installed version and requires regionId. Missing explicit region/version returns 409 rather than silently selecting another graph. Errors include a machine-readable code; engineCode and distanceLimitMeters are included when known. DISTANCE_LIMIT_EXCEEDED is a navigation-engine limit, not missing coverage. OUTSIDE_COVERAGE means no installed graph covers all points; separate graphs are not joined. NO_PATH, UNCONNECTED_POINTS and NO_ROUTABLE_EDGE describe mode-specific graph/access failures. ENGINE_TIMEOUT and ENGINE_BUSY can be retried. The legacy request without automatic:true uses packageId/packageVersion and the active version 1 pack. Locations are WGS84 lat/lon objects; returned GeoJSON coordinates are [longitude,latitude]. Distances are meters and durations seconds. Times exclude live traffic and temporary closures.',
      request: mapOfflineRouteValidator,
      responses: {
        200: mapRouteResponse,
        400: mapRouteErrorResponse,
        409: mapRouteErrorResponse,
        422: mapRouteErrorResponse,
        502: mapRouteErrorResponse,
        503: mapRouteErrorResponse,
        504: mapRouteErrorResponse,
      },
    })
    documented(router.get('/regions', [MapsController, 'listRegions']), {
      summary: 'List available map regions',
      tags: ['maps'],
    })
    documented(router.get('/styles', [MapsController, 'styles']), {
      summary: 'List available map styles',
      tags: ['maps'],
    })
    documented(router.get('/curated-collections', [MapsController, 'listCuratedCollections']), {
      summary: 'List curated map collections',
      tags: ['maps'],
    })
    documented(router.post('/fetch-latest-collections', [MapsController, 'fetchLatestCollections']), {
      summary: 'Fetch the latest map collections',
      tags: ['maps'],
    })
    documented(router.post('/download-base-assets', [MapsController, 'downloadBaseAssets']), {
      summary: 'Download base map assets',
      tags: ['maps'],
      request: remoteDownloadValidatorOptional,
    })
    documented(router.post('/setup-world-basemap', [MapsController, 'setupWorldBasemap']), {
      summary: 'Provision the world base map',
      tags: ['maps'],
    })
    documented(router.post('/download-remote', [MapsController, 'downloadRemote']), {
      summary: 'Queue a remote map download',
      tags: ['maps'],
      request: remoteDownloadValidator,
    })
    documented(router.post('/download-remote-preflight', [MapsController, 'downloadRemotePreflight']), {
      summary: 'Preflight a remote map download',
      tags: ['maps'],
      request: remoteDownloadValidator,
    })
    documented(router.post('/download-collection', [MapsController, 'downloadCollection']), {
      summary: 'Download a map collection',
      tags: ['maps'],
      request: downloadCollectionValidator,
    })
    documented(router.get('/global-map-info', [MapsController, 'globalMapInfo']), {
      summary: 'Get global map information',
      tags: ['maps'],
    })
    documented(router.post('/download-global-map', [MapsController, 'downloadGlobalMap']), {
      summary: 'Download the global map',
      tags: ['maps'],
    })
    documented(router.get('/countries', [MapsController, 'listCountries']), {
      summary: 'List available countries',
      tags: ['maps'],
    })
    documented(router.get('/country-groups', [MapsController, 'listCountryGroups']), {
      summary: 'List country groups',
      tags: ['maps'],
    })
    documented(router.post('/extract-preflight', [MapsController, 'extractPreflight']), {
      summary: 'Preflight a map region extraction',
      tags: ['maps'],
      request: mapExtractPreflightValidator,
    })
    documented(router.post('/extract', [MapsController, 'extractRegion']), {
      summary: 'Extract a map region',
      tags: ['maps'],
      request: mapExtractValidator,
    })
    documented(router.get('/markers', [MapsController, 'listMarkers']), {
      summary: 'List map markers',
      tags: ['maps'],
    })
    documented(router.post('/markers', [MapsController, 'createMarker']), {
      summary: 'Create a map marker',
      tags: ['maps'],
    })
    documented(router.patch('/markers/:id', [MapsController, 'updateMarker']), {
      summary: 'Update a map marker',
      tags: ['maps'],
    })
    documented(router.delete('/markers/:id', [MapsController, 'deleteMarker']), {
      summary: 'Delete a map marker',
      tags: ['maps'],
    })
    documented(router.delete('/:filename', [MapsController, 'delete']), {
      summary: 'Delete a map file',
      tags: ['maps'],
      params: filenameParamValidator,
    })
  })
  .prefix('/api/maps')

router
  .group(() => {
    documented(router.get('/list', [DocsController, 'list']), {
      summary: 'List documentation pages',
      tags: ['docs'],
    })
  })
  .prefix('/api/docs')

router
  .group(() => {
    documented(router.get('/jobs', [DownloadsController, 'index']), {
      summary: 'List download jobs',
      tags: ['downloads'],
    })
    documented(router.get('/jobs/:filetype', [DownloadsController, 'filetype']), {
      summary: 'List download jobs by filetype',
      tags: ['downloads'],
      params: downloadJobsByFiletypeSchema,
    })
    documented(router.delete('/jobs/:jobId', [DownloadsController, 'removeJob']), {
      summary: 'Remove a download job',
      tags: ['downloads'],
    })
    documented(router.post('/jobs/:jobId/cancel', [DownloadsController, 'cancelJob']), {
      summary: 'Cancel a download job',
      tags: ['downloads'],
    })
    documented(router.post('/jobs/:jobId/retry', [DownloadsController, 'retryJob']), {
      summary: 'Retry a download job',
      tags: ['downloads'],
    })
  })
  .prefix('/api/downloads')

documented(
  router.get('/api/health', () => {
    return { status: 'ok' }
  }),
  { summary: 'Health check', tags: ['meta'], responses: { 200: healthResponse } }
)

// Self-generating API docs: OpenAPI spec + Scalar UI. Registered top-level so
// they stay clear of the `/docs/:slug` markdown catch-all above. The Scalar
// bundle is served from this app (not a CDN) for offline appliances.
router.get('/api/openapi.json', [OpenApiController, 'spec'])
router.get('/reference', [OpenApiController, 'reference'])
router.get('/reference/assets/standalone.js', [OpenApiController, 'standalone'])

router
  .group(() => {
    documented(router.post('/chat', [OllamaController, 'chat']), {
      summary: 'Send a chat completion request',
      tags: ['ollama'],
      request: chatSchema,
    })
    documented(router.get('/models', [OllamaController, 'availableModels']), {
      summary: 'List available models',
      tags: ['ollama'],
      query: getAvailableModelsSchema,
    })
    documented(router.post('/models', [OllamaController, 'dispatchModelDownload']), {
      summary: 'Queue a model download',
      tags: ['ollama'],
      request: modelNameSchema,
    })
    documented(router.delete('/models', [OllamaController, 'deleteModel']), {
      summary: 'Delete a model',
      tags: ['ollama'],
      request: modelNameSchema,
    })
    documented(router.get('/installed-models', [OllamaController, 'installedModels']), {
      summary: 'List installed models',
      tags: ['ollama'],
    })
    documented(router.post('/unload-chat-models', [OllamaController, 'unloadChatModels']), {
      summary: 'Unload chat models from memory',
      tags: ['ollama'],
      request: unloadChatModelsSchema,
    })
    documented(router.post('/configure-remote', [OllamaController, 'configureRemote']), {
      summary: 'Configure a remote Ollama endpoint',
      tags: ['ollama'],
    })
    documented(router.get('/remote-status', [OllamaController, 'remoteStatus']), {
      summary: 'Get remote Ollama status',
      tags: ['ollama'],
    })
  })
  .prefix('/api/ollama')

router
  .group(() => {
    documented(router.get('/nomad-md', [NomadMdController, 'show']), {
      summary: 'Get the NOMAD.md system prompt',
      tags: ['ai'],
    })
    documented(router.put('/nomad-md', [NomadMdController, 'update']), {
      summary: 'Update the NOMAD.md system prompt',
      tags: ['ai'],
      request: updateNomadMdSchema,
    })
  })
  .prefix('/api/ai')

router
  .group(() => {
    documented(router.get('/', [ChatsController, 'index']), {
      summary: 'List chat sessions',
      tags: ['chat'],
      responses: { 200: chatSessionListResponse },
    })
    documented(router.post('/', [ChatsController, 'store']), {
      summary: 'Create a chat session',
      tags: ['chat'],
      request: createSessionSchema,
      responses: {
        201: { description: 'The created session', schema: chatSessionResponse },
        500: errorResponse,
      },
    })
    documented(router.delete('/all', [ChatsController, 'destroyAll']), {
      summary: 'Delete all chat sessions',
      tags: ['chat'],
      responses: { 204: { description: 'All sessions deleted' } },
    })
    documented(router.get('/:id', [ChatsController, 'show']), {
      summary: 'Get a chat session',
      tags: ['chat'],
      responses: {
        200: chatSessionResponse,
        404: { description: 'Session not found', schema: errorResponse },
      },
    })
    documented(router.put('/:id', [ChatsController, 'update']), {
      summary: 'Update a chat session',
      tags: ['chat'],
      request: updateSessionSchema,
      responses: { 200: chatSessionResponse, 500: errorResponse },
    })
    documented(router.delete('/:id', [ChatsController, 'destroy']), {
      summary: 'Delete a chat session',
      tags: ['chat'],
      responses: { 204: { description: 'Session deleted' } },
    })
    documented(router.post('/:id/messages', [ChatsController, 'addMessage']), {
      summary: 'Add a message to a chat session',
      tags: ['chat'],
      request: addMessageSchema,
      responses: {
        201: { description: 'The created message', schema: chatMessageResponse },
        500: errorResponse,
      },
    })
  })
  .prefix('/api/chat/sessions')

documented(router.get('/api/chat/suggestions', [ChatsController, 'suggestions']), {
  summary: 'List chat suggestions',
  tags: ['chat'],
})

router
  .group(() => {
    documented(router.post('/upload', [RagController, 'upload']), {
      summary: 'Upload a file for RAG',
      tags: ['rag'],
    })
    documented(router.get('/files', [RagController, 'getStoredFiles']), {
      summary: 'List stored RAG files',
      tags: ['rag'],
    })
    documented(router.get('/file-warnings', [RagController, 'getFileWarnings']), {
      summary: 'List RAG file warnings',
      tags: ['rag'],
    })
    documented(router.delete('/files', [RagController, 'deleteFile']), {
      summary: 'Delete a RAG file',
      tags: ['rag'],
      query: deleteFileSchema,
    })
    documented(router.post('/files/embed', [RagController, 'embedFile']), {
      summary: 'Embed a RAG file',
      tags: ['rag'],
      request: embedFileSchema,
    })
    documented(router.get('/files/content', [RagController, 'getFileContent']), {
      summary: 'Get RAG file content',
      tags: ['rag'],
      query: fileSourceSchema,
    })
    documented(router.get('/files/download', [RagController, 'downloadFile']), {
      summary: 'Download a RAG file',
      tags: ['rag'],
      query: fileSourceSchema,
    })
    documented(router.get('/active-jobs', [RagController, 'getActiveJobs']), {
      summary: 'List active RAG jobs',
      tags: ['rag'],
    })
    documented(router.get('/failed-jobs', [RagController, 'getFailedJobs']), {
      summary: 'List failed RAG jobs',
      tags: ['rag'],
    })
    documented(router.delete('/failed-jobs', [RagController, 'cleanupFailedJobs']), {
      summary: 'Clean up failed RAG jobs',
      tags: ['rag'],
    })
    documented(router.delete('/jobs', [RagController, 'cancelAllJobs']), {
      summary: 'Cancel all RAG jobs',
      tags: ['rag'],
    })
    documented(router.get('/job-status', [RagController, 'getJobStatus']), {
      summary: 'Get RAG job status',
      tags: ['rag'],
      query: getJobStatusSchema,
    })
    documented(router.post('/sync', [RagController, 'scanAndSync']), {
      summary: 'Scan and sync RAG files',
      tags: ['rag'],
    })
    documented(router.post('/re-embed-all', [RagController, 'reembedAll']), {
      summary: 'Re-embed all RAG files',
      tags: ['rag'],
    })
    documented(router.post('/reset-and-rebuild', [RagController, 'resetAndRebuild']), {
      summary: 'Reset and rebuild the RAG index',
      tags: ['rag'],
    })
    documented(router.post('/estimate-batch', [RagController, 'estimateBatch']), {
      summary: 'Estimate a RAG embedding batch',
      tags: ['rag'],
      request: estimateBatchSchema,
    })
    documented(router.get('/policy-prompt-state', [RagController, 'policyPromptState']), {
      summary: 'Get RAG policy prompt state',
      tags: ['rag'],
    })
    documented(router.get('/health', [RagController, 'health']), {
      summary: 'RAG health check',
      tags: ['rag'],
    })
    documented(router.get('/collections', [RagController, 'getKnowledgeCollections']), {
      summary: 'List knowledge collections',
      tags: ['rag'],
    })
    documented(router.post('/update-collection', [RagController, 'updateFileCollection']), {
      summary: "Update a file's knowledge collection",
      tags: ['rag'],
    })
    documented(router.post('/files/active', [RagController, 'setFileActive']), {
      summary: "Toggle a file's active (searchable) state",
      tags: ['rag'],
    })
    documented(router.post('/rename-collection', [RagController, 'renameKnowledgeCollection']), {
      summary: 'Rename a knowledge collection',
      tags: ['rag'],
    })
    documented(router.post('/delete-collection', [RagController, 'deleteKnowledgeCollection']), {
      summary: 'Delete a knowledge collection',
      tags: ['rag'],
    })
    documented(router.post('/collection-active', [RagController, 'setKnowledgeCollectionActive']), {
      summary: "Bulk-toggle every file in a knowledge collection's active (searchable) state",
      tags: ['rag'],
    })
  })
  .prefix('/api/rag')

router
  .group(() => {
    documented(router.get('/debug-info', [SystemController, 'getDebugInfo']), {
      summary: 'Get system debug information',
      tags: ['system'],
    })
    documented(router.get('/info', [SystemController, 'getSystemInfo']), {
      summary: 'Get system information',
      tags: ['system'],
    })
    documented(router.get('/internet-status', [SystemController, 'getInternetStatus']), {
      summary: 'Get internet connectivity status',
      tags: ['system'],
    })
    documented(router.get('/services', [SystemController, 'getServices']), {
      summary: 'List services',
      tags: ['system'],
    })
    documented(router.post('/services/affect', [SystemController, 'affectService']), {
      summary: 'Start, stop, or restart a service',
      tags: ['system'],
      request: affectServiceValidator,
    })
    documented(router.post('/services/install', [SystemController, 'installService']), {
      summary: 'Install a service',
      tags: ['system'],
      request: installServiceValidator,
    })
    documented(router.post('/services/force-reinstall', [SystemController, 'forceReinstallService']), {
      summary: 'Force reinstall a service',
      tags: ['system'],
      request: installServiceValidator,
    })
    documented(router.post('/services/uninstall', [SystemController, 'uninstallService']), {
      summary: 'Uninstall a service',
      tags: ['system'],
      request: uninstallServiceValidator,
    })
    documented(router.post('/services/check-updates', [SystemController, 'checkServiceUpdates']), {
      summary: 'Check for service updates',
      tags: ['system'],
    })
    documented(router.get('/services/preflight', [SystemController, 'preflightCheck']), {
      summary: 'Preflight a service install',
      tags: ['system'],
      query: preflightValidator,
    })
    documented(router.get('/services/suggest-port', [SystemController, 'suggestCustomPort']), {
      summary: 'Suggest an available custom port',
      tags: ['system'],
    })
    documented(router.post('/services/preflight-custom', [SystemController, 'preflightCustomApp']), {
      summary: 'Preflight a custom app install',
      tags: ['system'],
      request: preflightCustomValidator,
    })
    documented(router.post('/services/custom', [SystemController, 'createCustomApp']), {
      summary: 'Create a custom app',
      tags: ['system'],
      request: customAppValidator,
    })
    documented(router.put('/services/custom', [SystemController, 'updateCustomApp']), {
      summary: 'Update a custom app',
      tags: ['system'],
      request: updateCustomAppValidator,
    })
    documented(router.post('/services/custom/update', [SystemController, 'updateCustomApp_pullLatest']), {
      summary: 'Pull the latest version of a custom app',
      tags: ['system'],
      request: installServiceValidator,
    })
    documented(router.delete('/services/custom', [SystemController, 'deleteCustomApp']), {
      summary: 'Delete a custom app',
      tags: ['system'],
      request: deleteCustomAppValidator,
    })
    documented(router.get('/services/custom/:name', [SystemController, 'getCustomApp']), {
      summary: 'Get a custom app',
      tags: ['system'],
    })
    documented(router.post('/services/links', [SystemController, 'createLinkTile']), {
      summary: 'Create a dashboard link tile',
      tags: ['system'],
    })
    documented(router.put('/services/links', [SystemController, 'updateLinkTile']), {
      summary: 'Update a dashboard link tile',
      tags: ['system'],
    })
    documented(router.delete('/services/links', [SystemController, 'deleteLinkTile']), {
      summary: 'Delete a dashboard link tile',
      tags: ['system'],
    })
    documented(router.put('/services/custom-url', [SystemController, 'setServiceCustomUrl']), {
      summary: 'Set a service custom URL',
      tags: ['system'],
      request: setServiceCustomUrlValidator,
    })
    documented(router.get('/services/:name/logs', [SystemController, 'getServiceLogs']), {
      summary: 'Get service logs',
      tags: ['system'],
      query: serviceLogsValidator,
    })
    documented(router.get('/services/:name/stats', [SystemController, 'getServiceStats']), {
      summary: 'Get service stats',
      tags: ['system'],
    })
    documented(router.get('/services/:name/available-versions', [SystemController, 'getAvailableVersions']), {
      summary: 'List available service versions',
      tags: ['system'],
    })
    documented(router.post('/services/update', [SystemController, 'updateService']), {
      summary: 'Update a service',
      tags: ['system'],
      request: updateServiceValidator,
    })
    documented(router.post('/services/auto-update', [SystemController, 'setServiceAutoUpdate']), {
      summary: 'Set service auto-update',
      tags: ['system'],
      request: setServiceAutoUpdateValidator,
    })
    documented(router.get('/apps/auto-update/status', [SystemController, 'getAppAutoUpdateStatus']), {
      summary: 'Get app auto-update status',
      tags: ['system'],
    })
    documented(router.get('/content/auto-update/status', [SystemController, 'getContentAutoUpdateStatus']), {
      summary: 'Get content auto-update status',
      tags: ['system'],
    })
    documented(router.post('/subscribe-release-notes', [SystemController, 'subscribeToReleaseNotes']), {
      summary: 'Subscribe to release notes',
      tags: ['system'],
      request: subscribeToReleaseNotesValidator,
    })
    documented(router.get('/latest-version', [SystemController, 'checkLatestVersion']), {
      summary: 'Check the latest available version',
      tags: ['system'],
      query: checkLatestVersionValidator,
    })
    documented(router.post('/update', [SystemController, 'requestSystemUpdate']), {
      summary: 'Request a system update',
      tags: ['system'],
    })
    documented(router.get('/update/status', [SystemController, 'getSystemUpdateStatus']), {
      summary: 'Get system update status',
      tags: ['system'],
    })
    documented(router.get('/update/logs', [SystemController, 'getSystemUpdateLogs']), {
      summary: 'Get system update logs',
      tags: ['system'],
    })
    documented(router.get('/auto-update/status', [SystemController, 'getAutoUpdateStatus']), {
      summary: 'Get system auto-update status',
      tags: ['system'],
    })
    documented(router.get('/settings', [SettingsController, 'getSetting']), {
      summary: 'Get a system setting',
      tags: ['system'],
      query: getSettingSchema,
    })
    documented(router.patch('/settings', [SettingsController, 'updateSetting']), {
      summary: 'Update a system setting',
      tags: ['system'],
      request: updateSettingSchema,
    })
  })
  .prefix('/api/system')

router
  .group(() => {
    documented(router.get('/list', [ZimController, 'list']), {
      summary: 'List installed ZIM files',
      tags: ['zim'],
    })
    documented(router.get('/list-remote', [ZimController, 'listRemote']), {
      summary: 'List remote ZIM files',
      tags: ['zim'],
      query: listRemoteZimValidator,
    })
    documented(router.get('/catalog-languages', [ZimController, 'listCatalogLanguages']), {
      summary: 'List the languages the Kiwix catalog holds books in',
      tags: ['zim'],
    })
    documented(router.get('/curated-categories', [ZimController, 'listCuratedCategories']), {
      summary: 'List curated ZIM categories',
      tags: ['zim'],
    })
    documented(router.post('/download-remote', [ZimController, 'downloadRemote']), {
      summary: 'Queue a remote ZIM download',
      tags: ['zim'],
      request: remoteDownloadWithMetadataValidator,
    })
    documented(router.post('/download-category-tier', [ZimController, 'downloadCategoryTier']), {
      summary: 'Download a ZIM category tier',
      tags: ['zim'],
      request: downloadCategoryTierValidator,
    })

    documented(router.post('/upload', [ZimController, 'upload']), {
      summary: 'Upload a ZIM file',
      tags: ['zim'],
    })
    documented(router.get('/wikipedia', [ZimController, 'getWikipediaState']), {
      summary: 'Get Wikipedia ZIM state',
      tags: ['zim'],
    })
    documented(router.post('/wikipedia/select', [ZimController, 'selectWikipedia']), {
      summary: 'Select a Wikipedia ZIM edition',
      tags: ['zim'],
      request: selectWikipediaValidator,
    })

    documented(router.get('/custom-libraries', [ZimController, 'listCustomLibraries']), {
      summary: 'List custom ZIM libraries',
      tags: ['zim'],
    })
    documented(router.post('/custom-libraries', [ZimController, 'addCustomLibrary']), {
      summary: 'Add a custom ZIM library',
      tags: ['zim'],
      request: addCustomLibraryValidator,
    })
    documented(router.delete('/custom-libraries/:id', [ZimController, 'removeCustomLibrary']), {
      summary: 'Remove a custom ZIM library',
      tags: ['zim'],
      params: idParamValidator,
    })
    documented(router.get('/browse-library', [ZimController, 'browseLibrary']), {
      summary: 'Browse a ZIM library',
      tags: ['zim'],
      query: browseLibraryValidator,
    })

    documented(router.post('/rescan-library', [ZimController, 'rescanLibrary']), {
      summary: 'Rescan the ZIM library',
      tags: ['zim'],
    })

    documented(router.delete('/:filename', [ZimController, 'delete']), {
      summary: 'Delete a ZIM file',
      tags: ['zim'],
      params: filenameParamValidator,
    })
  })
  .prefix('/api/zim')

router
  .group(() => {
    documented(router.get('/', [CreatorPacksController, 'index']), {
      summary: 'List creator packs',
      tags: ['creator-packs'],
    })
    documented(router.post('/:id/install', [CreatorPacksController, 'install']), {
      summary: 'Install a creator pack',
      tags: ['creator-packs'],
    })
    documented(router.delete('/:id', [CreatorPacksController, 'uninstall']), {
      summary: 'Uninstall a creator pack',
      tags: ['creator-packs'],
    })
  })
  .prefix('/api/creator-packs')

router
  .group(() => {
    documented(router.post('/run', [BenchmarkController, 'run']), {
      summary: 'Run a benchmark',
      tags: ['benchmark'],
      request: runBenchmarkValidator,
    })
    documented(router.post('/run/system', [BenchmarkController, 'runSystem']), {
      summary: 'Run a system benchmark',
      tags: ['benchmark'],
    })
    documented(router.post('/run/ai', [BenchmarkController, 'runAI']), {
      summary: 'Run an AI benchmark',
      tags: ['benchmark'],
    })
    documented(router.get('/results', [BenchmarkController, 'results']), {
      summary: 'List benchmark results',
      tags: ['benchmark'],
    })
    documented(router.get('/results/latest', [BenchmarkController, 'latest']), {
      summary: 'Get the latest benchmark result',
      tags: ['benchmark'],
    })
    documented(router.get('/results/:id', [BenchmarkController, 'show']), {
      summary: 'Get a benchmark result',
      tags: ['benchmark'],
    })
    documented(router.post('/submit', [BenchmarkController, 'submit']), {
      summary: 'Submit a benchmark result',
      tags: ['benchmark'],
      request: submitBenchmarkValidator,
    })
    documented(router.post('/builder-tag', [BenchmarkController, 'updateBuilderTag']), {
      summary: 'Update the builder tag',
      tags: ['benchmark'],
    })
    documented(router.get('/comparison', [BenchmarkController, 'comparison']), {
      summary: 'Get benchmark comparison data',
      tags: ['benchmark'],
    })
    documented(router.get('/status', [BenchmarkController, 'status']), {
      summary: 'Get benchmark status',
      tags: ['benchmark'],
    })
    documented(router.get('/rerun-banner', [BenchmarkController, 'rerunBanner']), {
      summary: 'Get the benchmark rerun banner state',
      tags: ['benchmark'],
    })
    documented(router.get('/settings', [BenchmarkController, 'settings']), {
      summary: 'Get benchmark settings',
      tags: ['benchmark'],
    })
    documented(router.post('/settings', [BenchmarkController, 'updateSettings']), {
      summary: 'Update benchmark settings',
      tags: ['benchmark'],
    })
  })
  .prefix('/api/benchmark')

// Drug Reference v1 — offline FDA drug-label search.
// Page GETs ungated (read-only views). The /api/drug-reference group mirrors
// the /api/maps posture — no localNetworkOnly gate because the only disk write
// is the background ingest job (server-side, triggered but not executed inline).
// /drug-reference/interactions must precede /drug-reference/:id so the literal
// path wins over the param route.
router.get('/drug-reference', [DrugReferenceController, 'index'])
router.get('/drug-reference/interactions', [DrugReferenceController, 'interactions'])
router.get('/drug-reference/:id', [DrugReferenceController, 'show'])
router
  .group(() => {
    documented(router.get('/search', [DrugReferenceController, 'search']), {
      summary: 'Search drug labels',
      tags: ['drug-reference'],
      query: searchDrugValidator,
    })
    documented(router.get('/status', [DrugReferenceController, 'status']), {
      summary: 'Get drug reference ingest status',
      tags: ['drug-reference'],
    })
    documented(router.get('/interactions', [DrugReferenceController, 'interactionsApi']), {
      summary: 'Check drug interactions',
      tags: ['drug-reference'],
      query: interactionsValidator,
    })
    documented(router.post('/download', [DrugReferenceController, 'download']), {
      summary: 'Download the drug label dataset',
      tags: ['drug-reference'],
    })
    documented(router.post('/ingest', [DrugReferenceController, 'ingest']), {
      summary: 'Ingest drug labels',
      tags: ['drug-reference'],
    })
    documented(router.post('/reset-ingest', [DrugReferenceController, 'resetIngest']), {
      summary: 'Reset the drug label ingest',
      tags: ['drug-reference'],
    })
    documented(router.post('/uninstall', [DrugReferenceController, 'uninstall']), {
      summary: 'Uninstall the drug reference dataset',
      tags: ['drug-reference'],
    })
    documented(router.get('/ingest-log', [DrugReferenceController, 'ingestLog']), {
      summary: 'Get the drug reference ingest log',
      tags: ['drug-reference'],
    })
  })
  .prefix('/api/drug-reference')

// "When to use what" — condition-first medical reference (Phase 1).
// Browse a curated grid of first-aid situations (or free-text search a
// situation) and see the matching OTC drugs, each linking to its Drug Reference
// detail. Read-only page GETs, ungated like the /drug-reference page GETs; the
// /api/conditions group only reads drug_labels (no disk write), so it mirrors
// the ungated /api/drug-reference posture.
router.get('/conditions', [ConditionsController, 'index'])
router.get('/conditions/:slug', [ConditionsController, 'show'])
router
  .group(() => {
    documented(router.get('/drugs', [ConditionsController, 'drugsApi']), {
      summary: 'List OTC drugs for a condition',
      tags: ['conditions'],
      query: conditionDrugsValidator,
    })
  })
  .prefix('/api/conditions')
