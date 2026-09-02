# Android APK download delivery

The APK download URL is:

`https://afri-logistics.com/downloads/afri-logistics-android.apk`

## Origin configuration

The production frontend is served by Nginx behind Caddy. Its APK route is configured to:

- return `Content-Type: application/vnd.android.package-archive`;
- force a clear Android installer filename;
- support and advertise byte-range requests with `Accept-Ranges: bytes`;
- avoid compression or page preloading of the 177 MB installer;
- cache the file in browsers for one hour, then revalidate it.

Byte ranges allow Chrome and download managers to request different parts of the installer concurrently. Verify the origin after a deployment:

```bash
curl -sS -D - -o /dev/null --range 0-1023 \
  https://afri-logistics.com/downloads/afri-logistics-android.apk
```

The response must be `206 Partial Content`, with `Content-Range` and
`Accept-Ranges: bytes`.

## Cloudflare CDN rollout

This is the remaining improvement for users far from the VPS. It requires the
domain owner to have access to the Afri Logistics DNS/Cloudflare account.

1. Add `afri-logistics.com` to Cloudflare and change the registrar name servers
   to the name servers Cloudflare provides.
2. Recreate the existing DNS records and ensure the `afri-logistics.com` record
   is **Proxied** (orange cloud). Keep the current VPS as the origin.
3. In **Rules → Cache Rules**, create a rule matching:
   `http.request.uri.path eq "/downloads/afri-logistics-android.apk"`
4. Set the rule to cache the file at Cloudflare’s edge and respect the origin
   cache-control header (one hour), or explicitly use an edge TTL of one hour.
5. Download the APK once, then check the response headers. A later request
   should show `CF-Cache-Status: HIT`.
6. When publishing a replacement APK at the same URL, purge this single URL in
   Cloudflare. The one-hour browser cache limit also ensures clients update
   promptly.

Do not enable a broad “cache everything” rule for the website or API. Limit the
cache rule to the single APK path above.
