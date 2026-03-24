// Lightweight audit metadata collector
export async function getAuditMeta() {
  const meta = {
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    screenSize: `${screen.width}x${screen.height}`,
    location: null,
  };

  // Approximate location via free IP geolocation (no GPS permission needed)
  try {
    const res = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const geo = await res.json();
      meta.location = { city: geo.city, region: geo.region, country: geo.country_name };
    }
  } catch {
    // Silent fail — location is optional
  }

  return meta;
}
