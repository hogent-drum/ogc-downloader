<!doctype html>
<html lang="nl">
<?php include("../assets/php/head.php"); ?>
<?php include("../assets/php/banner.php"); ?>

<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OGC Layer Definition & Download Builder v13</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="anonymous" referrerpolicy="no-referrer" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.css" crossorigin="anonymous" referrerpolicy="no-referrer" />
  <link rel="stylesheet" href="assets/style.css" />
</head>

<body
  id="homepage"
  class="home"
  data-spy="scroll"
  data-target=".subnav"
  data-offset="50">
  <div class="body-wrap">
    <div id="st-container" class="st-container">
      <div class="st-pusher">
        <div class="st-content">
          <div class="st-content-inner">
            <?php include("../assets/php/navbar.php"); ?>
            <?php make_banner("/assets/img/carousel/01_PSEIRA.jpg", "OGC Downloader", "O"); ?>

            <section class="slice-sm sct-color-1">
              <div class="container" id="content" tabindex="-1">
                <div class="mura-body">
                  <div class="mura-region mura-region-loose">
                    <div class="mura-region-local">
                      <div class="row">
                        <div class="col-12">
                          <div class="card bg-gray-dark">
                            <div class="card-body">
                              <p class="card-text c-white">
                                <strong>Attention!&nbsp;</strong>The content
                                of this website is neither developed nor
                                supported by the HOGENT communication
                                department. Please contact Dr. Cornelis Stal
                                for more information, suggestions or
                                questions.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div class="row mt-50 align-items-center justify-content-between mb-50">
                        <div class="col-md-6 px-5 mb-5">
                          <div class="block block-image-holder z-depth-3">
                            <div class="block-image"><img alt="Sfeerbeeld"
                                class="animated img-center img-fluid"
                                data-instanceid="4E2B8666-341B-4257-B380ACC44C5CA875"
                                src="/assets/img/carousel/02_NAFPLIO.jpg"
                                style="opacity:1">
                              <div style="width:60%;position:absolute;top:50%;left:10%" onclick="location.href ='/'">
                                <h4 class="captiontitle c-white" style="line-height:1">
                                  geo.hogent.be</h4>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div class="col-md-6 pr-5">
                          <h2>Welcome to our website</h2>
                          <p>
                            This website is part of a collection of other websites and services offered by CADS, DRUM, and Appplied Geomatics.
                          </p>
                          <div class="row">
                            <div class="col-6">
                              <a
                                class="btn btn-dark btn-styled text-lowercase"
                                href="https://cads.hogent.be">CADS</a>
                            </div>
                            <div class="col-6">
                              <a
                                class="btn btn-dark btn-styled text-lowercase"
                                href="https://www.hogent.be/onderzoekscentra/duurzaam-ruimtegebruik-en-mobiliteit/">DRUM</a>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div class="row mt-75 mb-5">
                        <div class="col-md">
                          <h3 style="font-size: 2.5rem" id="research">
                            OGC Layer Definition &amp; Download Builder
                          </h3>
                          <p>WFS / WMS / WCS -> GetCapabilities -> laag of coverage -> BBOX -> download / ArcGIS Pro LYRX / QGIS QLR / OGC SLD</p>
                        </div>
                      </div>

                      <div class="ogc-layout">
                        <!-- LEFT COLUMN: TABLE OF CONTENTS -->
                        <aside class="ogc-sidebar">
                          <nav id="fieldset-toc" aria-label="OGC settings navigation">
                            <div class="fieldset-toc-heading">Contents</div>
                            <div id="fieldset-toc-list"></div>
                          </nav>
                        </aside>

                        <div class="ogc-settings">
                          <div class="col-md-12">
                            <fieldset id="ogc_service">
                              <legend>OGC service</legend>
                              <div class="mrow">
                                <div>
                                  <label for="serviceType">Servicetype</label>
                                  <select id="serviceType">
                                    <option value="WFS" selected>WFS — vector features</option>
                                    <option value="WMS">WMS — rendered map image</option>
                                    <option value="WCS">WCS — raster/coverage data</option>
                                  </select>
                                </div>
                                <div>
                                  <label for="version">Versie</label>
                                  <select id="version"></select>
                                </div>
                              </div>
                              <label for="endpoint">OGC endpoint</label>
                              <input id="endpoint" value="https://geo.api.vlaanderen.be/BWK/wfs" placeholder="https://server.example/ows" />
                              <div id="wfsMaxWrap">
                                <label for="maxFeatures">Max features</label>
                                <input id="maxFeatures" type="number" min="1" value="3000" />
                              </div>
                              <button id="loadCapabilities" class="primary" style="margin-top:10px">GetCapabilities laden</button>
                              <div id="capStatus" class="status">Geef een WFS endpoint in.</div>
                              <div class="hint">De HTML draait volledig client-side. De OGC-service moet daarom CORS toelaten voor
                                GetCapabilities en downloads.</div>
                            </fieldset>
                          </div>
                          <div class="col-md-12">
                            <fieldset id="layer_coverage">
                              <legend>Laag / coverage</legend>
                              <label for="featureType" id="layerSelectLabel">FeatureType / layer</label>
                              <select id="featureType" disabled>
                                <option>Laad eerst GetCapabilities</option>
                              </select>

                              <div class="mrow wfs-only" id="wfsNamesRow">
                                <div>
                                  <label for="qualifiedName">WFS TypeName</label>
                                  <input id="qualifiedName" readonly disabled />
                                </div>
                                <div>
                                  <label for="datasetName">ArcGIS Dataset</label>
                                  <input id="datasetName" readonly disabled />
                                </div>
                              </div>
                              <div class="hint wfs-only" id="wfsDatasetHint">Belangrijk: ArcGIS Pro verwacht bij WFS doorgaans de lokale
                                datasetnaam zonder namespace-prefix.</div>

                              <label for="layerName">Laagnaam</label>
                              <input id="layerName" />

                              <div class="mrow" id="geometryCrsRow">
                                <div class="wfs-only">
                                  <label for="geometryType">Geometrie</label>
                                  <select id="geometryType">
                                    <option value="auto">Automatisch</option>
                                    <option value="point">Punt</option>
                                    <option value="line">Lijn</option>
                                    <option value="polygon">Polygoon</option>
                                  </select>
                                </div>
                                <div>
                                  <label for="crs">Service / BBOX CRS</label>
                                  <select id="crs">
                                    <option value="EPSG:4326">EPSG:4326</option>
                                    <option value="EPSG:3857">EPSG:3857</option>
                                    <option value="EPSG:31370">EPSG:31370</option>
                                  </select>
                                </div>
                              </div>
                              <div class="hint wfs-only" id="wfsDatasetHint">Belangrijk: Controleer zeker de juistheid van het gekozen type
                                geometrie.</div>


                              <button id="loadSchema" class="secondary" style="margin-top:10px" disabled>DescribeFeatureType laden</button>
                              <div id="layerStatus" class="status">Nog geen laag gekozen.</div>

                              <div class="wfs-only" id="displayFieldWrap"><label for="displayField">Display field</label>
                                <select id="displayField" disabled>
                                  <option value="">Automatisch</option>
                                </select>
                                <div class="hint">DisplayField bepaalt welk attribuut als herkenbare naam of omschrijving van een feature
                                  wordt gebruikt.</div>
                              </div>
                              <div id="fields" class="fields wfs-only" style="display:none"></div>
                            </fieldset>
                          </div>

                          <div class="col-md-12">
                            <fieldset id="bbox">
                              <legend>BBOX</legend>
                              <div class="mrow">
                                <div class="col-md">
                                  <p class="hint">Teken een rechthoek op de Leaflet-kaart. Leaflet levert WGS84-coordinaten; die worden naar het
                                    gekozen service-CRS getransformeerd en gebruikt voor WFS-, WMS- of WCS-subsetting.</p>
                                  <div class="mono" id="bbox4326">WGS84: -</div>
                                  <div class="mono" id="bboxTarget" style="margin-top:5px">Doel-CRS: -</div>
                                  <button id="clearBbox" class="secondary" style="margin-top:10px">BBOX wissen</button>
                                  <div class="inline" style="margin-top:10px"><input id="useBbox" type="checkbox" checked><label
                                      for="useBbox">BBOX gebruiken voor filtering / download</label></div>
                                  <div class="hint">Voor WFS/LYRX wordt de BBOX als <strong>CIMFeatureTable.studyArea</strong> opgeslagen; voor
                                    WFS-download, WMS GetMap en WCS GetCoverage wordt ze in de overeenkomstige OGC-request verwerkt.</div>
                                </div>
                                <div class="col-md map-wrap">
                                  <div id="map"></div>
                                </div>
                              </div>
                            </fieldset>
                          </div>

                          <div class="col-md-12">
                            <fieldset id="download">
                              <legend>Data downloaden</legend>
                              <div id="wfsDownloadPanel">
                                <p class="hint">De lijst hieronder komt rechtstreeks uit de door de WFS geadverteerde
                                  <code>GetFeature</code>-outputformaten. De download gebruikt dezelfde geselecteerde FeatureType, CRS en —
                                  indien actief — BBOX.
                                </p>
                                <label for="downloadFormat">Outputformaat</label>
                                <select id="downloadFormat" disabled>
                                  <option>Laad eerst GetCapabilities</option>
                                </select>
                                <div id="formatStatus" class="status">Nog geen GetFeature-outputformaten geladen.</div>
                                <button id="downloadFeatures" class="primary" style="margin-top:10px" disabled>Download features</button>
                                <div id="downloadStatus" class="status">Nog geen download gestart.</div>
                              </div>

                              <div id="wmsDownloadPanel" style="display:none">
                                <p class="hint">WMS levert een gerenderde kaartafbeelding. Kies een <code>GetMap</code>-formaat en
                                  pixelresolutie. Voor PNG/JPEG/TIFF kan een ZIP met world file en .prj worden gemaakt.</p>
                                <label for="wmsStyle">WMS-stijl</label>
                                <select id="wmsStyle">
                                  <option value="">Default</option>
                                </select>
                                <label for="wmsFormat">GetMap outputformaat</label>
                                <select id="wmsFormat" disabled>
                                  <option>Laad eerst GetCapabilities</option>
                                </select>
                                <div class="mrow">
                                  <div><label for="wmsResolution">Pixelresolutie (CRS-eenheden/pixel)</label><input id="wmsResolution"
                                      type="number" min="0.000000001" step="any" value="10"></div>
                                  <div><label>Afmetingen</label><input id="wmsDimensions" readonly value="-" /></div>
                                </div>
                                <div class="inline" style="margin-top:8px"><input id="wmsTransparent" type="checkbox" checked><label
                                    for="wmsTransparent">Transparante achtergrond indien ondersteund</label></div>
                                <div class="inline" style="margin-top:8px"><input id="wmsAutoTile" type="checkbox" checked><label
                                    for="wmsAutoTile">Automatisch opdelen in tegels wanneer de GetMap te groot is of faalt</label></div>
                                <div class="mrow">
                                  <div><label for="wmsTileSize">Max. tegelgrootte (pixels)</label><input id="wmsTileSize" type="number"
                                      min="256" step="256" value="2048"></div>
                                  <div><label for="wmsTileCount">Aantal tegels</label><input id="wmsTileCount" readonly value="-" /></div>
                                </div>
                                <p class="hint">Elke WMS-tegel krijgt een eigen world file en <code>.prj</code>, zodat PNG/JPEG/TIFF-tegels
                                  rechtstreeks gegeorefereerd kunnen worden ingeladen. De ZIP bevat ook een manifest met BBOX, afmetingen en
                                  GetMap-URL per tegel.</p>
                                <label for="wmsRequestPreview">GetMap request</label>
                                <textarea id="wmsRequestPreview" rows="6" readonly class="mono"></textarea>
                                <div class="mrow" style="margin-top:10px"><button id="downloadWms" class="primary" disabled>Download beeld +
                                    georeferentie (.zip)</button><button id="downloadWmsTiles" class="secondary" disabled>Download als
                                    tegel-ZIP</button></div>
                                <button id="downloadWmsRaw" class="secondary" style="margin-top:8px" disabled>Download enkel beeld</button>
                                <div id="wmsDownloadStatus" class="status">Nog geen WMS-download gestart.</div>
                              </div>

                              <div id="wcsDownloadPanel" style="display:none">
                                <p class="hint">WCS levert raster/coverage-data en behoudt de datawaarden. GeoTIFF heeft de voorkeur wanneer
                                  de service dit ondersteunt. BBOX-subsetting gebeurt in het coverage-CRS.</p>
                                <label for="wcsFormat">GetCoverage outputformaat</label>
                                <select id="wcsFormat" disabled>
                                  <option>Laad eerst GetCapabilities / DescribeCoverage</option>
                                </select>
                                <div class="mrow">
                                  <div><label for="wcsResolution">Gewenste resolutie (CRS-eenheden/pixel)</label><input id="wcsResolution"
                                      type="number" min="0.000000001" step="any" value="10"></div>
                                  <div><label>Afmetingen</label><input id="wcsDimensions" readonly value="-" /></div>
                                </div>
                                <div id="wcsResolutionHint" class="hint">WCS 1.0 gebruikt RESX/RESY; WCS 2.x gebruikt SCALESIZE wanneer de
                                  Scaling Extension geadverteerd wordt.</div>
                                <div class="inline" style="margin-top:8px"><input id="wcsAutoTile" type="checkbox" checked><label
                                    for="wcsAutoTile">Automatisch opdelen in tegels wanneer de request te groot is of faalt</label></div>
                                <div class="mrow">
                                  <div><label for="wcsTileSize">Max. tegelgrootte (pixels)</label><input id="wcsTileSize" type="number"
                                      min="256" step="256" value="2048"></div>
                                  <div><label for="wcsTileCount">Aantal tegels</label><input id="wcsTileCount" readonly value="-" /></div>
                                </div>
                                <p class="hint">Bij tegel-download wordt een ZIP gemaakt met afzonderlijke WCS-rastertegels. Multipart WCS
                                  2.x-responses worden automatisch uitgepakt: alleen de echte rasterbytes worden als TIFF opgeslagen; de
                                  GML/XML-metadata wordt apart bewaard. TIFF-signatures worden gecontroleerd zodat XML- of foutresponses niet
                                  als .tif worden opgeslagen.</p>
                                <label for="wcsRequestPreview">GetCoverage request</label>
                                <textarea id="wcsRequestPreview" rows="7" readonly class="mono"></textarea>
                                <div class="mrow" style="margin-top:10px"><button id="downloadWcs" class="primary" disabled>Download
                                    coverage</button><button id="downloadWcsTiles" class="secondary" disabled>Download als tegel-ZIP</button>
                                </div>
                                <div id="wcsDownloadStatus" class="status">Nog geen WCS-download gestart.</div>
                              </div>
                            </fieldset>
                          </div>

                          <div class="col-md-12">
                            <fieldset class="wfs-only" id="visualization">
                              <legend>Vectorvisualisatie</legend>
                              <div id="symPoint">
                                <div class="mrow">
                                  <div><label>Puntkleur</label><input id="pointColor" type="color" value="#2b83ba"></div>
                                  <div><label>Puntgrootte (pt)</label><input id="pointSize" type="number" value="8" step="0.5"></div>
                                </div>
                                <label>Outline-kleur</label><input id="pointOutline" type="color" value="#ffffff">
                              </div>
                              <div id="symLine">
                                <div class="mrow">
                                  <div><label>Lijnkleur</label><input id="lineColor" type="color" value="#2b83ba"></div>
                                  <div><label>Lijndikte (pt)</label><input id="lineWidth" type="number" value="1.5" step="0.1"></div>
                                </div>
                              </div>
                              <div id="symPolygon">
                                <div class="mrow">
                                  <div><label>Vulkleur</label><input id="fillColor" type="color" value="#c4fccb"></div>
                                  <div><label>Dekking (%)</label><input id="fillOpacity" type="number" min="0" max="100" value="70"></div>
                                </div>
                                <div class="mrow">
                                  <div><label>Randkleur</label><input id="strokeColor" type="color" value="#6e6e6e"></div>
                                  <div><label>Randdikte (pt)</label><input id="strokeWidth" type="number" value="0.7" step="0.1"></div>
                                </div>
                              </div>
                              <div id="symAuto" class="hint">Laad eerst DescribeFeatureType of kies het geometrie-type manueel.</div>
                            </fieldset>
                          </div>


                          <div class="col-md-12">
                            <fieldset id="arcgis">
                              <legend>ArcGIS Pro (.lyrx)</legend>
                              <label for="arcgisVersion">Doelversie ArcGIS Pro</label>
                              <select id="arcgisVersion">
                                <option value="3.3.0">ArcGIS Pro 3.3.0</option>
                                <option value="3.4.0">ArcGIS Pro 3.4.0</option>
                                <option value="3.5.0">ArcGIS Pro 3.5.0</option>
                                <option value="3.6.0">ArcGIS Pro 3.6.0</option>
                                <option value="3.7.0">ArcGIS Pro 3.7.0</option>
                                <option value="3.7.1">ArcGIS Pro 3.7.1</option>
                                <option value="3.7.2" selected>ArcGIS Pro 3.7.2</option>
                              </select>
                              <div id="arcgisVersionInfo" class="hint"></div>
                              <div id="arcgisWfsOptions">
                                <div class="mrow">
                                  <div><label for="mode">WFS mode</label><select id="mode" disabled>
                                      <option value="OnDemand" selected>OnDemand</option>
                                    </select></div>
                                  <div><label for="swapxy">SWAPXY</label><select id="swapxy">
                                      <option value="FALSE">FALSE</option>
                                      <option value="TRUE">TRUE</option>
                                    </select></div>
                                </div>
                                <div class="inline" style="margin-top:10px"><input id="swapxyfilter" type="checkbox"><label
                                    for="swapxyfilter">SWAPXYFILTER=TRUE</label></div>
                              </div>
                              <label for="connectionPreview">ArcGIS service connection</label>
                              <textarea id="connectionPreview" rows="5" readonly class="mono"></textarea>
                              <label for="studyAreaPreview">ArcGIS BBOX / extent</label>
                              <textarea id="studyAreaPreview" rows="4" readonly class="mono"></textarea>
                              <button id="exportLyrx" class="primary" style="margin-top:12px" disabled>Exporteer .lyrx</button>
                              <div id="exportStatus" class="status">Nog niet klaar voor export.</div>
                            </fieldset>
                          </div>

                          <div class="col-md-12">
                            <fieldset id="qgis">
                              <legend>QGIS (.qlr / .sld)</legend>
                              <p class="hint" id="qgisHelp"><strong>QLR</strong> bevat zowel de WFS-databron als de QGIS-stijl.
                                <strong>SLD</strong> is alleen een stijlbestand: voeg eerst de WFS/QLR-laag toe en laad daarna de SLD via
                                <em>Laageigenschappen &gt; Symbologie &gt; Stijl &gt; Stijl laden</em>. Een SLD kan niet als databron worden
                                geopend.
                              </p>
                              <div class="inline wfs-only" id="qgisRestrictWrap" style="margin-top:8px"><input id="qgisRestrictView"
                                  type="checkbox" checked><label for="qgisRestrictView">QGIS vraagt WFS-features enkel voor het actuele
                                  kaartvenster op</label></div>
                              <label for="qgisDatasourcePreview" id="qgisDatasourceLabel">QGIS datasource URI</label>
                              <textarea id="qgisDatasourcePreview" rows="6" readonly class="mono"></textarea>
                              <div id="qgisFilterWrap" class="wfs-only"><label for="qgisFilterPreview">Vaste BBOX-filter in QLR (QGIS
                                  expression)</label>
                                <textarea id="qgisFilterPreview" rows="6" readonly class="mono"></textarea>
                              </div>
                              <div class="mrow" style="margin-top:12px">
                                <button id="exportQlr" class="primary" disabled>Exporteer .qlr</button>
                                <button id="exportSld" class="secondary" disabled>Exporteer .sld</button>
                              </div>
                              <div id="qgisExportStatus" class="status">Nog niet klaar voor QGIS/SLD-export.</div>
                            </fieldset>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <!-- FOOTER -->
            <?php include("../assets/php/footer.php"); ?>
          </div>
        </div>
      </div>
    </div>
  </div>
  <script src="/assets/js/popper.min.js"></script>
  <script src="/assets/bootstrap/js/bootstrap.min.js"></script>
  <script src="/assets/vendor/adaptive-backgrounds/adaptive-backgrounds.js" defer></script>
  <script src="/assets/vendor/sticky-kit/sticky-kit.min.js" defer></script>
  <script src="/assets/vendor/swiper/js/swiper.min.js" defer></script>
  <script src="/assets/vendor/viewport-checker/viewportchecker.min.js" defer></script>
  <script src="/assets/vendor/wow/wow.min.js" defer></script>
  <script src="/assets/vendor/fancybox/js/jquery.fancybox.min.js" defer></script>
  <script src="/assets/vendor/isotope/isotope.min.js" defer></script>
  <script src="/assets/vendor/imagesloaded/imagesloaded.pkgd.min.js" defer></script>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet.draw/1.0.4/leaflet.draw.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.11.0/proj4.js" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
  <script src="assets/vendor/jszip/jszip.min.js"></script>
  <script src="assets/script.js"></script>
</body>

</html>