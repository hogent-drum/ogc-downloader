# Security notes

This build is intended for publication as a static web application.

Implemented safeguards:

- Apache security headers and CSP via `.htaccess` (when `mod_headers` is available).
- Leaflet 1.9.4 uses Subresource Integrity (SRI).
- JSZip 3.10.1 is bundled locally under `assets/vendor/jszip/`.
- OGC requests omit browser credentials and suppress the HTTP referrer.
- Public deployments accept only HTTPS OGC endpoints.
- Public deployments reject literal/private/local network targets such as localhost, RFC1918 IPv4, link-local/private IPv6 and common `.local`/`.lan`/`.internal` hostnames.
- Local HTTP endpoints remain usable only when the application itself runs on localhost.
- GetCapabilities/Describe XML responses are limited to 20 MB.
- Individual downloads are limited to 500 MB.
- Combined input for generated tile ZIPs is limited to 750 MB.
- Raster requests are limited to 100,000 pixels per side and 400 tiles.
- Filenames originating from remote `Content-Disposition` headers are sanitized.

The application remains fully client-side: OGC data travels directly between the visitor's browser and the selected OGC service. No PHP proxy or server-side downloader is included.

Note: Leaflet Draw and Proj4 remain pinned to explicit CDN versions because their package files were not available in the build environment. The CSP restricts script loading to the application origin, unpkg.com and cdnjs.cloudflare.com. If desired, those two libraries can later be copied into `assets/vendor/` and the CSP tightened to `script-src 'self'`.
