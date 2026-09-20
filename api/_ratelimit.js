// Tiny in-memory per-IP rate limiter for serverless functions.
// Best-effort: works per-instance, CDN cache handles the rest.
const buckets = new Map();

export function rateLimit(req, res, { windowMs = 60000, max = 60 } = {}) {
  const ip =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  const now = Date.now();
  const key = `${ip}`;
  let entry = buckets.get(key);
  if (!entry || now - entry.start > windowMs) {
    entry = { start: now, count: 0 };
  }
  entry.count += 1;
  buckets.set(key, entry);
  // Opportunistic cleanup.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (now - v.start > windowMs) buckets.delete(k);
    }
  }
  const remaining = Math.max(0, max - entry.count);
  res.setHeader('X-RateLimit-Limit', String(max));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  if (entry.count > max) {
    res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
    res.status(429).json({ error: 'Rate limited. Slow down.' });
    return false;
  }
  return true;
}
