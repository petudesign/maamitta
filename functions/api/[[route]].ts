/**
 * Cloudflare Pages Function — secure MML API proxy + edge tile cache.
 *
 * Keeps `MML_API_KEY` strictly server-side as a Cloudflare Pages secret while
 * caching successful WMTS tiles (24h) and feature queries (1h) at the edge.
 */

interface Env {
  MML_API_KEY?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
  params: { route?: string[] };
}

const UPSTREAMS: Record<
  string,
  {
    origin: string;
    pathPrefix: string;
    ttlSeconds: number;
    requiresMmlKey: boolean;
    /** Abort slow upstreams so they don't tie up the browser's tile slots */
    timeoutMs?: number;
  }
> = {
  'mml-wmts': {
    origin: 'https://avoin-karttakuva.maanmittauslaitos.fi',
    pathPrefix: '/avoin/wmts/1.0.0',
    ttlSeconds: 86_400,
    requiresMmlKey: true,
  },
  'mml-features': {
    origin: 'https://avoin-paikkatieto.maanmittauslaitos.fi',
    pathPrefix: '/kiinteisto-avoin/simple-features/v3',
    ttlSeconds: 3_600,
    requiresMmlKey: true,
  },
  'mml-maasto': {
    origin: 'https://avoin-paikkatieto.maanmittauslaitos.fi',
    pathPrefix: '/maastotiedot/features/v1',
    ttlSeconds: 3_600,
    requiresMmlKey: true,
  },
  'gtk-wms': {
    origin: 'https://gtkdata.gtk.fi',
    pathPrefix: '/arcgis/services/Rajapinnat/GTK_Maapera_WMS/MapServer/WMSServer',
    ttlSeconds: 604_800,
    requiresMmlKey: false,
    timeoutMs: 9_000,
  },
};

function hasUnsafeSegment(segments: string[]): boolean {
  return segments.some((seg) => {
    const decoded = decodeURIComponent(seg);
    return (
      decoded === '..' ||
      decoded === '.' ||
      decoded.includes('..') ||
      decoded.includes('\\') ||
      decoded.includes('\0')
    );
  });
}

export const onRequestGet = async (context: PagesContext): Promise<Response> => {
  const segments = context.params.route ?? [];
  const prefix = segments[0];
  if (!prefix || !(prefix in UPSTREAMS)) {
    return new Response('Unknown proxy route', {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const target = UPSTREAMS[prefix]!;
  const apiKey = context.env.MML_API_KEY;
  if (target.requiresMmlKey && !apiKey) {
    return new Response('MML_API_KEY secret is not configured', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const restSegments = segments.slice(1);
  try {
    if (hasUnsafeSegment(restSegments)) {
      return new Response('Invalid path', {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
  } catch {
    return new Response('Malformed path encoding', {
      status: 400,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  let upstreamUrl: URL;
  try {
    const restPath = restSegments.join('/');
    upstreamUrl = new URL(
      restPath
        ? `${target.origin}${target.pathPrefix}/${restPath}`
        : `${target.origin}${target.pathPrefix}`
    );
    // Double-check normalized URL stays strictly inside allowed origin and prefix
    if (
      upstreamUrl.origin !== target.origin ||
      (upstreamUrl.pathname !== target.pathPrefix &&
        !upstreamUrl.pathname.startsWith(`${target.pathPrefix}/`))
    ) {
      return new Response('Invalid upstream path', {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
  } catch {
    return new Response('Malformed URL', {
      status: 400,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const incomingUrl = new URL(context.request.url);
  incomingUrl.searchParams.forEach((value, key) => {
    if (key.toLowerCase() !== 'api-key') {
      upstreamUrl.searchParams.set(key, value);
    }
  });
  if (target.requiresMmlKey && apiKey) {
    upstreamUrl.searchParams.set('api-key', apiKey);
  }

  const isTileOverlay = prefix === 'gtk-wms';
  const emptyTile = () =>
    new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

  const controller = target.timeoutMs ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), target.timeoutMs)
    : null;

  try {
    const upstreamRes = await fetch(upstreamUrl.toString(), {
      signal: controller?.signal,
      cf: {
        cacheEverything: true,
        cacheTtlByStatus: {
          '200-299': target.ttlSeconds,
          '400-599': 0,
        },
      },
    } as RequestInit);

    // WMS servers report errors as XML with HTTP 200 — never cache or forward those as tiles
    if (
      isTileOverlay &&
      !(upstreamRes.headers.get('content-type') ?? '').startsWith('image/')
    ) {
      return emptyTile();
    }

    const headers = new Headers(upstreamRes.headers);
    headers.delete('set-cookie');

    if (upstreamRes.ok) {
      headers.set(
        'Cache-Control',
        `public, max-age=${target.ttlSeconds}, stale-while-revalidate=3600`
      );
    } else {
      headers.set('Cache-Control', 'no-store');
    }

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers,
    });
  } catch {
    // Slow/unavailable overlay: return an empty tile quickly instead of hanging the map
    if (isTileOverlay) return emptyTile();
    return new Response('Upstream service unavailable', {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
};
