import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

// MapLibre GL v6 ships its worker as a separate ES module. Passing Vite's ?url
// import ensures the worker loads reliably in both Vite dev and production builds.
maplibregl.setWorkerUrl(maplibreWorkerUrl);

// Default is 16 shared slots for ALL raster sources. A slow overlay (GTK WMS can take
// 10–30 s per tile) would otherwise hold slots and leave base-map tiles grey.
maplibregl.setMaxParallelImageRequests(32);

export { maplibregl };
