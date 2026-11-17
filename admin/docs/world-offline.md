# World offline maps

Open **Settings → Maps**, then find **World offline** under **Offline imagery and topography**. Install worldwide imagery, shaded relief, or elevation data and use them in **Maps → Layers**.

| Layer | What it shows | Native zoom choices |
| --- | --- | --- |
| **Blue Marble 2004** | NASA's historical monthly composites for January through December 2004. Use the month selector to compare seasons in the same view. | 0–4, 0–6, or 0–8 |
| **Worldwide satellite** | VersaTiles satellite and orthophoto mosaics. Image detail varies with location and source coverage. | 0–8 through 0–12 |
| **Earth Relief** | VersaTiles shaded relief for visual terrain reference, with a local land and water background. | 0–8 through 0–12 |
| **Elevation** | Numeric terrain heights for point inspection, A–B profiles, and contour lines in 2D. | 0–6 through 0–12 |

**Street** remains available for the vector basemap. **Street overlay** adds available roads and labels to your selected imagery or relief. Install the relevant street map data when you need detailed offline labels.

## Install and verify a map

1. Select **Review download** for a level in **World offline**. Choose **Upgrade** if you already have a lower level installed.
2. Check the available disk space, remaining transfer, and space required for preparation. Then start the operation.
3. Follow the download, preparation, and verification in **Active Downloads**. The row shows **Installed** when the package is ready. Blue Marble prepares and verifies all 12 months.
4. Select **Open map** or switch to the layer from **Maps → Layers**. Pan and zoom to the area you want to use offline.
5. To check offline use, keep your device connected to your local NOMAD and disconnect its internet access. Reload **Maps**, open the installed layer, and pan and zoom again. For Blue Marble, switch between months as well.

Your NOMAD retrieves source data from NASA or VersaTiles and prepares the map on your storage. After installation, your browser gets the selected layer from your NOMAD over the local connection. Keep a local connection to NOMAD when using it from another device.

## Inspect elevation offline

1. In **Settings → Maps → World offline**, install one **Elevation** package. The seven choices range from zoom 0–6 to 0–12.
2. In **Maps → Layers**, select **Topography** and turn on **Inspect elevation**.
3. Click or tap the map for an approximate elevation in meters and the data zoom used. Select **Done** to leave inspection mode.

The lookup uses the installed elevation archive in the 2D map and works independently of the download worker. The resolution beside each package is the horizontal spacing between samples at the equator. Elevation accuracy also depends on the provider data. [Elevation data © Mapterhorn](https://mapterhorn.com/attribution) · [VersaTiles Elevation](https://docs.versatiles.org/basics/tilesets.html#elevation)

With only Elevation installed, Topography uses the existing Street basemap as its background. Install Earth Relief when you also want shaded terrain behind the elevation tools.

## Compare elevation between two points

1. In **Maps → Layers → Topography**, turn on **Elevation profile**.
2. Select two points on the map. The graph shows the approximate elevation along the direct line from A to B, with gaps where the installed data has no samples.
3. Move across the graph or use **Inspect sample** to locate a sample on the map. Select **New line** to start over or **Done** to return to the normal map controls.

The profile shows the distance between samples and the elevations at A and B, the lowest sample, and the highest sample. Long lines use wider spacing to keep the calculation responsive. Its distance follows the direct line between the points.

## Show contour lines

In **Maps → Layers → Topography**, turn on **Contour lines (100 m)** and zoom in to the area you want to inspect. NOMAD calculates and labels the contours for the visible area using the installed elevation data. The lines follow the resolution of that package, so small terrain features can be absent. You can keep the contours visible while comparing elevations with the profile.

The 100 m interval is the vertical difference between adjacent contour levels. The installed package determines horizontal sample spacing. For example, elevation zoom 8 provides approximately 306 m spacing at the equator, even when the map is zoomed further in. The map asks you to zoom in when the visible area would require too many calculations or line points. Contours start disabled and use a bounded memory cache after activation.

## Compare levels and storage

- **Zoom** runs from the world overview at zero to the package's most detailed native level. **Included in zoom 11**, for example, means the active level already supplies those lower zooms.
- **Resolution** is a reference scale at the equator. Blue Marble also shows the nominal source resolution of 8 km, 2 km, or 500 m per pixel. Actual geographic detail varies with latitude and source imagery.
- **Full download** is the estimate for a fresh transfer. The confirmation shows the remaining transfer for the selected operation, including recoverable progress or local data where supported.
- **On disk** reports the installed archive size for an active package. A size with **About** is an estimate. The confirmation separately reports the free space needed while preparing the package.

| Example package | Full download estimate | Installed example |
| --- | ---: | ---: |
| Blue Marble 2004, zoom 0–8 | 4.32 GB | 3.52 GB |
| Worldwide satellite, zoom 0–11 | 31.32 GB | 31.31 GB |
| Earth Relief, zoom 0–10 | 12.01 GB | 12.99 GB |
| Elevation, zoom 0–8 | 3.21 GB | 3.21 GB |

These are reference measurements in decimal GB. Use the confirmation in your NOMAD as the current disk-space guide. A replacement can temporarily require space for the existing package, source downloads, staging files, and a new archive.

## Manage installed maps

- **Upgrade** prepares a more detailed package. The current map stays available while NOMAD prepares and verifies its replacement.
- **Manage → Reduce detail** keeps a lower level using the installed data. Review the proposed level and disk changes before confirming. NOMAD activates the replacement after verification.
- **Manage → Remove** deletes the active package for that layer after confirmation. The other installed layers remain available.
- **Pause** saves recoverable progress where the source and phase allow it. **Resume** continues the task. **Retry** starts another attempt after a stopped operation. NOMAD can reuse valid checkpoints and begins a fresh transfer where the saved source version has changed.
- **Free partial files** clears saved transfer and preparation data for an eligible failed or cancelled task. Installed packages stay available. A later attempt can need a fresh transfer.

To restore a removed or reduced level, select that level again. If you maintain backups, use a consistent snapshot of the maps volume and its archive inventory together. See the [operator and maintainer notes](/docs/world-offline-maintainers) for backup checks.

## Troubleshoot a download

| What you see | What to do |
| --- | --- |
| Free-space warning | Check the confirmation's required space. Free space or select a lower level. Keep extra space for a replacement of an installed package. |
| Paused or failed transfer | Confirm that the provider is reachable and try Resume or Retry. A completed older package remains usable. |
| Download service unavailable | Try opening an installed map. Starting or changing a package requires a running download service. |
| Map sharpness stops increasing | Compare your zoom with the installed native maximum and the source coverage for that location. |
| Different seasons look similar | Use a location with visible seasonal changes and compare two months at the same zoom. Blue Marble depicts historical composites from 2004. |

Source and attribution details live in the [operator and maintainer notes](/docs/world-offline-maintainers). Local automation can use the [World offline API notes](/docs/world-offline-api).
