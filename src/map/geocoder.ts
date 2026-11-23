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

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    {
      signal,
      headers: {
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) return [];
  const data = (await response.json()) as NominatimItem[];

  return data.map((item) => {
    const parts = item.display_name.split(',').map((s) => s.trim());
    const primary = item.name || parts[0] || item.display_name;
    const subtitle = parts.slice(1, 4).join(', ');
    return {
      id: String(item.place_id),
      label: primary,
      subtitle,
      lng: Number(item.lon),
      lat: Number(item.lat),
    };
  });
}
