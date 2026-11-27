# Regional offline maps

Open **Settings → Maps → Regional offline maps** to install detailed squares while keeping your worldwide packages. This optional feature is separate from **World offline**, **Choose Countries**, and **Stored Map Files**. It does not replace or remove them.

## Select and download

1. Drag the map, use the directional buttons, or zoom to find your area. The globe between the arrows returns to the whole world and keeps your selection.
2. Selection is available only at navigation level **4**. A click at levels 1–3 briefly highlights **Zoom to 4 to select squares**. Click that message to zoom in. Dragging continues to move the map.
3. Click grey squares to select them for download. Use **Select block** to draw a rectangle. Right-click to deselect one square, **Clear selection** to remove all planned squares, or **Undo** to restore them. Green squares are already installed and cannot be selected again for download.
4. Select **Calculate**. NOMAD checks the source indexes and shows each area's transfer estimate, estimated installed total, and free space. An initial calculation can take longer while the public indexes are loaded. Remove an area with its **×**; adding a new area requires another calculation. Estimates remain available while you pan or zoom.
5. Select **Review download** and confirm the areas and total once. NOMAD downloads, prepares, and verifies the mandatory components automatically. Selections larger than 64 squares are estimated in bounded batches and admitted as one persistent queue. Follow verified squares, batch progress, transferred bytes and speed. **Cancel download** stops the queue safely; verified squares remain installed.

The progress card stays visible while the queue is running, preparing or verifying, and when an interrupted task needs recovery. After the entire task is complete and all selected squares appear in the verified installed inventory, the card disappears. A brief **N squares ready offline** confirmation appears only when that completion was observed on the open page, then clears after seven seconds. Reopening the page does not show old completed downloads or repeat their confirmation. Green squares remain the persistent indication of installed coverage. Transfer estimates, free space before confirmation and installed sizes when reviewing deletion are preserved.

Each square is a fixed XYZ zoom-8 cell, approximately 156 km wide at the equator and smaller at higher latitudes. Letters identify its column and numbers identify its row. The four navigation levels are interface views; they do not change the downloaded detail.

## Included detail

Every square includes Satellite, Earth Relief and its numeric elevation data for automatic 100 m contours, and Street. The current public sources support satellite/relief/elevation through native zoom 12 and Street through native zoom 15. Blue Marble remains a separate worldwide package. There is no layer picker for squares.

Image sharpness and elevation accuracy depend on the published source. Street is vector data; a high zoom is not a promise of surveyed positional accuracy. Fine relief does not guarantee an address, an open road, or a safe route.

In **Maps**, installed squares add their local detail automatically at closer zooms. The existing worldwide packages provide the view outside those squares. Contours use a union of adjacent installed squares on one native sampling grid. When the required regional coverage is incomplete, a coherent worldwide terrain grid remains the fallback if installed. The view remains 2D, contours retain their fixed 100 m vertical interval, and map clicks keep the normal Pins workflow.

The optional [map detail indicator](/docs/map-detail) distinguishes the native detail at the map center from mixed detail elsewhere in the view. It warns when zoom enlarges existing data while keeping zoom unrestricted.

## Offline use and storage

New downloads and source-index calculations need internet access. Once a square is verified, all its maps are served from NOMAD and remain usable after restart with the downloader stopped. The inventory also works without the downloader. A square is marked green only after all four archives pass verification and its inventory is committed.

There is no fixed download-size ceiling. NOMAD checks free space for all queued archives and preparation workspace before admission, and checks again for each batch. Individual calculations contain at most 64 squares to keep work bounded; the panel sequences them without an overall selection cap beyond the finite z8 grid. Admission validates all reviewed estimates before starting the queue. The queue and verified progress survive page reloads and restarts; interrupted preparation becomes a stopped task requiring an explicit retry.

### Recover a stopped preparation

**Retry** reuses saved source ranges with their pinned URL and ETag. **Finish preparation offline** is offered when all remaining ranges have saved checksums and the inventory revision is still compatible. It verifies every checksum before conversion, makes no provider request and can finish even when the original 24-hour estimate expired. An integrity failure stops safely instead of silently fetching replacement data.

If an estimate expired while some ranges are missing, or a public source was retired, use **Recalculate remaining squares**. The server returns only unverified coordinates and the panel obtains current estimates in batches. Review and confirm their new totals before anything downloads. Existing installed squares are preserved, and cache identities keep different source revisions separate. A task stopped after an inventory change also requires recalculation.

### Automatic maintenance

The regional download service automatically clears eligible expired metadata at startup and once per day while idle. It removes unreferenced estimates older than 24 hours and recognized provider indexes older than seven days. Opening a browser tab or starting a browser session does not trigger file deletion. Routine maintenance is recorded in the worker logs and needs no user action or internet connection. A maintenance failure leaves the installed maps available and is recorded for a later attempt.

Saved preparation for an interrupted download is preserved through restarts, including its referenced estimate, so **Retry** and **Finish preparation offline** remain available when their recovery conditions hold. Active downloads, a thread finishing cancellation, and source estimation are protected from cleanup. Unknown files, symlinks, installed archives and Pins are excluded. Successful preparations automatically remove their transfer checkpoints.

When abandoning a failed or cancelled task, use **Discard download** beside that task. Review the amount of saved preparation and confirm before discarding it. This removes the saved files needed for retry and dismisses the stopped task and its queue, including when no preparation bytes remain. Its coordinate list is no longer offered for retry or recalculation; select those squares again to start a new download. Verified installed squares are preserved. Routine temporary-file controls are not shown as a separate panel.

If an explicitly confirmed discard is interrupted, its recorded cleanup can finish during maintenance or after a restart. The service does not start a new regional download until that pending cleanup is complete.

With the recommended Compose overlay, regional PMTiles and their manifest live in `<NOMAD_STORAGE_PATH>/local-detail/pmtiles`, and worker checkpoints live in the sibling `.state` directory. The admin reads this storage at `/app/local-detail`. Without a `LOCAL_DETAIL_STORAGE_PATH` override, the admin defaults to `storage/maps/local-detail`; keep the admin and worker pointed at the same regional data. See the [regional setup guide](/docs/regional-setup). These paths do not own the worldwide files. **×** in a download estimate removes a planned area, never an installed archive.

## Delete installed squares

With no red download selection, click green installed squares to select them for deletion. The action below the map changes to **Delete**; review the areas and size in the confirmation before continuing. The action is hidden when nothing is selected. Download and deletion selections cannot be mixed; use **Clear selection** to switch. Right-click deselects, and **Undo** restores the selection type. Deletion choices are not saved across page reloads. Only the four archives owned by each selected square are removed. Unselected squares, worldwide packages, Choose Countries maps and Pins are preserved. Deletion works without internet access; the local worker must be running. Wait for any active download to stop completely, including after cancelling it.

The inventory removal is committed before disk cleanup. If a file cannot be removed immediately, the square stops being advertised and **Retry cleanup** finishes its recorded cleanup. Pending cleanup also appears after refreshing the panel; the worker attempts it again after restart. Repeating deletion is safe and does not touch other files. Until cleanup finishes, that square cannot be downloaded again. Actual reclaimed bytes may differ from the installed estimate because already missing files reclaim nothing.

Deletion invalidates old source estimates. Calculate again before submitting a download. A stopped task containing a deliberately deleted square no longer offers Retry that could reinstall it.

## Local API and operator setup

The optional `install/regional_maps_compose.yaml` overlay and `install/prepare_regional_maps.py` preflight configure the admin and reuse the existing World Offline worker. They enable `LOCAL_DETAIL_ENABLED` and `MAP_DETAIL_INDICATOR_ENABLED`, use the same private token, and put regional archives and worker state in separate persistent sibling directories. The admin's regional mount is read-only. Preserve the original world-storage permissions required by **Choose Countries**; do not expose a worker port or token publicly. A separate `WORLD_WORKER_LOCAL_ONLY=true` worker remains available for isolated deployments.

When the world directory is a read-only mount, set `LOCAL_DETAIL_STORAGE_PATH` to a separate admin mount ending in `local-detail` (for example `/app/local-detail`). This requires no new directory inside the shared world data. Serve only the managed PMTiles names through the regional static endpoint; never expose worker checkpoints or credentials.

`GET /api/maps/local-detail` returns verified cells, coverage bounds, archive revisions, installed bytes, current job, persistent `queue`, recovery capabilities, `temporaryStorage` and optional `cleanupPending` coordinates. `POST /calculate` accepts `{cells:[{x,y}]}` (1–64). `POST /queue` accepts `{batches:[{quoteId,excludedCells?:["8/x/y"]}],requestId?}`; a stable request ID makes admission retries idempotent. All quotes are checked before admission, with at most 1024 batches covering the finite worldwide grid. `POST /download` remains available for single-batch compatibility. `POST /cancel`, `/retry` and `/recalculate` accept `{id}`; recalculation returns authoritative remaining coordinates and starts no download. `POST /cleanup` accepts `{scope:"saved-preparation",id:discardId}` or `{scope:"expired-metadata"}`. Only queue admission accepts up to 1 MiB on the worker; ordinary operations retain their 8 KiB bound.

Successful `saved-preparation` cleanup abandons the stopped job and queue and returns `job: null` and `queue: null`. It also accepts an explicitly reviewed failed or cancelled task with zero saved bytes.

`POST /delete` accepts `{cells:[{x,y}]}` (1–64 per request) and returns `removed`, `alreadyAbsent`, `freedBytes`, `cleanupPending`, `generation`, and `job`. A 200 response with nonempty `cleanupPending` requires another cleanup attempt. HTTP 409 asks the caller to wait for the download thread, review changed cleanup data, or recalculate after an inventory/source change; HTTP 422 rejects invalid or unsafe ownership paths. Mutations require local, same-origin JSON requests. Installed archives are served with HTTP byte ranges under `/local-detail/pmtiles/`.

Sources: [VersaTiles tilesets](https://docs.versatiles.org/basics/tilesets.html), [Protomaps](https://docs.protomaps.com/pmtiles/), [OpenStreetMap attribution](https://www.openstreetmap.org/copyright), [Mapterhorn attribution](https://mapterhorn.com/attribution/). Each archive retains its provider attribution and revision.
