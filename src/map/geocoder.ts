import { fetchWithTimeout, safeReadJson } from './http';

export interface GeocoderResult {
  id: string;
  label: string;
  subtitle: string;
  lng: number;
  lat: number;
}

interface NominatimItem {
  place_id: number;
  display_name: string;
  lon: string;
  lat: string;
  name?: string;
}

/**
 * Searches addresses and places across Finland & Nordics via OpenStreetMap Nominatim.
 * Can be swapped later for Digitransit Geocoding API without changing UI code.
 */
export async function searchAddress(
  query: string,
  signal?: AbortSignal
): Promise<GeocoderResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const params = new URLSearchParams({
    q: trimmed,
    format: 'jsonv2',
    limit: '5',
    countrycodes: 'fi,no,se',
    'accept-language': 'fi',
  });

  try {
    const response = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      {
        headers: {
          Accept: 'application/json',
        },
      },
      6000,
      signal
    );

    if (!response.ok) return [];
    const data = await safeReadJson<NominatimItem[]>(response);
    if (!Array.isArray(data)) return [];

    const results: GeocoderResult[] = [];
    for (const item of data) {
      const lng = Number(item.lon);
      const lat = Number(item.lat);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      const parts = item.display_name.split(',').map((s) => s.trim());
      const primary = item.name || parts[0] || item.display_name;
      const subtitle = parts.slice(1, 4).join(', ');
      results.push({
        id: String(item.place_id),
        label: primary,
        subtitle,
        lng,
        lat,
      });
    }
    return results;
  } catch {
    return [];
  }
}
