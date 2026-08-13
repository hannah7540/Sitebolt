/** Haversine distance between two GPS coordinates in meters. */
export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusM = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const ITC_COMPACTION_PROXIMITY_METERS = 2;

export function isWithinProximityMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  thresholdMeters = ITC_COMPACTION_PROXIMITY_METERS
): boolean {
  return haversineDistanceMeters(lat1, lng1, lat2, lng2) <= thresholdMeters;
}

export interface GpsCoordinate {
  lat: number;
  lng: number;
}

/** Normalize lat/lng pairs for map display (0–1 fractional coords within bounds). */
export function gpsToRelativeMapPosition(
  point: GpsCoordinate,
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }
): { x: number; y: number } {
  const latSpan = bounds.maxLat - bounds.minLat || 0.0001;
  const lngSpan = bounds.maxLng - bounds.minLng || 0.0001;
  return {
    x: (point.lng - bounds.minLng) / lngSpan,
    y: 1 - (point.lat - bounds.minLat) / latSpan,
  };
}

export function computeGpsBounds(points: GpsCoordinate[]): {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
} | null {
  if (points.length === 0) return null;

  let minLat = points[0]!.lat;
  let maxLat = points[0]!.lat;
  let minLng = points[0]!.lng;
  let maxLng = points[0]!.lng;

  for (const point of points) {
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
    minLng = Math.min(minLng, point.lng);
    maxLng = Math.max(maxLng, point.lng);
  }

  const pad = 0.00005;
  return {
    minLat: minLat - pad,
    maxLat: maxLat + pad,
    minLng: minLng - pad,
    maxLng: maxLng + pad,
  };
}
