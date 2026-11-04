// Open-Meteo Air Quality API (CAMS forecast), shared by the Worker and the page's direct fallback.
const OM = 'https://air-quality-api.open-meteo.com/v1/air-quality';

export function omUrl(points) {
  const lat = points.map((p) => p.lat).join(',');
  const lon = points.map((p) => p.lon).join(',');
  return `${OM}?latitude=${lat}&longitude=${lon}&hourly=pm2_5,pm10&timezone=Asia%2FKolkata&forecast_days=2`;
}

// One object per location (Open-Meteo returns an array when several are asked at once).
export function toHourly(om) {
  const h = om.hourly;
  return h.time.slice(0, 48).map((time, i) => ({ time, pm25: h.pm2_5[i], pm10: h.pm10[i] }));
}
