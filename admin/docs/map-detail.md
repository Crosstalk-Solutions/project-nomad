# Available map detail

The indicator near the map scale shows the current camera zoom and the finest installed native detail at the **center of the map**. Click it for the data source and more detail. Zoom remains unrestricted: a red **Enlarged · no extra detail** warning means that further zoom magnifies the available data. Vector lines can stay sharp even when no new geometry is added.

**Mixed detail** means different native limits are visible across the current view, for example a detailed regional square over the worldwide satellite package. The indicator uses the center to decide whether to turn red. The details list the visible native limits and warn if coarser areas elsewhere in the view are already enlarged. Multiple overlapping packages with the same effective detail do not produce a mixed warning. A view entirely inside a detailed square does not report the covered worldwide layer as another resolution.

**Partial coverage** means that some visible areas have no installed data for the selected layer. Unknown metadata is reported as unavailable or checking, rather than treated as a known zoom limit. The Street overlay does not change the native detail of the underlying Satellite, Topography or Blue Marble layer.

## Resolution and terrain

The camera uses 512-pixel map zoom conventions. A 256-pixel archive at tile zoom 8 has its native camera limit at zoom 7; the details show both values. Approximate source sampling changes with latitude and is not geographic accuracy. A provider mosaic may contain resampled imagery or missing fine tiles within its declared coverage; archive metadata cannot certify sharpness at every point.

Topography reports the finest installed relief separately from **Contour data**. Contours use the numeric terrain actually rendered for the current view, including the worldwide fallback when a view extends beyond regional coverage. The fixed **100 m vertical interval** is a difference in elevation between contours, not the horizontal resolution of the terrain.

## Offline operation

The indicator uses installed layer metadata and, when necessary, headers from locally served PMTiles archives. It makes no external provider requests, starts no downloads and changes no Pins or map data. Native zoom information is cached for the page session. It remains available after restarting NOMAD without internet access.

Operators can enable this optional indicator with `MAP_DETAIL_INDICATOR_ENABLED=true` on the admin. No additional service, database table or API endpoint is required.
