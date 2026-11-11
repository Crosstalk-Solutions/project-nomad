# Maps — Offline Countries, Coordinates and Routes

Use [Maps](/maps) to explore downloaded maps, choose coordinate points and plan a car or walking route. Use [Maps Manager](/settings/maps#offline-regions) to install and manage country or provider-published regional route packages.

## Enter coordinates or choose a saved point

The top field and each route card accept decimal **latitude, longitude**, for example `-23.5505, -46.6333`. NOMAD validates coordinates in the browser. Use the map or a saved pin when you know the location by sight or name.

Press **Enter** or select the local coordinate suggestion to use the point; **Esc** closes the suggestion. The top field fills the highlighted route point when one is selected. Otherwise it opens a point preview with route and pin actions. A point chosen from **Pins** or Base keeps its saved name and coordinates. Editing the field clears the old resolved location until valid coordinates or another saved/map point is chosen.

### Optional home or Base

Use **Optional saved Base** to save the map center or a selected point, then **Use Base coordinates** to recall it. Base can be your home, emergency meeting point or another reference. It is saved only in this browser, not as a shared NOMAD setting. Clearing browser data can remove Base; shared Pins remain independent. Browser storage failures are shown explicitly. No lookup database or online service is needed.

### Saved pins and map controls

Use **Pins** to manage saved locations and assign a selected pin to the highlighted route card. Marker names, notes, colors and icons remain available locally. Changing a marker's appearance does not change its coordinate. Deleting or editing a pin does not accidentally assign a route point.

The map has zoom, fullscreen, coordinate display and scale controls. Route distances and API coordinates use the units in the API reference.

## Choose route points and stops

1. Open the **Offline routes** panel.
2. Select **A · Origin** or its map-selection button. The active point is highlighted.
3. Click the map, a map pin or a name in the **Pins** panel to fill that point with coordinates.
4. Select **B · Destination** and choose its location in the same way.
5. Optionally add another destination, up to seven points in total (A–G). The last point is always the destination; the points between the origin and destination are stops.
6. Choose **Car** or **Walking**, then calculate the route.

The selected point stays active so another click can adjust it. Selecting another point changes the target. Press **Esc** to leave map selection. Choosing a pin fills only the highlighted point; editing or deleting a pin does not assign it to the route.

Drag the point cards to change their order, or use their move-up and move-down buttons. Letters **A–G** follow the new order: **A** is the origin and the last letter is the destination. For example, adding **C** makes **B** an intermediate stop. With all seven points, **B–F** are the five intermediate stops and **G** is the final destination. The highlighted card remains selected when moved. Changing, removing or reordering points clears the previous result so its distance and time do not describe an outdated trip.

Use the card's grip with a mouse or touch to drag the whole card. A floating preview and reserved space show its destination while the other cards slide aside. Moving near the top or bottom of the panel scrolls the point list. Release inside the list to confirm; press **Esc** or release outside it to cancel. The preview does not change the route or its map markers until the move is confirmed.

Move-up, move-down and **Reverse** also slide the cards into their new positions in about 220 milliseconds. Coordinates, expanded inputs, keyboard focus and the selected point stay attached to their card. The interface respects your system's reduced-motion preference. These effects run locally and require no Internet connection.

Use coordinates for a specific location, or choose the map or an existing pin. Saved-pin names remain visible when selected, while coordinate input never searches names or codes.

### Read and keep directions

The result shows distance and estimated time for the whole journey, followed by directions for each consecutive pair of points: **A → B**, **B → C**, and onward to **F → G** when all seven points are present (up to six legs). Long direction lists are paginated within each leg.

Open the full directions as a single text file in a new tab to read or print all legs together. A download option lets you keep the same text locally. The text is generated in your browser from the calculated offline route; opening it does not contact an online routing service. Recalculate and export again after changing the trip.

Maneuver instructions are narrated in English. Proper street and place names retain the names in the downloaded data. The complete text export uses the same English instructions as the route panel.

All points must be routable within one installed connected graph. Adding stops does not join separate country graphs. Times use the downloaded road network and selected profile, without live traffic or a delay allowance for time spent at stops.

### When walking fails but car routing succeeds

The same graph can allow different paths for car and walking travel. The engine also has profile-specific request limits. Its current walking distance limit is 250 km; a longer request can return **DISTANCE_LIMIT_EXCEEDED** even when every point is inside installed coverage. This is not a request to download the same region again. Calculate separate shorter journeys; adding stops within one request does not remove the engine limit. NOMAD never silently changes Walking to Car.

Errors distinguish missing coverage from disconnected paths, unusable access points, a busy service and timeouts. For access/connectivity errors, try a nearby usable road or path. Only a genuine coverage error recommends a graph covering the whole journey. No online route fallback is used.

## Configure routing data

Choose **Routing region** in [Maps Manager → Routing](/settings/maps#routing-settings). **Automatic — recommended** selects an installed graph covering the whole journey. A fixed region limits ordinary routes to that installed graph. Changing the selection saves it automatically for this NOMAD, including offline use; no Save button or success message is shown. When several choices are made quickly, the last selection is the one retained. A save failure is shown explicitly so an unconfirmed preference is not mistaken for a saved one.

The navigation map contains the trip controls. The result identifies the data used. If a fixed region is removed, choose another installed region or Automatic in settings; NOMAD does not silently substitute a different graph. An explicit region in a map link or API request overrides the saved preference for that request.

## Copy coordinates

A simple **right-click on the map** copies `latitude, longitude` and shows a confirmation. It does not change the route points. Dragging with the right mouse button remains a navigation gesture and does not copy coordinates.

If the browser refuses clipboard access, use the displayed coordinates and the manual copy fallback. Clipboard access is handled locally by your browser; no online coordinate service is required.

## Visual maps and route packages

| Data          | What it provides                                                                      |
| ------------- | ------------------------------------------------------------------------------------- |
| Visual map    | Map images, labels and roads drawn from installed PMTiles archives                    |
| Route package | A locally prepared road graph for car/walking distance, estimated time and directions |
| Pins / Base   | Your saved coordinate points, independent of downloaded route packages                |

Use **Choose Countries** or **Curated Map Regions** in Maps Manager to download detailed visual coverage. Use **Install routes** under **Offline territories** to prepare the graph for car and walking directions. These downloads serve different purposes and can be installed separately.

## Countries, territories and published regions

**Offline territories** is the main entry point after the optional local routing services are configured. Use **Find a country or published region** to locate a download unit, with **All**, **Installed**, **In progress** and **Needs attention** filters. Open **Advanced regions** to choose smaller extracts published by the provider. For example, Geofabrik publishes Brazil's **Centro-Oeste, Nordeste, Norte, Sudeste and Sul** regions.

World, continents and cross-country collections help you browse installable territories. An installed Brazil graph provides routes within its coverage on its own. Prepared graphs imported through an administrator-configured catalog can also participate in routing when their manifests declare their country and coverage.

Each trip uses one installed graph. Independently installed countries are not joined. For a Brazil/Argentina journey, plan a separate trip within each country's available connected graph. No automatic border connector, continent installation or online fallback is added.

Select a name to open its inline controls. Geographic expansion and management selection remain separate; one panel is open at a time. Filters can find installed data, active tasks and regions needing attention. Status updates retain selection and expanded branches. Keyboard navigation and **Esc** return focus to the selected territory.

Collapsed branches summarize activity at the nearest visible ancestor. Expanding a branch reveals the actual owning task; descendants do not gain independent download indicators just because they use a parent package. Activity outside a filter remains discoverable. An indicator describes work, not installed readiness.

## Install and manage routes

Choose a published country or subregion and **Install routes**. Review the transfer and space estimates in the confirmation dialog. After confirmation, NOMAD obtains the OSM PBF, verifies it, builds the local road graph and publishes the verified package. When a matching complete source is already local, the same action reuses it and starts preparation.

The controls describe the selected route task. **Ready offline** means its graph has been published. A downloaded source at 100% is not yet a ready route package. Installed or inherited coverage identifies its owning region; removing that owner removes the coverage it supplies to descendants. Original visual-map **Active Downloads** remains at the end of settings; route-source transfer and preparation are managed with their territory.

### Transfer, source size and preparation space

Transfer required, local source size, final graph size and preparation space are different measurements. **No download required** with a local-source size means processing reuses that file; it is not another transfer. Unknown source sizes are not shown as zero. Last-known provider sizes are marked when fresh metadata cannot be checked.

There is no fixed source-file size ceiling. NOMAD checks actual free space against a conservative preparation estimate, including temporary work. Windows/WSL deployments can also check the physical Windows volume holding the Linux disk; the smaller available value is used. The estimate is not a reservation or an exact final-size prediction. Large inputs can still exceed available memory or practical processing time.

Geofabrik transfers may use the specifically supported GWDG mirror at `ftp5.gwdg.de`. Supported providers and redirects remain checked. Arbitrary browser-supplied URLs, custom regions and planet/continent downloads are not enabled.

### Follow, cancel and retry a task

Task status distinguishes waiting, source transfer, verification, route preparation and publication. During preparation, the substep can show administrative data, road-network tiles or graph packaging. A step number is workflow position, not total elapsed-work percentage.

Transfers show measured bytes, speed and remaining time when available. Preparation reports available counters or activity. Percentages require a known total; otherwise the indicator remains indeterminate. ETA ranges describe the current step only and can use labeled local history. **Estimating remaining time…** means there is not enough evidence for a useful estimate.

**Last progress** describes advancing work; **Worker last responded** is a heartbeat. Lack of a new percentage does not alone prove failure. Unavailable status retains the last observation and offers refresh rather than starting duplicate work.

Use **Cancel** to request a stop, then wait for acknowledgement. Installed route data is preserved. **Retry** applies to confirmed stopped/retryable work and retains its captured source/intent. A valid completed cached source is reused locally; an incomplete transfer can need provider connectivity. A retry does not silently request a newer source snapshot.

Source details, coverage, installed version and errors are available under **Details**. An imported graph uses the coverage declared by its manifest.

## Check and apply updates

Use **Check source updates** for the selected region or the installed components. This checks public source metadata and does not download replacement datasets or start preparation.

| Update result          | Meaning                                                                |
| ---------------------- | ---------------------------------------------------------------------- |
| Up to date             | The source check confirms no announced change from the installed input |
| Update available       | The public input differs from the installed version                    |
| Not checked            | No source check has been recorded                                      |
| Unknown or unavailable | The source could not be checked or did not provide enough information  |

The last check time is separate from the data's reference date. Without Internet, installed maps remain usable and the last known check remains visible. An unsuccessful check is not proof that the data is current.

The check concerns the published source dataset. It does not check for a new NOMAD software release or rebuild a graph merely because its preparation algorithm changed.

For inherited coverage, updates belong to the graph supplying the data. Open its territory to install a newer routing source. The current graph remains available until a verified replacement is published.

Refreshing the catalog discovers provider-published regions. It does not install every new entry, create smaller custom regions, or delete existing local files.

## Open a trip from a local link

Map links can fill route points without a chat or another application:

```text
/maps?origin=-22.9068,-43.1729&destination=-23.5505,-46.6333&profile=auto
```

The example fills points and selects car routing. Add `autoroute=1` to calculate automatically using installed data. `profile=pedestrian` selects walking.

Optional `via1` through `via5` add up to five ordered intermediate points between `origin` and `destination`. Vias must be contiguous: `via2` requires `via1`, and so on. Each value is `latitude,longitude`. Existing two-point and two-via links remain valid. For example:

```text
/maps?origin=-22.9068,-43.1729&via1=-22.9100,-43.1750&via2=-22.9150,-43.1800&destination=-22.9200,-43.1850&profile=pedestrian
```

Use `region` to select a graph ID returned by the routing coverage API, such as `regions:brazil`. An optional `version` pins that graph's exact installed version and requires `region`. If the requested graph or version is missing, NOMAD shows an error instead of silently using another dataset. Invalid coordinate or profile parameters do not calculate a route.

Links configure a temporary map view. They do not save pins, install data or start downloads. Older marker links using `lat`, `lng` and `zoom` remain supported.

## Use the local API

[API Reference](/reference#tag/maps) documents requests and responses, and [OpenAPI JSON](/api/openapi.json) provides the machine-readable contract. Both are served by this NOMAD. They can be used by local scripts and other clients without an AI integration.

Coordinates in API requests are WGS84 `{lat, lon}` objects. GeoJSON route coordinates are `[longitude, latitude]`. Route distances are meters and durations are seconds. An installation uses a catalog ID such as `brazil`; a routing selection uses a graph ID such as `regions:brazil`.

`POST /api/maps/route` accepts an ordered `locations` array of two to seven points. Each consecutive pair produces a leg. The response retains the total distance, duration, geometry and combined maneuver list, and adds `legs` with zero-based `fromIndex` and `toIndex`, leg distance, duration and maneuvers. This HTTP contract is available to ordinary local clients; it does not require an AI module.

## Prepare before going offline

Install the needed visual maps and route packages, save useful Pins/Base points, and test known trips while Internet is available. Once provisioned, viewing maps, recalling saved points and calculating routes work offline. New source downloads, catalog refreshes and fresh update checks require access to their public providers.

Routing estimates use the downloaded road network. Live traffic and temporary closures are not available offline. Disconnected roads, access restrictions or limited source coverage can prevent a route; a larger visual map alone cannot supply those missing components.
