# OGC Layer Definition & Download Builder v12

Statische browsertool voor WFS, WMS en WCS: GetCapabilities, laag/coverage-selectie, BBOX, downloads en export naar ArcGIS Pro LYRX, QGIS QLR en OGC SLD.

## Publicatie

Kopieer de volledige inhoud van deze map naar de webmap, **inclusief `.htaccess` en `assets/vendor/`**. Er is geen PHP, database of server-side proxy nodig.

Voor publieke hosting hoort de site via HTTPS aangeboden te worden. De applicatie weigert op een publieke host zelf HTTP OGC-endpoints en duidelijke lokale/private netwerkadressen. Bij lokale ontwikkeling op `localhost` blijven lokale HTTP-services toegestaan.

## Security hardening in v12

- `.htaccess` voegt CSP en gangbare security headers toe zonder wijziging aan de centrale Apache-configuratie.
- Leaflet 1.9.4 is vastgepind en voorzien van SRI-controle.
- JSZip 3.10.1 wordt lokaal meegeleverd.
- Requests sturen geen browsercredentials of referrer mee.
- Limieten: XML 20 MB, individuele downloads 500 MB, tile-ZIP input 750 MB, maximaal 400 tegels en maximaal 100.000 pixels per rasterzijde.
- Bestandsnamen uit externe `Content-Disposition` headers worden gesanitized.
- Dotfiles en veelvoorkomende backup/config-bestanden worden via `.htaccess` afgeschermd.

Zie `SECURITY.md` voor details.

## WCS multipart

De bestaande v11-logica voor WCS `multipart/related` blijft behouden: het binaire rasterdeel wordt uit de multipart-response gehaald, TIFF-signatures worden gecontroleerd en GML/XML-metadata kan afzonderlijk in tegel-ZIPs worden bewaard.


## v13 - Leaflet tile placement

Added local critical Leaflet positioning CSS and deferred `invalidateSize()` handling. This prevents tiles from being laid out as normal document images when the CDN stylesheet is delayed/overridden and prevents tile-grid recalculation during an unfinished CSS layout pass.

## v14 browser fixes
- Corrected Leaflet 1.9.4 CSS SHA-256 SRI digest.
- Removed invalid IPv6 loopback CSP source.
- Leaflet Draw still loads from CDN; verify it is reachable and not blocked by browser/network policies.
