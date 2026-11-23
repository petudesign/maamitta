import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const mmlApiKey = env.MML_API_KEY ?? '';
  const mmlProxyEnabled = Boolean(mmlApiKey) || env.MML_PROXY_ENABLED === 'true';

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/maplibre-gl')) return 'vendor-maplibre';
            if (id.includes('node_modules/@turf')) return 'vendor-geo';
            if (
              id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/')
            ) {
              return 'vendor-react';
            }
            return undefined;
          },
        },
      },
    },
    server: {
      port: 5173,
      proxy: {
        // GTK Maaperäkartta WMS (same-origin proxy avoids CORS blocks in WebGL)
        '/api/gtk-wms': {
          target: 'https://gtkdata.gtk.fi',
          changeOrigin: true,
          // Don't let a slow GTK tile hang a browser image slot for 30 s+
          proxyTimeout: 9000,
          timeout: 9000,
          rewrite: (path) =>
            path.replace(
              /^\/api\/gtk-wms/,
              '/arcgis/services/Rajapinnat/GTK_Maapera_WMS/MapServer/WMSServer'
            ),
        },
        ...(mmlApiKey
          ? {
              // MML WMTS -karttatiilet (ortokuva, maastokartta, kiinteistöjaotus)
              '/api/mml-wmts': {
                target: 'https://avoin-karttakuva.maanmittauslaitos.fi',
                changeOrigin: true,
                rewrite: (path) => {
                  const clean = path.replace(/^\/api\/mml-wmts/, '/avoin/wmts/1.0.0');
                  const sep = clean.includes('?') ? '&' : '?';
                  return `${clean}${sep}api-key=${encodeURIComponent(mmlApiKey)}`;
                },
              },
              // MML Kiinteistötiedot OGC API Features (viralliset kiinteistöpalstat)
              '/api/mml-features': {
                target: 'https://avoin-paikkatieto.maanmittauslaitos.fi',
                changeOrigin: true,
                rewrite: (path) => {
                  const clean = path.replace(
                    /^\/api\/mml-features/,
                    '/kiinteisto-avoin/simple-features/v3'
                  );
                  const sep = clean.includes('?') ? '&' : '?';
                  return `${clean}${sep}api-key=${encodeURIComponent(mmlApiKey)}`;
                },
              },
              // MML Maastotietokanta OGC API Features (viralliset rakennuspolygonit)
              '/api/mml-maasto': {
                target: 'https://avoin-paikkatieto.maanmittauslaitos.fi',
                changeOrigin: true,
                rewrite: (path) => {
                  const clean = path.replace(
                    /^\/api\/mml-maasto/,
                    '/maastotiedot/features/v1'
                  );
                  const sep = clean.includes('?') ? '&' : '?';
                  return `${clean}${sep}api-key=${encodeURIComponent(mmlApiKey)}`;
                },
              },
            }
          : {}),
      },
    },
    define: {
      __MML_PROXY_ENABLED__: JSON.stringify(mmlProxyEnabled),
    },
  };
});
