/** Local deterministic weather; no network, recordings or per-frame allocations. */
export type RoadsWeather = 'clear' | 'drizzle' | 'storm';

export function roadsWeather(search: string): RoadsWeather {
  const value = new URLSearchParams(search).get('weather');
  return value === 'clear' || value === 'drizzle' ? value : 'storm';
}
