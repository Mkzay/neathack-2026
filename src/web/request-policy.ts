const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

export function acceptsLocalRequest(request: Request, mutation: boolean): boolean {
  const url = new URL(request.url);
  if (!localHosts.has(url.hostname.toLowerCase())) return false;
  const host = request.headers.get('host') ?? url.host;
  let externalOrigin: URL;
  try { externalOrigin = new URL(`${url.protocol}//${host}`); }
  catch { return false; }
  if (!localHosts.has(externalOrigin.hostname.toLowerCase()) || externalOrigin.port !== url.port) return false;
  if (mutation && request.headers.get('origin') !== externalOrigin.origin) return false;
  return true;
}
