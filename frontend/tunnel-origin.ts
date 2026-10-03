export function tunnelHost(value: string | undefined) {
  if (!value) return undefined;
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error("ODAN_TUNNEL_ORIGIN must be one exact HTTPS frontend origin"); }
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash ||
      url.username || url.password)
    throw new Error("ODAN_TUNNEL_ORIGIN must be one exact HTTPS frontend origin");
  return url.hostname;
}

type ForwardedHeaders = Record<string, string | string[] | undefined>;

export function restoredTunnelOrigin(headers: ForwardedHeaders, configuredOrigin: string | undefined) {
  const host = tunnelHost(configuredOrigin);
  if (!host || headers.origin !== "http://localhost:43187" ||
      headers["x-forwarded-host"] !== host || headers["x-forwarded-proto"] !== "https")
    return undefined;
  const tunnelOrigin = new URL(configuredOrigin).origin;
  const fetchSite = headers["sec-fetch-site"];
  if (fetchSite && fetchSite !== "same-origin") return undefined;
  const referer = headers.referer;
  if (referer) {
    if (typeof referer !== "string") return undefined;
    try { if (new URL(referer).origin !== tunnelOrigin) return undefined; }
    catch { return undefined; }
  }
  // A browser's same-origin fetch metadata or matching Referer must accompany
  // the tunnel headers; arbitrary forwarded headers alone cannot restore Origin.
  if (!fetchSite && !referer) return undefined;
  return tunnelOrigin;
}
