(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);

  // Client-side hardening limits. These prevent accidental or malicious
  // responses from exhausting browser memory.
  const MAX_XML_BYTES = 20 * 1024 * 1024;
  const MAX_SINGLE_DOWNLOAD_BYTES = 500 * 1024 * 1024;
  const MAX_ZIP_INPUT_BYTES = 750 * 1024 * 1024;
  const MAX_TILE_COUNT = 400;
  const MAX_RASTER_DIMENSION = 100000;

  // Belgian Lambert 72. Extra CRS-definities kunnen op dezelfde manier worden toegevoegd.
  proj4.defs(
    "EPSG:31370",
    "+proj=lcc +lat_0=90 +lon_0=4.367486666666666 +lat_1=51.16666723333333 +lat_2=49.8333339 +x_0=150000.013 +y_0=5400088.438 +ellps=intl +towgs84=-106.8686,52.2978,-103.7239,0.3366,-0.457,1.8422,-1.2747 +units=m +no_defs +type=crs",
  );

  const state = {
    featureTypes: [],
    selected: null,
    bbox4326: null,
    geometry: null,
    fields: [],
    shapeField: null,
    outputFormats: [],
    serviceType: "WFS",
    wmsLayers: [],
    wmsFormats: [],
    coverages: [],
    wcsFormats: [],
    coverageCrs: null,
    coverageAxes: [],
    gridAxes: [],
    wcsScaling: false,
    wcsCrsExtension: false,
    mapServicePreview: null,
  };

  const serviceVersions = {
    WFS: ["2.0.0", "1.1.0", "1.0.0"],
    WMS: ["1.3.0", "1.1.1"],
    WCS: ["2.0.1", "1.1.1", "1.0.0"],
  };

  function setVersionOptions(service, preferred = null) {
    const sel = $("version");
    sel.innerHTML = "";
    for (const v of serviceVersions[service]) {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v;
      sel.appendChild(o);
    }
    if (preferred && serviceVersions[service].includes(preferred))
      sel.value = preferred;
  }

  function setServiceUI(service) {
    state.serviceType = service;
    state.selected = null;
    state.geometry = null;
    state.fields = [];
    state.coverageCrs = null;
    state.coverageAxes = [];
    state.gridAxes = [];
    if (state.mapServicePreview) {
      map.removeLayer(state.mapServicePreview);
      state.mapServicePreview = null;
    }
    document
      .querySelectorAll(".wfs-only")
      .forEach((el) => (el.style.display = service === "WFS" ? "" : "none"));
    $("wfsMaxWrap").style.display = service === "WFS" ? "block" : "none";
    $("wfsDownloadPanel").style.display = service === "WFS" ? "block" : "none";
    $("wmsDownloadPanel").style.display = service === "WMS" ? "block" : "none";
    $("wcsDownloadPanel").style.display = service === "WCS" ? "block" : "none";
    $("arcgis").style.display = "block";
    $("arcgisWfsOptions").style.display = service === "WFS" ? "block" : "none";
    $("layerSelectLabel").textContent =
      service === "WFS"
        ? "FeatureType / layer"
        : service === "WMS"
          ? "WMS layer"
          : "Coverage";
    $("loadSchema").style.display = service === "WMS" ? "none" : "block";
    $("loadSchema").textContent =
      service === "WFS"
        ? "DescribeFeatureType laden"
        : "DescribeCoverage laden";
    $("qgisFilterWrap").style.display = service === "WFS" ? "block" : "none";
    $("qgisRestrictWrap").style.display = service === "WFS" ? "flex" : "none";
    $("exportSld").disabled = service !== "WFS";
    $("exportSld").style.display = service === "WFS" ? "block" : "none";
    $("qgisHelp").innerHTML =
      service === "WFS"
        ? "<strong>QLR</strong> bevat zowel de WFS-databron als de QGIS-stijl. <strong>SLD</strong> is alleen een stijlbestand: voeg eerst de WFS/QLR-laag toe en laad daarna de SLD via <em>Laageigenschappen &gt; Symbologie &gt; Stijl &gt; Stijl laden</em>."
        : service === "WMS"
          ? "<strong>QLR</strong> bewaart de WMS-endpoint, laag, CRS en gekozen serverstijl. WMS-symbologie wordt door de server gerenderd."
          : "<strong>QLR</strong> bewaart de WCS-endpoint, coverage en CRS. De rasterweergave wordt door QGIS bepaald op basis van de coverage.";
    $("qgisDatasourceLabel").textContent = `QGIS ${service} datasource URI`;
    $("featureType").innerHTML = "<option>Laad eerst GetCapabilities</option>";
    $("featureType").disabled = true;
    $("loadSchema").disabled = true;
    $("exportQlr").disabled = true;
    $("exportLyrx").disabled = true;
    $("capStatus").className = "status";
    $("capStatus").textContent = `Geef een ${service} endpoint in.`;
    $("layerStatus").className = "status";
    $("layerStatus").textContent = "Nog geen laag gekozen.";
    setVersionOptions(service);
    if (service === "WFS")
      $("endpoint").placeholder = "https://server.example/wfs";
    if (service === "WMS")
      $("endpoint").placeholder = "https://server.example/wms";
    if (service === "WCS")
      $("endpoint").placeholder = "https://server.example/wcs";
    updateQgisPreview();
    updateRasterPreviews();
  }

  // ArcGIS Pro layer files are versioned with the CIM schema version and build.
  // A newer LYRX can therefore fail to load correctly in an older ArcGIS Pro release,
  // even when the WFS connection itself is valid. The profile below writes a header
  // that matches the selected ArcGIS Pro generation. Patch releases within 3.3-3.6
  // use the same CIM generation/build family.
  const arcgisProfiles = {
    // build is intentionally numeric: this matches ArcGIS' own LYRX JSON encoding.
    "3.3.0": {
      label: "ArcGIS Pro 3.3.0",
      cimVersion: "3.3.0",
      build: 52636,
      template: "3.3",
    },
    "3.4.0": {
      label: "ArcGIS Pro 3.4.0",
      cimVersion: "3.4.0",
      build: 55405,
      template: "3.4+",
    },
    "3.5.0": {
      label: "ArcGIS Pro 3.5.0",
      cimVersion: "3.5.0",
      build: 57366,
      template: "3.4+",
    },
    "3.6.0": {
      label: "ArcGIS Pro 3.6.0",
      cimVersion: "3.6.0",
      build: 59527,
      template: "3.4+",
    },
    "3.7.0": {
      label: "ArcGIS Pro 3.7.0",
      cimVersion: "3.7.0",
      build: 1901,
      template: "3.4+",
    },
    // Patch releases use the same CIM generation as 3.7.0; build follows the installed release.
    "3.7.1": {
      label: "ArcGIS Pro 3.7.1",
      cimVersion: "3.7.0",
      build: 1904,
      template: "3.4+",
    },
    "3.7.2": {
      label: "ArcGIS Pro 3.7.2",
      cimVersion: "3.7.0",
      build: 1904,
      template: "3.4+",
    },
  };

  function selectedArcgisProfile() {
    return arcgisProfiles[$("arcgisVersion").value] || arcgisProfiles["3.7.2"];
  }

  function updateArcgisVersionInfo() {
    const p = selectedArcgisProfile();
    $("arcgisVersionInfo").textContent =
      `Doel: ${p.label}. LYRX/CIM-header: version ${p.cimVersion}, build ${p.build}. Voor 3.3 wordt bovendien een afzonderlijke, conservatieve 3.3-CIM-structuur gebruikt.`;
  }

  const map = L.map("map").setView([50.85, 4.35], 8);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
    referrerPolicy: "strict-origin-when-cross-origin",
  }).addTo(map);

  const drawn = new L.FeatureGroup().addTo(map);
  map.addControl(
    new L.Control.Draw({
      edit: { featureGroup: drawn, edit: false },
      draw: {
        polygon: false,
        polyline: false,
        marker: false,
        circle: false,
        circlemarker: false,
        rectangle: { shapeOptions: { weight: 2 } },
      },
    }),
  );
  map.on(L.Draw.Event.CREATED, (e) => {
    drawn.clearLayers();
    drawn.addLayer(e.layer);
    setBboxFromBounds(e.layer.getBounds());
  });

  // Keep Leaflet correctly sized while the left menu scrolls independently.
  // requestAnimationFrame avoids recalculating the tile grid in the middle of a
  // CSS layout pass. A final load-time invalidation catches late web-font/CSS
  // changes on shared hosting.
  let resizeFrame = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() =>
      map.invalidateSize({ pan: false }),
    );
  }).observe($("map").parentElement);
  requestAnimationFrame(() => map.invalidateSize({ pan: false }));
  window.addEventListener("load", () => map.invalidateSize({ pan: false }), {
    once: true,
  });

  function isPrivateOrLocalHost(hostname) {
    const h = (hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
    if (!h) return true;
    if (
      h === "localhost" ||
      h.endsWith(".localhost") ||
      h.endsWith(".local") ||
      h.endsWith(".lan") ||
      h.endsWith(".internal")
    )
      return true;
    if (!h.includes(".") && h !== "localhost") return true;
    if (
      /^127\./.test(h) ||
      /^10\./.test(h) ||
      /^169\.254\./.test(h) ||
      /^192\.168\./.test(h)
    )
      return true;
    const m = h.match(/^172\.(\d+)\./);
    if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
    if (
      h === "::1" ||
      h.startsWith("fc") ||
      h.startsWith("fd") ||
      h.startsWith("fe80:")
    )
      return true;
    return false;
  }

  function validateEndpointUrl(rawUrl) {
    let u;
    try {
      u = new URL(String(rawUrl || "").trim());
    } catch {
      throw new Error("Ongeldige endpoint-URL.");
    }
    if (!["http:", "https:"].includes(u.protocol))
      throw new Error("Alleen HTTP(S)-endpoints zijn toegestaan.");
    if (u.username || u.password)
      throw new Error(
        "Gebruikersnaam of wachtwoord in de endpoint-URL is niet toegestaan.",
      );

    const appIsLocal = ["localhost", "127.0.0.1", "::1"].includes(
      location.hostname,
    );
    const endpointIsLocal = isPrivateOrLocalHost(u.hostname);
    if (!appIsLocal && u.protocol !== "https:")
      throw new Error(
        "Op de publieke versie zijn alleen HTTPS OGC-services toegestaan.",
      );
    if (!appIsLocal && endpointIsLocal)
      throw new Error(
        "Lokale of private netwerkadressen zijn niet toegestaan vanuit de publieke versie.",
      );
    return u;
  }

  function cleanEndpoint(url) {
    const u = validateEndpointUrl(url);
    const remove = [
      "service",
      "request",
      "version",
      "typename",
      "typenames",
      "bbox",
      "srsname",
      "count",
      "maxfeatures",
      "outputformat",
      "layers",
      "styles",
      "crs",
      "srs",
      "width",
      "height",
      "format",
      "transparent",
      "coverage",
      "coverageid",
      "identifiers",
      "subset",
      "resx",
      "resy",
      "scalesize",
      "response_crs",
    ];
    [...u.searchParams.keys()].forEach((k) => {
      if (remove.includes(k.toLowerCase())) u.searchParams.delete(k);
    });
    const out = u.toString();
    return out.endsWith("?") ? out.slice(0, -1) : out.replace(/[&]$/, "");
  }

  function contentLengthOrZero(response) {
    const n = Number(response.headers.get("content-length"));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function enforceDeclaredSize(response, maxBytes, label = "Response") {
    const n = contentLengthOrZero(response);
    if (n > maxBytes)
      throw new Error(
        `${label} is te groot (${Math.ceil(n / 1024 / 1024)} MB; maximum ${Math.floor(maxBytes / 1024 / 1024)} MB).`,
      );
  }

  function withParams(base, params) {
    const u = new URL(base);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    return u.toString();
  }

  async function fetchXml(url) {
    validateEndpointUrl(url);
    const r = await fetch(url, {
      headers: { Accept: "application/xml,text/xml,*/*" },
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
    enforceDeclaredSize(r, MAX_XML_BYTES, "XML-response");
    const text = await r.text();
    if (new Blob([text]).size > MAX_XML_BYTES)
      throw new Error(
        `XML-response overschrijdt de limiet van ${Math.floor(MAX_XML_BYTES / 1024 / 1024)} MB.`,
      );
    const xml = new DOMParser().parseFromString(text, "application/xml");
    const parserError = [...xml.getElementsByTagName("parsererror")][0];
    if (parserError)
      throw new Error("De server antwoordde niet met geldige XML.");
    const exception = [...xml.getElementsByTagName("*")].find((e) =>
      ["ExceptionReport", "ServiceExceptionReport"].includes(e.localName),
    );
    if (exception)
      throw new Error(exception.textContent.trim().replace(/\s+/g, " "));
    return xml;
  }

  const all = (root, localName) =>
    [...root.getElementsByTagName("*")].filter(
      (e) => e.localName === localName,
    );
  const first = (root, localName) => all(root, localName)[0] || null;
  const textOf = (root, localName) =>
    first(root, localName)?.textContent.trim() || "";
  const unique = (a) => [...new Set(a.filter(Boolean))];
  const localDatasetName = (qname) => (qname || "").split(":").pop().trim();

  function normalizeCrs(s) {
    if (!s) return "";
    const t = s.trim();
    const patterns = [
      /EPSG\s*:\s*(\d+)/i,
      /EPSG\/0\/(\d+)/i,
      /EPSG\/(\d+)/i,
      /urn:ogc:def:crs:EPSG(?::[^:]*)?::(\d+)/i,
    ];
    for (const p of patterns) {
      const m = t.match(p);
      if (m) return `EPSG:${m[1]}`;
    }
    return t;
  }

  function parseGetFeatureOutputFormats(xml) {
    const formats = [];

    // WFS 1.1/2.0: ows:OperationsMetadata / ows:Operation name="GetFeature" / ows:Parameter name="outputFormat".
    for (const op of all(xml, "Operation")) {
      if ((op.getAttribute("name") || "").toLowerCase() !== "getfeature")
        continue;
      for (const p of all(op, "Parameter")) {
        if ((p.getAttribute("name") || "").toLowerCase() !== "outputformat")
          continue;
        for (const v of all(p, "Value")) {
          const value = v.textContent.trim();
          if (value) formats.push(value);
        }
      }
    }

    // WFS 1.0 and vendor variants: GetFeature/ResultFormat child element names.
    for (const gf of all(xml, "GetFeature")) {
      for (const rf of all(gf, "ResultFormat")) {
        for (const child of [...rf.children]) {
          const value = (
            child.getAttribute("value") ||
            child.textContent ||
            child.localName ||
            ""
          ).trim();
          if (value) formats.push(value);
        }
      }
      for (const ofEl of all(gf, "OutputFormats")) {
        for (const f of all(ofEl, "Format")) {
          const value = f.textContent.trim();
          if (value) formats.push(value);
        }
      }
    }

    return unique(formats);
  }

  function directChildren(el, localName) {
    return [...el.children].filter((c) => c.localName === localName);
  }
  function directText(el, localName) {
    return directChildren(el, localName)[0]?.textContent.trim() || "";
  }

  function parseWmsCapabilities(xml) {
    const root = xml.documentElement;
    const version = root.getAttribute("version") || $("version").value;
    const getMap = all(xml, "GetMap")[0];
    const formats = getMap
      ? unique(
          all(getMap, "Format")
            .map((e) => e.textContent.trim())
            .filter((v) => v && !/xml/i.test(v)),
        )
      : [];
    const roots = all(xml, "Capability").flatMap((c) =>
      directChildren(c, "Layer"),
    );
    const layers = [];
    function walk(node, inheritedCrs = []) {
      const ownCrs = unique(
        [...directChildren(node, "CRS"), ...directChildren(node, "SRS")]
          .flatMap((e) => e.textContent.trim().split(/\s+/))
          .map(normalizeCrs),
      );
      const crs = unique([...inheritedCrs, ...ownCrs]);
      const name = directText(node, "Name");
      const title = directText(node, "Title") || name;
      let wgs84 = null;
      const ex = directChildren(node, "EX_GeographicBoundingBox")[0];
      if (ex) {
        const vals = [
          "westBoundLongitude",
          "southBoundLatitude",
          "eastBoundLongitude",
          "northBoundLatitude",
        ].map((n) => Number(directText(ex, n)));
        if (vals.every(Number.isFinite)) wgs84 = vals;
      }
      const ll = directChildren(node, "LatLonBoundingBox")[0];
      if (!wgs84 && ll) {
        const vals = ["minx", "miny", "maxx", "maxy"].map((a) =>
          Number(ll.getAttribute(a)),
        );
        if (vals.every(Number.isFinite)) wgs84 = vals;
      }
      const styles = directChildren(node, "Style")
        .map((st) => ({
          name: directText(st, "Name"),
          title: directText(st, "Title") || directText(st, "Name"),
        }))
        .filter((x) => x.name);
      if (name)
        layers.push({
          qName: name,
          dataset: localDatasetName(name),
          title,
          crs,
          wgs84,
          styles,
        });
      directChildren(node, "Layer").forEach((ch) => walk(ch, crs));
    }
    roots.forEach((r) => walk(r, []));
    return { version, layers, formats };
  }

  function parseWcsCapabilities(xml) {
    const root = xml.documentElement;
    const version = root.getAttribute("version") || $("version").value;
    const cov = [];
    for (const n of all(xml, "CoverageSummary")) {
      const id = textOf(n, "CoverageId") || textOf(n, "Identifier");
      if (!id) continue;
      const title = textOf(n, "Title") || id;
      let wgs84 = null;
      const box = all(n, "WGS84BoundingBox")[0];
      if (box) {
        const lo = textOf(box, "LowerCorner").split(/\s+/).map(Number),
          hi = textOf(box, "UpperCorner").split(/\s+/).map(Number);
        if (
          lo.length >= 2 &&
          hi.length >= 2 &&
          [...lo, ...hi].every(Number.isFinite)
        )
          wgs84 = [lo[0], lo[1], hi[0], hi[1]];
      }
      cov.push({
        qName: id,
        dataset: localDatasetName(id),
        title,
        crs: [],
        wgs84,
      });
    }
    for (const n of all(xml, "CoverageOfferingBrief")) {
      const id = directText(n, "name") || directText(n, "Name");
      if (!id || cov.some((c) => c.qName === id)) continue;
      const title = directText(n, "label") || id;
      let wgs84 = null;
      const env = all(n, "lonLatEnvelope")[0];
      if (env) {
        const pos = all(env, "pos").map((e) =>
          e.textContent.trim().split(/\s+/).map(Number),
        );
        if (pos.length >= 2 && pos.flat().every(Number.isFinite))
          wgs84 = [pos[0][0], pos[0][1], pos[1][0], pos[1][1]];
      }
      cov.push({
        qName: id,
        dataset: localDatasetName(id),
        title,
        crs: [],
        wgs84,
      });
    }
    const formats = unique(
      all(xml, "formatSupported")
        .concat(all(xml, "SupportedFormat"), all(xml, "Format"))
        .map((e) => e.textContent.trim())
        .filter((v) => /tif|geo|netcdf|png|jpeg|jp2|gml|image\//i.test(v)),
    );
    const profiles = all(xml, "Profile").map((e) => e.textContent.trim());
    const scaling =
      profiles.some((v) => /scal/i.test(v)) ||
      xml.documentElement.textContent.includes("WCS_service-extension_scaling");
    const crsExtension =
      profiles.some((v) =>
        /service-extension.crs|extension.crs|\/crs\//i.test(v),
      ) ||
      xml.documentElement.textContent.includes("WCS_service-extension_crs");
    return { version, coverages: cov, formats, scaling, crsExtension };
  }

  function parseCapabilities(xml) {
    const root = xml.documentElement;
    const version = root.getAttribute("version") || $("version").value;
    const featureNodes = all(xml, "FeatureType");
    const featureTypes = featureNodes
      .map((ft) => {
        const qName = textOf(ft, "Name");
        const title = textOf(ft, "Title") || qName;
        const crs = unique(
          all(ft, "DefaultCRS")
            .concat(
              all(ft, "DefaultSRS"),
              all(ft, "OtherCRS"),
              all(ft, "OtherSRS"),
              all(ft, "SRS"),
            )
            .map((x) => normalizeCrs(x.textContent)),
        );
        let wgs84 = null;
        const box =
          all(ft, "WGS84BoundingBox")[0] || all(ft, "LatLongBoundingBox")[0];
        if (box?.localName === "WGS84BoundingBox") {
          const low = textOf(box, "LowerCorner").split(/\s+/).map(Number);
          const up = textOf(box, "UpperCorner").split(/\s+/).map(Number);
          if (
            low.length >= 2 &&
            up.length >= 2 &&
            [...low, ...up].every(Number.isFinite)
          )
            wgs84 = [low[0], low[1], up[0], up[1]];
        } else if (box) {
          const vals = ["minx", "miny", "maxx", "maxy"].map((a) =>
            Number(box.getAttribute(a)),
          );
          if (vals.every(Number.isFinite)) wgs84 = vals;
        }
        return {
          qName,
          dataset: localDatasetName(qName),
          title,
          crs,
          wgs84,
        };
      })
      .filter((f) => f.qName && f.dataset);
    const outputFormats = parseGetFeatureOutputFormats(xml);
    return { version, featureTypes, outputFormats };
  }

  function addCrsOptions(crsList) {
    const preferred = ["EPSG:4326", "EPSG:3857", "EPSG:31370"];
    const vals = unique([...crsList, ...preferred]);
    $("crs").innerHTML = "";
    vals.forEach((v) => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v;
      $("crs").appendChild(o);
    });
    const best = crsList.includes("EPSG:4326")
      ? "EPSG:4326"
      : crsList[0] || "EPSG:4326";
    $("crs").value = best;
  }

  function formatLabel(value) {
    const v = (value || "").toLowerCase();
    if (
      v.includes("geojson") ||
      v === "application/json" ||
      v.includes("json; subtype=geojson")
    )
      return `GeoJSON — ${value}`;
    if (v.includes("shape-zip") || v.includes("shapefile"))
      return `ESRI Shapefile (ZIP) — ${value}`;
    if (v.includes("geopackage") || v.includes("gpkg"))
      return `GeoPackage — ${value}`;
    if (v.includes("csv")) return `CSV — ${value}`;
    if (v.includes("kml")) return `KML — ${value}`;
    if (v.includes("gml")) return `GML — ${value}`;
    return value;
  }

  function populateOutputFormats(formats) {
    state.outputFormats = formats || [];
    const sel = $("downloadFormat");
    sel.innerHTML = "";
    if (!state.outputFormats.length) {
      const o = document.createElement("option");
      o.textContent = "Geen outputFormat geadverteerd";
      sel.appendChild(o);
      sel.disabled = true;
      $("downloadFeatures").disabled = true;
      $("formatStatus").className = "status";
      $("formatStatus").textContent =
        "Deze GetCapabilities adverteert geen expliciete GetFeature-outputformaten.";
      return;
    }
    state.outputFormats.forEach((f) => {
      const o = document.createElement("option");
      o.value = f;
      o.textContent = formatLabel(f);
      sel.appendChild(o);
    });
    const preferred =
      state.outputFormats.find((f) => /geojson|application\/json/i.test(f)) ||
      state.outputFormats.find((f) => /shape-zip|shapefile/i.test(f)) ||
      state.outputFormats.find((f) => /geopackage|gpkg/i.test(f)) ||
      state.outputFormats[0];
    sel.value = preferred;
    sel.disabled = false;
    $("downloadFeatures").disabled = false;
    $("formatStatus").className = "status ok";
    $("formatStatus").textContent =
      `${state.outputFormats.length} GetFeature-outputformaat/formats gevonden.`;
  }

  $("loadCapabilities").onclick = async () => {
    $("capStatus").className = "status";
    $("capStatus").textContent = "GetCapabilities wordt geladen...";
    try {
      const endpoint = cleanEndpoint($("endpoint").value);
      $("endpoint").value = endpoint;
      const service = $("serviceType").value;
      state.serviceType = service;
      const params = { service, request: "GetCapabilities" };
      if (service !== "WCS" || !$("version").value.startsWith("1.1"))
        params.version = $("version").value;
      else params.AcceptVersions = $("version").value;
      const xml = await fetchXml(withParams(endpoint, params));
      let parsed;
      if (service === "WFS") {
        parsed = parseCapabilities(xml);
        state.featureTypes = parsed.featureTypes;
        populateOutputFormats(parsed.outputFormats);
        if (!state.featureTypes.length)
          throw new Error("Geen FeatureType-elementen gevonden.");
        populateLayerSelector(state.featureTypes);
        $("loadSchema").disabled = false;
        $("exportLyrx").disabled = false;
        $("exportSld").disabled = false;
        $("capStatus").textContent =
          `${state.featureTypes.length} FeatureType(s) gevonden. WFS ${parsed.version}.`;
      } else if (service === "WMS") {
        parsed = parseWmsCapabilities(xml);
        state.wmsLayers = parsed.layers;
        state.wmsFormats = parsed.formats;
        if (!state.wmsLayers.length)
          throw new Error("Geen benoemde WMS-lagen gevonden.");
        populateLayerSelector(state.wmsLayers);
        populateWmsFormats(parsed.formats);
        $("exportLyrx").disabled = false;
        $("exportSld").disabled = true;
        $("capStatus").textContent =
          `${state.wmsLayers.length} WMS-laag/lagen gevonden. WMS ${parsed.version}. ${parsed.formats.length} GetMap-formaat/formats.`;
      } else {
        parsed = parseWcsCapabilities(xml);
        state.coverages = parsed.coverages;
        state.wcsFormats = parsed.formats;
        state.wcsScaling = parsed.scaling;
        state.wcsCrsExtension = parsed.crsExtension;
        if (!state.coverages.length)
          throw new Error("Geen coverages gevonden.");
        populateLayerSelector(state.coverages);
        populateWcsFormats(parsed.formats);
        $("loadSchema").disabled = false;
        $("exportLyrx").disabled = false;
        $("exportSld").disabled = true;
        $("capStatus").textContent =
          `${state.coverages.length} coverage(s) gevonden. WCS ${parsed.version}.${parsed.scaling ? " Scaling Extension gedetecteerd." : ""}${parsed.crsExtension ? " CRS Extension gedetecteerd." : ""}`;
      }
      if (serviceVersions[service].includes(parsed.version))
        $("version").value = parsed.version;
      $("featureType").disabled = false;
      $("exportQlr").disabled = false;
      $("capStatus").className = "status ok";
      selectLayer(0);
    } catch (e) {
      $("capStatus").className = "status error";
      $("capStatus").textContent =
        `GetCapabilities mislukt: ${e.message}\nControleer endpoint, servicetype, versie en CORS.`;
    }
  };

  function populateLayerSelector(items) {
    $("featureType").innerHTML = "";
    items.forEach((f, i) => {
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = `${f.title} (${f.qName})`;
      $("featureType").appendChild(o);
    });
  }

  $("featureType").onchange = () => selectLayer(Number($("featureType").value));

  function updateMapServicePreview() {
    if (state.mapServicePreview) {
      map.removeLayer(state.mapServicePreview);
      state.mapServicePreview = null;
    }
    if (state.serviceType !== "WMS" || !state.selected) return;
    const supported = state.selected.crs || [];
    if (!supported.includes("EPSG:3857") && !supported.includes("EPSG:4326"))
      return;
    try {
      state.mapServicePreview = L.tileLayer
        .wms(cleanEndpoint($("endpoint").value), {
          layers: state.selected.qName,
          styles: $("wmsStyle").value || "",
          format: "image/png",
          transparent: true,
          version: $("version").value,
          opacity: 0.75,
        })
        .addTo(map);
    } catch {}
  }

  function selectLayer(i) {
    if (state.serviceType === "WFS") return selectFeature(i);
    const arr = state.serviceType === "WMS" ? state.wmsLayers : state.coverages;
    state.selected = arr[i] || null;
    if (!state.selected) return;
    $("qualifiedName").value = state.selected.qName;
    $("datasetName").value = state.selected.dataset;
    $("layerName").value = state.selected.title || state.selected.dataset;
    addCrsOptions(state.selected.crs || []);
    if (state.serviceType === "WMS") {
      populateWmsStyles(state.selected.styles || []);
      $("wmsResolution").value =
        $("crs").value === "EPSG:4326" ? "0.0001" : "10";
      updateMapServicePreview();
      $("layerStatus").className = "status";
      $("layerStatus").textContent =
        `WMS layer: ${state.selected.qName}\nCRS: ${(state.selected.crs || []).join(", ") || "niet vermeld"}`;
    } else {
      state.coverageCrs = null;
      state.coverageAxes = [];
      state.gridAxes = [];
      $("layerStatus").className = "status";
      $("layerStatus").textContent =
        `Coverage: ${state.selected.qName}\nGebruik DescribeCoverage om CRS, assen en formaten te laden.`;
    }
    if (state.selected.wgs84) {
      const [minx, miny, maxx, maxy] = state.selected.wgs84;
      map.fitBounds(
        [
          [miny, minx],
          [maxy, maxx],
        ],
        { padding: [20, 20] },
      );
    }
    updateBboxText();
    updateConnectionPreview();
    updateQgisPreview();
    updateRasterPreviews();
  }

  function selectFeature(i) {
    state.selected = state.featureTypes[i] || null;
    state.geometry = null;
    state.fields = [];
    state.shapeField = null;
    if (!state.selected) return;

    $("qualifiedName").value = state.selected.qName;
    $("datasetName").value = state.selected.dataset;
    $("layerName").value = state.selected.title || state.selected.dataset;
    addCrsOptions(state.selected.crs);
    $("geometryType").value = "auto";
    resetFields();
    updateSymbologyUI();
    updateConnectionPreview();
    updateQgisPreview();
    updateRasterPreviews();

    $("layerStatus").className = "status";
    $("layerStatus").textContent =
      `WFS TypeName: ${state.selected.qName}\nArcGIS Dataset: ${state.selected.dataset}\nCRS: ${state.selected.crs.join(", ") || "niet vermeld"}`;

    if (state.selected.wgs84) {
      const [minx, miny, maxx, maxy] = state.selected.wgs84;
      map.fitBounds(
        [
          [miny, minx],
          [maxy, maxx],
        ],
        { padding: [20, 20] },
      );
    }
    updateBboxText();
    updateRasterPreviews();
  }

  function resetFields() {
    $("displayField").innerHTML = '<option value="">Automatisch</option>';
    $("displayField").disabled = true;
    $("fields").style.display = "none";
    $("fields").innerHTML = "";
  }

  function geometryToken(type, ref, name) {
    // Alleen expliciete GML/geometrie-typen tellen als geometrie.
    // Belangrijk: xs:string mag NOOIT als LineString worden gezien.
    const raw = `${type || ""} ${ref || ""} ${name || ""}`;
    return raw.toLowerCase();
  }

  function isGeometryType(type, ref, name) {
    const s = geometryToken(type, ref, name);
    return /(gml[:_])|((multi)?point(property)?type)|(linestring(property)?type)|(multilinestring(property)?type)|(curve(property)?type)|(multicurve(property)?type)|(polygon(property)?type)|(multipolygon(property)?type)|(surface(property)?type)|(multisurface(property)?type)|(geometry(property)?type)|(geometryassociationtype)|(abstractgeometry)/.test(
      s,
    );
  }

  function geometryKind(type, ref, name) {
    const s = geometryToken(type, ref, name);
    if (/multipoint|point(property)?type/.test(s)) return "point";
    if (/multilinestring|linestring|multicurve|curve(property)?type/.test(s))
      return "line";
    if (/multipolygon|polygon|multisurface|surface(property)?type/.test(s))
      return "polygon";
    return null;
  }

  function parseDescribeFeatureType(xml) {
    // Zoek de XSD elementdefinitie die overeenkomt met de lokale datasetnaam.
    const selectedLocal = state.selected.dataset;
    const elements = all(xml, "element");
    const rootEl = elements.find(
      (e) => e.getAttribute("name") === selectedLocal,
    );

    let complexType = null;
    if (rootEl) {
      const inline = [...rootEl.children].find(
        (e) => e.localName === "complexType",
      );
      if (inline) complexType = inline;
      if (!complexType && rootEl.getAttribute("type")) {
        const typeLocal = localDatasetName(rootEl.getAttribute("type"));
        complexType =
          all(xml, "complexType").find(
            (e) => e.getAttribute("name") === typeLocal,
          ) || null;
      }
    }

    // Fallback voor servers die de structuur anders serialiseren.
    const scope = complexType || xml;
    const fieldEls = all(scope, "element").filter((e) => e !== rootEl);
    const fields = [];
    let geometry = null;
    let shapeField = null;

    for (const e of fieldEls) {
      const name =
        e.getAttribute("name") || localDatasetName(e.getAttribute("ref"));
      const type = e.getAttribute("type") || "";
      const ref = e.getAttribute("ref") || "";
      if (!name) continue;
      if (isGeometryType(type, ref, name)) {
        const g = geometryKind(type, ref, name);
        if (g && !geometry) geometry = g;
        if (!shapeField) shapeField = name;
        continue;
      }
      if (!fields.some((f) => f.name === name))
        fields.push({ name, type, ref });
    }

    // Nog een geometry fallback over het volledige schema.
    if (!geometry) {
      for (const e of elements) {
        const g = geometryKind(
          e.getAttribute("type"),
          e.getAttribute("ref"),
          e.getAttribute("name"),
        );
        if (g) {
          geometry = g;
          shapeField ||=
            e.getAttribute("name") || localDatasetName(e.getAttribute("ref"));
          break;
        }
      }
    }
    return { fields, geometry, shapeField };
  }

  function chooseDisplayField(fields) {
    if (!fields.length) return "";
    const names = fields.map((f) => f.name);
    const preferred = [
      "GmlID",
      "gml_id",
      "gmlid",
      "id",
      "objectid",
      "fid",
      "name",
      "naam",
      "title",
      "titel",
    ];
    for (const p of preferred) {
      const found = names.find((n) => n.toLowerCase() === p.toLowerCase());
      if (found) return found;
    }
    const stringField = fields.find((f) => /string|char|text/i.test(f.type));
    return (stringField || fields[0]).name;
  }

  $("loadSchema").onclick = loadSchema;
  async function loadSchema() {
    if (state.serviceType === "WCS") return loadCoverageDescription();

    if (!state.selected) return;
    $("layerStatus").className = "status";
    $("layerStatus").textContent = "DescribeFeatureType wordt gelezen...";
    try {
      const endpoint = cleanEndpoint($("endpoint").value);
      const version = $("version").value;
      const typeParam = version.startsWith("2") ? "typeNames" : "typeName";
      const xml = await fetchXml(
        withParams(endpoint, {
          service: "WFS",
          version,
          request: "DescribeFeatureType",
          [typeParam]: state.selected.qName,
        }),
      );
      const schema = parseDescribeFeatureType(xml);
      state.fields = schema.fields;
      state.shapeField = schema.shapeField;
      state.geometry = schema.geometry;

      if (state.geometry) $("geometryType").value = state.geometry;
      updateSymbologyUI();

      $("displayField").innerHTML = "";
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "Geen / automatisch";
      $("displayField").appendChild(empty);
      state.fields.forEach((f) => {
        const o = document.createElement("option");
        o.value = f.name;
        o.textContent = f.type ? `${f.name} (${f.type})` : f.name;
        $("displayField").appendChild(o);
      });
      $("displayField").disabled = false;
      const autoDisplay = chooseDisplayField(state.fields);
      if (autoDisplay) $("displayField").value = autoDisplay;

      $("fields").innerHTML = state.fields
        .map(
          (f) =>
            `<span title="${escapeHtml(f.type || "")}">${escapeHtml(f.name)}</span>`,
        )
        .join("");
      $("fields").style.display = state.fields.length ? "block" : "none";

      $("layerStatus").className = "status ok";
      $("layerStatus").textContent =
        `Schema geladen: ${state.fields.length} attribuutvelden.\nGeometrie: ${state.geometry || "niet automatisch gevonden"}${state.shapeField ? ` (${state.shapeField})` : ""}.\nArcGIS Dataset: ${state.selected.dataset}`;
      updateConnectionPreview();
      updateQgisPreview();
    } catch (e) {
      $("layerStatus").className = "status error";
      $("layerStatus").textContent =
        `DescribeFeatureType mislukt: ${e.message}\nLet op: verwerking door sommige services is hoofdlettergevoelig!`;
    }
  }

  async function loadCoverageDescription() {
    if (!state.selected) return;
    $("layerStatus").className = "status";
    $("layerStatus").textContent = "DescribeCoverage wordt geladen...";
    try {
      const endpoint = cleanEndpoint($("endpoint").value),
        version = $("version").value;
      const params = { service: "WCS", request: "DescribeCoverage", version };
      if (version.startsWith("2")) params.coverageId = state.selected.qName;
      else if (version.startsWith("1.1"))
        params.identifiers = state.selected.qName;
      else params.coverage = state.selected.qName;
      const xml = await fetchXml(withParams(endpoint, params));
      const env =
        all(xml, "Envelope").find((e) => e.getAttribute("srsName")) ||
        all(xml, "lonLatEnvelope")[0] ||
        null;
      let crs = "",
        axes = [];
      if (env) {
        crs = normalizeCrs(env.getAttribute("srsName") || "");
        axes = (env.getAttribute("axisLabels") || "")
          .trim()
          .split(/\s+/)
          .filter(Boolean);
      }
      state.coverageCrs = crs || null;
      state.coverageAxes = axes;
      const gridAxisNode =
        all(xml, "RectifiedGrid")
          .map((g) => first(g, "axisLabels"))
          .find(Boolean) ||
        all(xml, "axisLabels").find(
          (e) => e.parentElement?.localName === "RectifiedGrid",
        );
      state.gridAxes = (gridAxisNode?.textContent || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const fmts = unique([
        ...state.wcsFormats,
        ...all(xml, "formatSupported").map((e) => e.textContent.trim()),
        ...all(xml, "SupportedFormat").map((e) => e.textContent.trim()),
        ...all(xml, "nativeFormat").map((e) => e.textContent.trim()),
        ...all(xml, "formats").flatMap((x) =>
          all(x, "format").map((e) => e.textContent.trim()),
        ),
      ]);
      state.wcsFormats = fmts.filter(Boolean);
      populateWcsFormats(state.wcsFormats);
      const crsList = unique(
        [
          crs,
          ...all(xml, "SupportedCRS").map((e) => normalizeCrs(e.textContent)),
          ...all(xml, "requestResponseCRSs").map((e) =>
            normalizeCrs(e.textContent),
          ),
        ].filter(Boolean),
      );
      if (crsList.length) {
        addCrsOptions(crsList);
        if (crs && [...$("crs").options].some((o) => o.value === crs))
          $("crs").value = crs;
      }
      $("wcsResolution").value =
        $("crs").value === "EPSG:4326" ? "0.0001" : "10";
      $("layerStatus").className = "status ok";
      $("layerStatus").textContent =
        `Coverage: ${state.selected.qName}\nCRS: ${crs || "niet expliciet gevonden"}\nSubsetassen: ${state.coverageAxes.join(", ") || "niet gevonden"}\nGridassen: ${state.gridAxes.join(", ") || "niet gevonden"}\nFormaten: ${state.wcsFormats.join(", ") || "niet gevonden"}`;
      updateRasterPreviews();
      updateConnectionPreview();
      updateQgisPreview();
    } catch (e) {
      $("layerStatus").className = "status error";
      $("layerStatus").textContent = `DescribeCoverage mislukt: ${e.message}`;
    }
  }

  function escapeHtml(s) {
    return String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }

  $("geometryType").onchange = () => {
    state.geometry =
      $("geometryType").value === "auto" ? null : $("geometryType").value;
    updateSymbologyUI();
    updateQgisPreview();
  };
  $("crs").onchange = () => {
    updateBboxText();
    updateConnectionPreview();
    updateQgisPreview();
  };
  [
    "mode",
    "swapxy",
    "swapxyfilter",
    "maxFeatures",
    "useBbox",
    "version",
    "endpoint",
    "arcgisVersion",
  ].forEach((id) => {
    $(id).addEventListener("change", () => {
      updateConnectionPreview();
      updateQgisPreview();
      updateRasterPreviews();
    });
    $(id).addEventListener("input", () => {
      updateConnectionPreview();
      updateQgisPreview();
      updateRasterPreviews();
    });
  });
  $("qgisRestrictView").addEventListener("change", updateQgisPreview);

  function updateSymbologyUI() {
    ["symPoint", "symLine", "symPolygon"].forEach(
      (id) => ($(id).style.display = "none"),
    );
    $("symAuto").style.display = state.geometry ? "none" : "block";
    if (state.geometry)
      $(
        "sym" + state.geometry[0].toUpperCase() + state.geometry.slice(1),
      ).style.display = "block";
  }

  function setBboxFromBounds(b) {
    state.bbox4326 = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    updateBboxText();
    updateConnectionPreview();
    updateQgisPreview();
    updateRasterPreviews();
  }
  function clearBbox() {
    state.bbox4326 = null;
    drawn.clearLayers();
    updateBboxText();
    updateConnectionPreview();
    updateQgisPreview();
    updateRasterPreviews();
  }
  $("clearBbox").onclick = clearBbox;

  function transformPoint(x, y, from, to) {
    if (from === to) return [x, y];
    try {
      return proj4(from, to, [x, y]);
    } catch (e) {
      throw new Error(`CRS ${to} is niet lokaal gedefinieerd in proj4.`);
    }
  }

  function targetBbox() {
    if (!state.bbox4326) return null;
    const [minx, miny, maxx, maxy] = state.bbox4326;
    const to = $("crs").value;
    const corners = [
      [minx, miny],
      [minx, maxy],
      [maxx, miny],
      [maxx, maxy],
    ].map(([x, y]) => transformPoint(x, y, "EPSG:4326", to));
    const xs = corners.map((p) => p[0]),
      ys = corners.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }

  function fmt(n) {
    return Number(Number(n).toFixed(6)).toString();
  }

  function updateBboxText() {
    $("bbox4326").textContent =
      "WGS84: " + (state.bbox4326 ? state.bbox4326.map(fmt).join(", ") : "-");
    try {
      const b = targetBbox();
      $("bboxTarget").textContent =
        `${$("crs").value}: ` + (b ? b.map(fmt).join(", ") : "-");
    } catch (e) {
      $("bboxTarget").textContent = e.message;
    }
  }

  function hexToRgbValues(hex, alpha = 100) {
    const h = hex.replace("#", "");
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
      Number(alpha),
    ];
  }
  function rgb(hex, alpha = 100) {
    return { type: "CIMRGBColor", values: hexToRgbValues(hex, alpha) };
  }

  function renderer(geom) {
    let symbol;
    if (geom === "point") {
      symbol = {
        type: "CIMPointSymbol",
        symbolLayers: [
          {
            type: "CIMVectorMarker",
            enable: true,
            size: Number($("pointSize").value),
            frame: { xmin: -5, ymin: -5, xmax: 5, ymax: 5 },
            markerGraphics: [
              {
                type: "CIMMarkerGraphic",
                geometry: {
                  rings: [
                    [
                      [-4, -4],
                      [-4, 4],
                      [4, 4],
                      [4, -4],
                      [-4, -4],
                    ],
                  ],
                },
                symbol: {
                  type: "CIMPolygonSymbol",
                  symbolLayers: [
                    {
                      type: "CIMSolidStroke",
                      enable: true,
                      width: 0.8,
                      color: rgb($("pointOutline").value),
                    },
                    {
                      type: "CIMSolidFill",
                      enable: true,
                      color: rgb($("pointColor").value),
                    },
                  ],
                },
              },
            ],
            scaleSymbolsProportionally: true,
            respectFrame: true,
          },
        ],
        angleAlignment: "Map",
      };
    } else if (geom === "line") {
      symbol = {
        type: "CIMLineSymbol",
        symbolLayers: [
          {
            type: "CIMSolidStroke",
            enable: true,
            capStyle: "Round",
            joinStyle: "Round",
            lineStyle3D: "Strip",
            miterLimit: 10,
            width: Number($("lineWidth").value),
            height3D: 1,
            anchor3D: "Center",
            color: rgb($("lineColor").value),
          },
        ],
      };
    } else {
      symbol = {
        type: "CIMPolygonSymbol",
        symbolLayers: [
          {
            type: "CIMSolidStroke",
            enable: true,
            capStyle: "Round",
            joinStyle: "Round",
            lineStyle3D: "Strip",
            miterLimit: 10,
            width: Number($("strokeWidth").value),
            height3D: 1,
            anchor3D: "Center",
            color: rgb($("strokeColor").value),
          },
          {
            type: "CIMSolidFill",
            enable: true,
            color: rgb($("fillColor").value, Number($("fillOpacity").value)),
          },
        ],
        angleAlignment: "Map",
      };
    }
    return {
      type: "CIMSimpleRenderer",
      sampleSize: 10000,
      patch: "Default",
      symbol: { type: "CIMSymbolReference", symbol },
    };
  }

  function wkidFromCrs(crs) {
    const m = (crs || "").match(/EPSG:(\d+)/i);
    if (!m) throw new Error(`ArcGIS WKID kan niet uit ${crs} worden afgeleid.`);
    return m[1];
  }

  function buildConnectionString() {
    const endpoint = cleanEndpoint($("endpoint").value);
    const crs = $("crs").value;
    const bbox = $("useBbox").checked ? targetBbox() : null;
    if ($("useBbox").checked && !bbox)
      throw new Error("Teken eerst een BBOX of schakel BBOX uit.");

    // ArcGIS Pro documenteert BBOX in de workspace connection string enkel voor Snapshot.
    // Voor OnDemand slaan we de gekozen extent daarom op als featureTable.studyArea.
    const parts = [
      `MAXFEATURES=${Math.max(1, Number($("maxFeatures").value) || 3000)}`,
      "MODE=OnDemand",
      "STRINGLENGTH=255",
    ];
    parts.push(
      `SWAPXY=${$("swapxy").value}`,
      `SWAPXYFILTER=${$("swapxyfilter").checked ? "TRUE" : "FALSE"}`,
      `URL=${endpoint}`,
      `VERSION=${$("version").value}`,
      `WKID=${wkidFromCrs(crs)}`,
    );
    return parts.join(";");
  }

  function updateConnectionPreview() {
    try {
      if (!state.selected) {
        $("connectionPreview").value = "";
        $("studyAreaPreview").value = "Geen spatial extent actief.";
        return;
      }
      if (state.serviceType === "WFS") {
        $("connectionPreview").value = buildConnectionString();
        const sa = $("useBbox").checked ? buildStudyArea() : null;
        $("studyAreaPreview").value = sa
          ? JSON.stringify(sa, null, 2)
          : "Geen spatial extent actief.";
      } else {
        $("connectionPreview").value =
          `${state.serviceType} ${$("version").value} | ${cleanEndpoint($("endpoint").value)} | ${state.serviceType === "WMS" ? "layer" : "coverage"}=${state.selected.qName}`;
        const b = $("useBbox").checked ? targetBbox() : null;
        $("studyAreaPreview").value = b
          ? `BBOX (${$("crs").value}): ${b.map(fmt).join(", ")}\nOpmerking: WMS/WCS LYRX bewaart de serviceverbinding; de vaste download-BBOX is geen permanente serverfilter in de ArcGIS service layer.`
          : "Geen vaste BBOX geselecteerd.";
      }
    } catch (e) {
      $("connectionPreview").value = `Nog niet geldig: ${e.message}`;
      $("studyAreaPreview").value = `Nog niet geldig: ${e.message}`;
    }
  }

  function safeName(s) {
    return (
      (s || "WFS_layer")
        .replace(/[^A-Za-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 120) || "WFS_layer"
    );
  }

  function safeDownloadFilename(name, fallback = "download.dat") {
    let n = String(name || "")
      .replace(/[\/\\:*?"<>|\u0000-\u001F\u007F]/g, "_")
      .trim();
    n = n
      .replace(/^\.+/, "")
      .replace(/[ .]+$/g, "")
      .slice(0, 180);
    return n || fallback;
  }

  function buildStudyArea() {
    if (!$("useBbox").checked) return null;
    const bbox = targetBbox();
    if (!bbox) throw new Error("Teken eerst een BBOX of schakel BBOX uit.");
    const [xmin, ymin, xmax, ymax] = bbox;
    return {
      xmin,
      ymin,
      xmax,
      ymax,
      spatialReference: { wkid: Number(wkidFromCrs($("crs").value)) },
    };
  }

  function buildWfsLyrx() {
    if (!state.selected) throw new Error("Geen FeatureType geselecteerd.");
    const geom =
      state.geometry ||
      ($("geometryType").value !== "auto" ? $("geometryType").value : null);
    if (!geom) throw new Error("Kies of detecteer het geometrie-type.");

    const profile = selectedArcgisProfile();
    const connectionString = buildConnectionString();
    const name =
      $("layerName").value.trim() ||
      state.selected.title ||
      state.selected.dataset;
    const cimPath = `CIMPATH=Map1/${safeName(name)}.json`;
    const displayField =
      $("displayField").value || chooseDisplayField(state.fields);
    const studyArea = buildStudyArea();

    const featureTable = {
      type: "CIMFeatureTable",
      editable: true,
      dataConnection: {
        type: "CIMStandardDataConnection",
        workspaceConnectionString: connectionString,
        workspaceFactory: "WFS",
        dataset: state.selected.dataset,
        datasetType: "esriDTFeatureClass",
      },
      ...(studyArea
        ? { studyArea, studyAreaSpatialRel: "esriSpatialRelIntersects" }
        : { studyAreaSpatialRel: "esriSpatialRelUndefined" }),
      searchOrder: "esriSearchOrderSpatial",
    };
    if (displayField) featureTable.displayField = displayField;

    // ArcGIS Pro 3.3 gets its own deliberately minimal CIMFeatureLayer definition.
    // Do not merely relabel a 3.7 document as 3.3: older Pro versions can reject
    // or reinterpret properties serialized by a newer CIM writer.
    let layerDefinition;
    if (profile.template === "3.3") {
      layerDefinition = {
        type: "CIMFeatureLayer",
        name,
        uRI: cimPath,
        description: name,
        expanded: true,
        layerType: "Operational",
        showLegends: true,
        visibility: true,
        featureTable,
        htmlPopupEnabled: true,
        selectable: true,
        renderer: renderer(geom),
        scaleSymbols: true,
        snappable: true,
      };
    } else {
      layerDefinition = {
        type: "CIMFeatureLayer",
        name,
        uRI: cimPath,
        sourceModifiedTime: { type: "TimeInstant" },
        useSourceMetadata: true,
        description: name,
        expanded: true,
        layerType: "Operational",
        showLegends: true,
        visibility: true,
        displayCacheType: "Permanent",
        maxDisplayCacheAge: 5,
        showPopups: true,
        serviceLayerID: -1,
        refreshRate: -1,
        refreshRateUnit: "esriTimeUnitsSeconds",
        blendingMode: "Alpha",
        allowDrapingOnIntegratedMesh: true,
        autoGenerateFeatureTemplates: true,
        featureTable,
        htmlPopupEnabled: true,
        selectable: true,
        featureCacheType: "Session",
        displayFiltersType: "ByScale",
        featureElevationExpressionInfo: {
          type: "CIMExpressionInfo",
          title: "Custom",
          expression: "0",
          returnType: "Default",
        },
        featureBlendingMode: "Alpha",
        layerEffectsMode: "Layer",
        renderer: renderer(geom),
        scaleSymbols: true,
        snappable: true,
      };
    }

    return {
      type: "CIMLayerDocument",
      layers: [cimPath],
      layerDefinitions: [layerDefinition],
      version: profile.cimVersion,
      build: profile.build,
    };
  }

  function buildWmsLyrx() {
    if (!state.selected) throw new Error("Geen WMS-laag geselecteerd.");
    const profile = selectedArcgisProfile(),
      name =
        $("layerName").value.trim() ||
        state.selected.title ||
        state.selected.dataset;
    const cimPath = `CIMPATH=Map1/${safeName(name)}.json`,
      endpoint = cleanEndpoint($("endpoint").value);
    const serviceConnection = {
      type: "CIMWMSServiceConnection",
      serverConnection: { type: "CIMInternetServerConnection", url: endpoint },
      layerName: state.selected.qName,
      version: $("version").value,
    };
    const style = $("wmsStyle").value;
    if (style) serviceConnection.capabilitiesParameters = { styles: style };
    const layer = {
      type: "CIMWMSLayer",
      name,
      uRI: cimPath,
      description: name,
      expanded: true,
      layerType: "Operational",
      showLegends: true,
      visibility: true,
      serviceConnection,
      imageFormat: $("wmsFormat").value || "image/png",
      transparency: 0,
    };
    return {
      type: "CIMLayerDocument",
      layers: [cimPath],
      layerDefinitions: [layer],
      version: profile.cimVersion,
      build: profile.build,
    };
  }

  function buildWcsLyrx() {
    if (!state.selected) throw new Error("Geen WCS-coverage geselecteerd.");
    const profile = selectedArcgisProfile(),
      name =
        $("layerName").value.trim() ||
        state.selected.title ||
        state.selected.dataset;
    const cimPath = `CIMPATH=Map1/${safeName(name)}.json`,
      endpoint = cleanEndpoint($("endpoint").value);
    const dataConnection = {
      type: "CIMWCSServiceConnection",
      serverConnection: { type: "CIMInternetServerConnection", url: endpoint },
      coverageName: state.selected.qName,
      version: $("version").value,
    };
    const layer = {
      type: "CIMRasterLayer",
      name,
      uRI: cimPath,
      description: name,
      expanded: true,
      layerType: "Operational",
      visibility: true,
      dataConnection,
    };
    return {
      type: "CIMLayerDocument",
      layers: [cimPath],
      layerDefinitions: [layer],
      version: profile.cimVersion,
      build: profile.build,
    };
  }

  function buildLyrx() {
    if (state.serviceType === "WMS") return buildWmsLyrx();
    if (state.serviceType === "WCS") return buildWcsLyrx();
    return buildWfsLyrx();
  }

  function xmlEscape(value) {
    return String(value ?? "").replace(
      /[&<>\"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '\"': "&quot;",
          "'": "&apos;",
        })[c],
    );
  }

  function qgisUriQuote(value) {
    return String(value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'");
  }

  function qgisGeometryName(geom) {
    if (geom === "point") return "Point";
    if (geom === "line") return "Line";
    return "Polygon";
  }

  function qgisColor(hex, opacity = 1) {
    const vals = hexToRgbValues(
      hex,
      Math.round(Math.max(0, Math.min(1, opacity)) * 255),
    );
    return `${vals[0]},${vals[1]},${vals[2]},${vals[3]}`;
  }

  function sldColor(hex) {
    return hex.toUpperCase();
  }

  function buildQgisBboxFilter() {
    if (!$("useBbox").checked) return "";
    const b = targetBbox();
    if (!b) throw new Error("Teken eerst een BBOX of schakel BBOX uit.");
    const [xmin, ymin, xmax, ymax] = b.map(fmt);

    // Gebruik bewust een QGIS-expression met @geometry in plaats van een
    // handmatig gekozen PropertyName/ValueReference. QGIS vertaalt dit zelf
    // naar de juiste OGC/FES-filter voor de geselecteerde WFS-versie en kent
    // daarbij de echte geometriekolom van de provider. Dit voorkomt fouten
    // zoals "Property TAG is not geometric" wanneer een XSD-stringveld
    // ten onrechte als geometrieveld wordt geïnterpreteerd.
    const wkt = `POLYGON((${xmin} ${ymin},${xmax} ${ymin},${xmax} ${ymax},${xmin} ${ymax},${xmin} ${ymin}))`;
    return `intersects(@geometry, geomFromWKT('${wkt}'))`;
  }

  function populateWmsFormats(formats) {
    const sel = $("wmsFormat");
    sel.innerHTML = "";
    for (const f of formats) {
      const o = document.createElement("option");
      o.value = f;
      o.textContent = f;
      sel.appendChild(o);
    }
    const pref =
      formats.find((f) => /image\/png$/i.test(f)) ||
      formats.find((f) => /jpeg/i.test(f)) ||
      formats[0];
    if (pref) sel.value = pref;
    sel.disabled = !formats.length;
    $("downloadWms").disabled = !formats.length;
    $("downloadWmsRaw").disabled = !formats.length;
    $("downloadWmsTiles").disabled = !formats.length;
  }
  function populateWmsStyles(styles) {
    const sel = $("wmsStyle");
    sel.innerHTML = '<option value="">Default</option>';
    for (const st of styles) {
      const o = document.createElement("option");
      o.value = st.name;
      o.textContent = st.title ? `${st.title} (${st.name})` : st.name;
      sel.appendChild(o);
    }
  }
  function populateWcsFormats(formats) {
    const sel = $("wcsFormat");
    sel.innerHTML = "";
    for (const f of formats) {
      const o = document.createElement("option");
      o.value = f;
      o.textContent = f;
      sel.appendChild(o);
    }
    const pref =
      formats.find((f) => /geotiff|image\/tiff|image\/geotiff|tiff/i.test(f)) ||
      formats[0];
    if (pref) sel.value = pref;
    sel.disabled = !formats.length;
    $("downloadWcs").disabled = !formats.length;
    $("downloadWcsTiles").disabled = !formats.length;
  }

  function rasterDimensions(resolution) {
    const b = targetBbox();
    if (!b || !resolution || resolution <= 0) return null;
    const width = Math.max(1, Math.ceil(Math.abs(b[2] - b[0]) / resolution));
    const height = Math.max(1, Math.ceil(Math.abs(b[3] - b[1]) / resolution));
    if (width > MAX_RASTER_DIMENSION || height > MAX_RASTER_DIMENSION)
      throw new Error(
        `Gevraagde rasterafmeting (${width} x ${height}) is te groot. Maximum is ${MAX_RASTER_DIMENSION} pixels per zijde; verhoog de pixelresolutie.`,
      );
    return { width, height, b };
  }
  function wmsBboxForRequest(b) {
    return $("version").value === "1.3.0" && $("crs").value === "EPSG:4326"
      ? [b[1], b[0], b[3], b[2]]
      : b;
  }
  function buildWmsRequestUrl(bbox, width = null, height = null) {
    if (!state.selected) throw new Error("Geen WMS-laag geselecteerd.");
    const res = Number($("wmsResolution").value);
    const d =
      bbox && width && height
        ? { b: bbox, width, height }
        : rasterDimensions(res);
    if (!d)
      throw new Error("Teken een BBOX en geef een geldige pixelresolutie in.");
    const version = $("version").value,
      p = {
        service: "WMS",
        request: "GetMap",
        version,
        layers: state.selected.qName,
        styles: $("wmsStyle").value || "",
        bbox: wmsBboxForRequest(d.b).map(fmt).join(","),
        width: d.width,
        height: d.height,
        format: $("wmsFormat").value,
        transparent: $("wmsTransparent").checked ? "TRUE" : "FALSE",
      };
    p[version === "1.3.0" ? "crs" : "srs"] = $("crs").value;
    return withParams(cleanEndpoint($("endpoint").value), p);
  }
  function getWmsRequestUrl() {
    const d = rasterDimensions(Number($("wmsResolution").value));
    if (!d)
      throw new Error("Teken een BBOX en geef een geldige pixelresolutie in.");
    return buildWmsRequestUrl(d.b, d.width, d.height);
  }
  function wmsTiles() {
    const d = rasterDimensions(Number($("wmsResolution").value));
    if (!d) return [];
    const maxPx = Math.max(256, Number($("wmsTileSize").value) || 2048);
    const nx = Math.max(1, Math.ceil(d.width / maxPx)),
      ny = Math.max(1, Math.ceil(d.height / maxPx));
    if (nx * ny > MAX_TILE_COUNT)
      throw new Error(
        `Te veel tegels (${nx * ny}). Maximum is ${MAX_TILE_COUNT}; verhoog de tegelgrootte of pixelresolutie.`,
      );
    const [xmin, ymin, xmax, ymax] = d.b,
      dx = (xmax - xmin) / nx,
      dy = (ymax - ymin) / ny;
    const res = Number($("wmsResolution").value),
      tiles = [];
    for (let row = 0; row < ny; row++)
      for (let col = 0; col < nx; col++) {
        const b = [
          xmin + col * dx,
          ymin + row * dy,
          col === nx - 1 ? xmax : xmin + (col + 1) * dx,
          row === ny - 1 ? ymax : ymin + (row + 1) * dy,
        ];
        const width = Math.max(1, Math.ceil((b[2] - b[0]) / res));
        const height = Math.max(1, Math.ceil((b[3] - b[1]) / res));
        tiles.push({ row, col, b, width, height });
      }
    return tiles;
  }
  async function downloadWmsTileZip(force = false) {
    if (typeof JSZip === "undefined")
      throw new Error("JSZip kon niet worden geladen.");
    const tiles = wmsTiles();
    if (!tiles.length) throw new Error("Geen geldige BBOX/resolutie.");
    if (!force && tiles.length === 1)
      throw new Error("De gekozen tegelgrootte levert slechts één tegel op.");
    const zip = new JSZip(),
      base = safeName($("layerName").value || state.selected.dataset),
      format = $("wmsFormat").value;
    const manifest = [];
    let done = 0,
      totalBytes = 0;
    for (const t of tiles) {
      $("wmsDownloadStatus").textContent =
        `WMS-tegel ${done + 1}/${tiles.length} wordt gedownload...`;
      const url = buildWmsRequestUrl(t.b, t.width, t.height);
      const { blob, contentType } = await fetchBlobOrThrow(url);
      totalBytes += blob.size;
      if (totalBytes > MAX_ZIP_INPUT_BYTES)
        throw new Error(
          `Totale WMS-tegeldata overschrijdt ${Math.floor(MAX_ZIP_INPUT_BYTES / 1024 / 1024)} MB.`,
        );
      const ext = imageExtension(format || contentType);
      if (ext === ".img")
        throw new Error(
          `Niet-ondersteund WMS-rasterformaat voor tegel-download: ${format || contentType}.`,
        );
      const stem = `${base}_r${String(t.row + 1).padStart(2, "0")}_c${String(t.col + 1).padStart(2, "0")}`;
      zip.file(`${stem}${ext}`, blob);
      zip.file(
        `${stem}${worldExtension(ext)}`,
        worldFileText(t.b, t.width, t.height),
      );
      zip.file(`${stem}.prj`, prjWkt($("crs").value));
      manifest.push({
        row: t.row + 1,
        col: t.col + 1,
        bbox: t.b,
        width: t.width,
        height: t.height,
        crs: $("crs").value,
        resolution: Number($("wmsResolution").value),
        format,
        url,
        file: `${stem}${ext}`,
      });
      done++;
    }
    zip.file(
      `${base}_tiles.json`,
      JSON.stringify(
        {
          service: "WMS",
          layer: state.selected.qName,
          style: $("wmsStyle").value || "",
          version: $("version").value,
          crs: $("crs").value,
          resolution: Number($("wmsResolution").value),
          tiles: manifest,
        },
        null,
        2,
      ),
    );
    const zb = await zip.generateAsync({ type: "blob" });
    triggerBlob(zb, `${base}_WMS_tiles_${$("crs").value.replace(":", "")}.zip`);
    return tiles.length;
  }
  function worldFileText(b, width, height) {
    const xres = (b[2] - b[0]) / width,
      yres = (b[3] - b[1]) / height;
    return (
      [xres, 0, 0, -yres, b[0] + xres / 2, b[3] - yres / 2]
        .map((v) => Number(v).toPrecision(15))
        .join("\n") + "\n"
    );
  }
  function prjWkt(crs) {
    const wk = {
      "EPSG:4326":
        'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]',
      "EPSG:3857":
        'PROJCS["WGS 84 / Pseudo-Mercator",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Mercator_1SP"],PARAMETER["central_meridian",0],PARAMETER["scale_factor",1],PARAMETER["false_easting",0],PARAMETER["false_northing",0],UNIT["metre",1]]',
      "EPSG:31370":
        'PROJCS["Belge 1972 / Belgian Lambert 72",GEOGCS["BD72",DATUM["Reseau_National_Belge_1972",SPHEROID["International 1924",6378388,297]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Lambert_Conformal_Conic_2SP"],PARAMETER["standard_parallel_1",49.8333339],PARAMETER["standard_parallel_2",51.16666723333333],PARAMETER["latitude_of_origin",90],PARAMETER["central_meridian",4.367486666666666],PARAMETER["false_easting",150000.013],PARAMETER["false_northing",5400088.438],UNIT["metre",1]]',
    };
    return wk[crs] || `AUTHORITY["EPSG","${crs.split(":").pop()}"]`;
  }
  function imageExtension(fmt) {
    const f = (fmt || "").toLowerCase();
    if (f.includes("png")) return ".png";
    if (f.includes("jpeg") || f.includes("jpg")) return ".jpg";
    if (f.includes("tiff") || f.includes("tif")) return ".tif";
    if (f.includes("gif")) return ".gif";
    return ".img";
  }
  function worldExtension(ext) {
    return ext === ".png"
      ? ".pgw"
      : ext === ".jpg"
        ? ".jgw"
        : ext === ".tif"
          ? ".tfw"
          : ".wld";
  }

  function ogcCrsUri(crs) {
    const m = (crs || "").match(/EPSG:(\d+)/i);
    return m ? `http://www.opengis.net/def/crs/EPSG/0/${m[1]}` : crs;
  }

  function buildWcsRequestUrl(bbox, width = null, height = null) {
    if (!state.selected) throw new Error("Geen coverage geselecteerd.");
    const b = bbox || targetBbox();
    if (!b) throw new Error("Teken eerst een BBOX.");
    const version = $("version").value,
      endpoint = cleanEndpoint($("endpoint").value),
      format = $("wcsFormat").value;
    if (!format) throw new Error("Geen GetCoverage-formaat geselecteerd.");
    const u = new URL(endpoint);
    u.searchParams.set("service", "WCS");
    u.searchParams.set("request", "GetCoverage");
    u.searchParams.set("version", version);
    u.searchParams.set("format", format);
    const res = Number($("wcsResolution").value);
    const dims = width && height ? { width, height, b } : rasterDimensions(res);
    if (version.startsWith("2")) {
      if (state.coverageCrs && $("crs").value !== state.coverageCrs) {
        if (!state.wcsCrsExtension)
          throw new Error(
            `Coverage gebruikt ${state.coverageCrs}; de WCS adverteert geen CRS Extension voor subsetting in ${$("crs").value}.`,
          );
        u.searchParams.set("subsettingCrs", ogcCrsUri($("crs").value));
        u.searchParams.set("outputCrs", ogcCrsUri($("crs").value));
      }
      u.searchParams.set("coverageId", state.selected.qName);
      const axes =
        state.coverageAxes.length >= 2
          ? state.coverageAxes.slice(0, 2)
          : $("crs").value === "EPSG:4326"
            ? ["Long", "Lat"]
            : ["x", "y"];
      u.searchParams.append("subset", `${axes[0]}(${fmt(b[0])},${fmt(b[2])})`);
      u.searchParams.append("subset", `${axes[1]}(${fmt(b[1])},${fmt(b[3])})`);
      if (state.wcsScaling && dims) {
        // ScaleSize uses GRID-axis identifiers, not necessarily the CRS subset-axis identifiers.
        // Prefer RectifiedGrid axisLabels; common fallbacks are i/j.
        const ga =
          state.gridAxes.length >= 2 ? state.gridAxes.slice(0, 2) : ["i", "j"];
        u.searchParams.set(
          "scaleSize",
          `${ga[0]}(${dims.width}),${ga[1]}(${dims.height})`,
        );
      }
    } else if (version.startsWith("1.1")) {
      u.searchParams.set("identifiers", state.selected.qName);
      u.searchParams.set(
        "BoundingBox",
        `${b.map(fmt).join(",")},${$("crs").value}`,
      );
      if (dims) {
        u.searchParams.set("GridBaseCRS", ogcCrsUri($("crs").value));
        u.searchParams.set("GridCS", "urn:ogc:def:cs:OGC:0.0:Grid2dSquareCS");
        u.searchParams.set(
          "GridType",
          "urn:ogc:def:method:WCS:1.1:2dGridIn2dCrs",
        );
      }
    } else {
      u.searchParams.set("coverage", state.selected.qName);
      u.searchParams.set("crs", $("crs").value);
      u.searchParams.set("response_crs", $("crs").value);
      u.searchParams.set("bbox", b.map(fmt).join(","));
      if (res > 0) {
        u.searchParams.set("resx", res);
        u.searchParams.set("resy", res);
      }
    }
    return u.toString();
  }

  function getWcsRequestUrl() {
    return buildWcsRequestUrl(targetBbox());
  }

  function wcsTiles() {
    const d = rasterDimensions(Number($("wcsResolution").value));
    if (!d) return [];
    const maxPx = Math.max(256, Number($("wcsTileSize").value) || 2048);
    const nx = Math.max(1, Math.ceil(d.width / maxPx)),
      ny = Math.max(1, Math.ceil(d.height / maxPx));
    if (nx * ny > MAX_TILE_COUNT)
      throw new Error(
        `Te veel tegels (${nx * ny}). Maximum is ${MAX_TILE_COUNT}; verhoog de tegelgrootte of pixelresolutie.`,
      );
    const [xmin, ymin, xmax, ymax] = d.b,
      dx = (xmax - xmin) / nx,
      dy = (ymax - ymin) / ny;
    const tiles = [];
    for (let row = 0; row < ny; row++)
      for (let col = 0; col < nx; col++) {
        const b = [
          xmin + col * dx,
          ymin + row * dy,
          col === nx - 1 ? xmax : xmin + (col + 1) * dx,
          row === ny - 1 ? ymax : ymin + (row + 1) * dy,
        ];
        const width = Math.max(
          1,
          Math.ceil((b[2] - b[0]) / Number($("wcsResolution").value)),
        );
        const height = Math.max(
          1,
          Math.ceil((b[3] - b[1]) / Number($("wcsResolution").value)),
        );
        tiles.push({ row, col, b, width, height });
      }
    return tiles;
  }

  async function downloadWcsTileZip(force = false) {
    if (typeof JSZip === "undefined")
      throw new Error("JSZip kon niet worden geladen.");
    const tiles = wcsTiles();
    if (!tiles.length) throw new Error("Geen geldige BBOX/resolutie.");
    if (!force && tiles.length === 1)
      throw new Error("De gekozen tegelgrootte levert slechts één tegel op.");
    const zip = new JSZip(),
      base = safeName($("layerName").value || state.selected.dataset),
      format = $("wcsFormat").value;
    let done = 0,
      totalBytes = 0;
    const manifest = [];
    for (const t of tiles) {
      $("wcsDownloadStatus").textContent =
        `WCS-tegel ${done + 1}/${tiles.length} wordt gedownload...`;
      const url = buildWcsRequestUrl(t.b, t.width, t.height);
      const expectsTiff = /tiff|geotiff/i.test(format);
      const { blob, contentType, metadataXml } = await fetchBlobOrThrow(url, {
        expectTiff: expectsTiff,
      });
      totalBytes += blob.size + new Blob([metadataXml || ""]).size;
      if (totalBytes > MAX_ZIP_INPUT_BYTES)
        throw new Error(
          `Totale WCS-tegeldata overschrijdt ${Math.floor(MAX_ZIP_INPUT_BYTES / 1024 / 1024)} MB.`,
        );
      const ext =
        extensionForFormat(format, contentType) === ".dat"
          ? ".tif"
          : extensionForFormat(format, contentType);
      const stem = `${base}_r${String(t.row + 1).padStart(2, "0")}_c${String(t.col + 1).padStart(2, "0")}`;
      zip.file(`${stem}${ext}`, blob);
      if (metadataXml) zip.file(`${stem}_coverage.xml`, metadataXml);
      // WCS GeoTIFF is self-georeferenced. Add sidecars as a robust fallback for generic TIFF.
      if (ext === ".tif" && !/geotiff/i.test(`${format} ${contentType}`)) {
        zip.file(`${stem}.tfw`, worldFileText(t.b, t.width, t.height));
        zip.file(`${stem}.prj`, prjWkt($("crs").value));
      }
      manifest.push({
        file: `${stem}${ext}`,
        bbox: t.b,
        width: t.width,
        height: t.height,
        url,
      });
      done++;
    }
    zip.file(
      `${base}_tiles.json`,
      JSON.stringify(
        {
          crs: $("crs").value,
          resolution: Number($("wcsResolution").value),
          coverage: state.selected.qName,
          tiles: manifest,
        },
        null,
        2,
      ),
    );
    const zb = await zip.generateAsync({ type: "blob" });
    triggerBlob(zb, `${base}_WCS_tiles.zip`);
    return tiles.length;
  }

  function updateRasterPreviews() {
    try {
      if (state.serviceType === "WMS") {
        const d = rasterDimensions(Number($("wmsResolution").value));
        $("wmsDimensions").value = d ? `${d.width} x ${d.height} px` : "-";
        const tiles = wmsTiles();
        $("wmsTileCount").value = tiles.length
          ? `${tiles.length} (${Math.max(1, Math.ceil((d?.width || 1) / (Number($("wmsTileSize").value) || 2048)))} x ${Math.max(1, Math.ceil((d?.height || 1) / (Number($("wmsTileSize").value) || 2048)))})`
          : "-";
        $("wmsRequestPreview").value =
          state.selected && d ? getWmsRequestUrl() : "";
      }
    } catch (e) {
      $("wmsRequestPreview").value = `${e.message}`;
    }
    try {
      if (state.serviceType === "WCS") {
        const d = rasterDimensions(Number($("wcsResolution").value));
        $("wcsDimensions").value = d ? `${d.width} x ${d.height} px` : "-";
        const tiles = wcsTiles();
        $("wcsTileCount").value = tiles.length
          ? `${tiles.length} (${Math.max(1, Math.ceil((d?.width || 1) / (Number($("wcsTileSize").value) || 2048)))} x ${Math.max(1, Math.ceil((d?.height || 1) / (Number($("wcsTileSize").value) || 2048)))})`
          : "-";
        $("wcsRequestPreview").value =
          state.selected && targetBbox() ? getWcsRequestUrl() : "";
        $("wcsResolutionHint").textContent = $("version").value.startsWith("2")
          ? state.wcsScaling
            ? "WCS 2.x Scaling Extension gedetecteerd: SCALESIZE wordt toegepast."
            : "WCS 2.x: geen Scaling Extension gedetecteerd; BBOX wordt toegepast maar de server bepaalt de native resolutie."
          : $("version").value.startsWith("1.0")
            ? "WCS 1.0: RESX/RESY worden toegepast."
            : "WCS 1.1: BBOX wordt toegepast; resolutieondersteuning verschilt per server.";
      }
    } catch (e) {
      $("wcsRequestPreview").value = `${e.message}`;
    }
  }

  function buildQgisDatasourceUri() {
    if (state.serviceType === "WMS") {
      if (!state.selected) return "";
      const style = $("wmsStyle").value || "";
      const fmt = $("wmsFormat").value || "image/png";
      return `contextualWMSLegend=0&crs=${encodeURIComponent($("crs").value)}&dpiMode=7&featureCount=10&format=${encodeURIComponent(fmt)}&layers=${encodeURIComponent(state.selected.qName)}&styles=${encodeURIComponent(style)}&url=${encodeURIComponent(cleanEndpoint($("endpoint").value))}`;
    }
    if (state.serviceType === "WCS") {
      if (!state.selected) return "";
      return `cache=AlwaysNetwork&crs=${encodeURIComponent($("crs").value)}&identifier=${encodeURIComponent(state.selected.qName)}&url=${encodeURIComponent(cleanEndpoint($("endpoint").value))}`;
    }
    if (!state.selected) throw new Error("Geen FeatureType geselecteerd.");
    const params = [
      `url='${qgisUriQuote(cleanEndpoint($("endpoint").value))}'`,
      `typename='${qgisUriQuote(state.selected.qName)}'`,
      `srsname='${qgisUriQuote($("crs").value)}'`,
      `version='${qgisUriQuote($("version").value)}'`,
      `maxNumFeatures='${Math.max(1, Number($("maxFeatures").value) || 3000)}'`,
    ];
    if ($("qgisRestrictView").checked) params.push("restrictToRequestBBOX='1'");
    const filter = buildQgisBboxFilter();
    if (filter) params.push(`filter='${qgisUriQuote(filter)}'`);
    return params.join(" ");
  }

  function updateQgisPreview() {
    try {
      if (!state.selected) {
        $("qgisDatasourcePreview").value = "";
        $("qgisFilterPreview").value = "";
        return;
      }
      $("qgisDatasourcePreview").value = buildQgisDatasourceUri();
      $("qgisFilterPreview").value =
        state.serviceType === "WFS"
          ? buildQgisBboxFilter() || "Geen vaste BBOX-filter actief."
          : "";
      $("qgisExportStatus").className = "status";
      $("qgisExportStatus").textContent =
        `Klaar voor QGIS QLR-export (${state.serviceType}).`;
    } catch (e) {
      $("qgisDatasourcePreview").value = `${e.message}`;
    }
  }

  function buildSld() {
    if (!state.selected) throw new Error("Geen FeatureType geselecteerd.");
    const geom =
      state.geometry ||
      ($("geometryType").value !== "auto" ? $("geometryType").value : null);
    if (!geom) throw new Error("Kies of detecteer het geometrie-type.");
    const name = xmlEscape(state.selected.qName);
    const title = xmlEscape(
      $("layerName").value.trim() ||
        state.selected.title ||
        state.selected.dataset,
    );
    let symbolizer = "";
    if (geom === "point") {
      symbolizer = `<sld:PointSymbolizer><sld:Graphic><sld:Mark><sld:WellKnownName>circle</sld:WellKnownName><sld:Fill><sld:CssParameter name="fill">${sldColor($("pointColor").value)}</sld:CssParameter></sld:Fill><sld:Stroke><sld:CssParameter name="stroke">${sldColor($("pointOutline").value)}</sld:CssParameter><sld:CssParameter name="stroke-width">0.8</sld:CssParameter></sld:Stroke></sld:Mark><sld:Size>${Number($("pointSize").value) || 8}</sld:Size></sld:Graphic></sld:PointSymbolizer>`;
    } else if (geom === "line") {
      symbolizer = `<sld:LineSymbolizer><sld:Stroke><sld:CssParameter name="stroke">${sldColor($("lineColor").value)}</sld:CssParameter><sld:CssParameter name="stroke-width">${Number($("lineWidth").value) || 1.5}</sld:CssParameter></sld:Stroke></sld:LineSymbolizer>`;
    } else {
      const opacity = Math.max(
        0,
        Math.min(1, (Number($("fillOpacity").value) || 0) / 100),
      );
      symbolizer = `<sld:PolygonSymbolizer><sld:Fill><sld:CssParameter name="fill">${sldColor($("fillColor").value)}</sld:CssParameter><sld:CssParameter name="fill-opacity">${opacity}</sld:CssParameter></sld:Fill><sld:Stroke><sld:CssParameter name="stroke">${sldColor($("strokeColor").value)}</sld:CssParameter><sld:CssParameter name="stroke-width">${Number($("strokeWidth").value) || 0.7}</sld:CssParameter></sld:Stroke></sld:PolygonSymbolizer>`;
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n<sld:StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:sld="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">\n  <sld:NamedLayer>\n    <sld:Name>${name}</sld:Name>\n    <sld:UserStyle>\n      <sld:Title>${title}</sld:Title>\n      <sld:FeatureTypeStyle>\n        <sld:Rule>${symbolizer}</sld:Rule>\n      </sld:FeatureTypeStyle>\n    </sld:UserStyle>\n  </sld:NamedLayer>\n</sld:StyledLayerDescriptor>\n`;
  }

  function qgisRendererXml(geom) {
    if (geom === "point") {
      return `<renderer-v2 type="singleSymbol" symbollevels="0" forceraster="0" enableorderby="0"><symbols><symbol type="marker" name="0" alpha="1" clip_to_extent="1"><layer class="SimpleMarker" enabled="1" pass="0"><Option type="Map"><Option name="name" type="QString" value="circle"/><Option name="color" type="QString" value="${qgisColor($("pointColor").value)}"/><Option name="outline_color" type="QString" value="${qgisColor($("pointOutline").value)}"/><Option name="outline_width" type="QString" value="0.8"/><Option name="size" type="QString" value="${Number($("pointSize").value) || 8}"/></Option></layer></symbol></symbols></renderer-v2>`;
    }
    if (geom === "line") {
      return `<renderer-v2 type="singleSymbol" symbollevels="0" forceraster="0" enableorderby="0"><symbols><symbol type="line" name="0" alpha="1" clip_to_extent="1"><layer class="SimpleLine" enabled="1" pass="0"><Option type="Map"><Option name="line_color" type="QString" value="${qgisColor($("lineColor").value)}"/><Option name="line_width" type="QString" value="${Number($("lineWidth").value) || 1.5}"/><Option name="line_style" type="QString" value="solid"/></Option></layer></symbol></symbols></renderer-v2>`;
    }
    const opacity = Math.max(
      0,
      Math.min(1, (Number($("fillOpacity").value) || 0) / 100),
    );
    return `<renderer-v2 type="singleSymbol" symbollevels="0" forceraster="0" enableorderby="0"><symbols><symbol type="fill" name="0" alpha="1" clip_to_extent="1"><layer class="SimpleFill" enabled="1" pass="0"><Option type="Map"><Option name="color" type="QString" value="${qgisColor($("fillColor").value, opacity)}"/><Option name="outline_color" type="QString" value="${qgisColor($("strokeColor").value)}"/><Option name="outline_width" type="QString" value="${Number($("strokeWidth").value) || 0.7}"/><Option name="style" type="QString" value="solid"/></Option></layer></symbol></symbols></renderer-v2>`;
  }

  function buildQlr() {
    if (!state.selected) throw new Error("Geen laag of coverage geselecteerd.");
    if (state.serviceType === "WMS") {
      const name =
        $("layerName").value.trim() ||
        state.selected.title ||
        state.selected.dataset;
      const id = `${safeName(name)}_${Date.now()}`;
      const datasource = buildQgisDatasourceUri();
      return `<?xml version="1.0" encoding="UTF-8"?>\n<qlr><layer-tree-group name="" checked="Qt::Checked" expanded="1"><customproperties/><layer-tree-layer id="${xmlEscape(id)}" name="${xmlEscape(name)}" source="${xmlEscape(datasource)}" providerKey="wms" checked="Qt::Checked" expanded="1"/></layer-tree-group><maplayers><maplayer type="raster" hasScaleBasedVisibilityFlag="0"><id>${xmlEscape(id)}</id><datasource>${xmlEscape(datasource)}</datasource><layername>${xmlEscape(name)}</layername><srs><spatialrefsys><authid>${xmlEscape($("crs").value)}</authid></spatialrefsys></srs><provider>wms</provider></maplayer></maplayers></qlr>\n`;
    }
    if (state.serviceType === "WCS") {
      const name =
        $("layerName").value.trim() ||
        state.selected.title ||
        state.selected.dataset;
      const id = `${safeName(name)}_${Date.now()}`;
      const datasource = buildQgisDatasourceUri();
      return `<?xml version="1.0" encoding="UTF-8"?>\n<qlr><layer-tree-group name="" checked="Qt::Checked" expanded="1"><customproperties/><layer-tree-layer id="${xmlEscape(id)}" name="${xmlEscape(name)}" source="${xmlEscape(datasource)}" providerKey="wcs" checked="Qt::Checked" expanded="1"/></layer-tree-group><maplayers><maplayer type="raster" hasScaleBasedVisibilityFlag="0"><id>${xmlEscape(id)}</id><datasource>${xmlEscape(datasource)}</datasource><layername>${xmlEscape(name)}</layername><srs><spatialrefsys><authid>${xmlEscape($("crs").value)}</authid></spatialrefsys></srs><provider>wcs</provider></maplayer></maplayers></qlr>\n`;
    }
    const geom =
      state.geometry ||
      ($("geometryType").value !== "auto" ? $("geometryType").value : null);
    if (!geom) throw new Error("Kies of detecteer het geometrie-type.");
    const name =
      $("layerName").value.trim() ||
      state.selected.title ||
      state.selected.dataset;
    const id = `${safeName(name)}_${Date.now()}`;
    const datasource = buildQgisDatasourceUri();
    const displayField =
      $("displayField").value || chooseDisplayField(state.fields) || "";
    return `<?xml version="1.0" encoding="UTF-8"?>\n<qlr>\n  <layer-tree-group name="" checked="Qt::Checked" expanded="1">\n    <customproperties/>\n    <layer-tree-layer id="${xmlEscape(id)}" name="${xmlEscape(name)}" source="${xmlEscape(datasource)}" providerKey="WFS" checked="Qt::Checked" expanded="1"/>\n  </layer-tree-group>\n  <maplayers>\n    <maplayer type="vector" geometry="${qgisGeometryName(geom)}" simplifyDrawingHints="1" simplifyAlgorithm="0" simplifyLocal="1" simplifyMaxScale="1" simplifyDrawingTol="1" readOnly="0" hasScaleBasedVisibilityFlag="0" maxScale="0" minScale="100000000">\n      <id>${xmlEscape(id)}</id>\n      <datasource>${xmlEscape(datasource)}</datasource>\n      <layername>${xmlEscape(name)}</layername>\n      <srs><spatialrefsys><authid>${xmlEscape($("crs").value)}</authid><description>${xmlEscape($("crs").value)}</description></spatialrefsys></srs>\n      <provider encoding="UTF-8">WFS</provider>\n      ${qgisRendererXml(geom)}\n      <layerOpacity>1</layerOpacity>\n      <previewExpression>${xmlEscape(displayField ? `\"${displayField}\"` : "")}</previewExpression>\n    </maplayer>\n  </maplayers>\n</qlr>\n`;
  }

  function downloadTextFile(text, filename, mime) {
    const blob = new Blob([text], { type: mime });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  $("exportQlr").onclick = () => {
    try {
      const text = buildQlr();
      const filename = `${safeName($("layerName").value || state.selected.dataset)}_QGIS.qlr`;
      downloadTextFile(text, filename, "application/xml");
      $("qgisExportStatus").className = "status ok";
      $("qgisExportStatus").textContent =
        `QLR gegenereerd: ${filename}.\n${state.serviceType} endpoint, laag/coverage en CRS zijn opgenomen${state.serviceType === "WFS" ? ", inclusief vectorstijl" : state.serviceType === "WMS" ? ", inclusief gekozen WMS-serverstijl" : ""}.`;
    } catch (e) {
      $("qgisExportStatus").className = "status error";
      $("qgisExportStatus").textContent = `QLR-export mislukt: ${e.message}`;
    }
  };

  $("exportSld").onclick = () => {
    try {
      const text = buildSld();
      const filename = `${safeName($("layerName").value || state.selected.dataset)}.sld`;
      downloadTextFile(text, filename, "application/vnd.ogc.sld+xml");
      $("qgisExportStatus").className = "status ok";
      $("qgisExportStatus").textContent =
        `SLD gegenereerd: ${filename}.\nSLD bevat alleen symbologie; open dit bestand niet als databron. Voeg eerst de WFS/QLR-laag toe en laad daarna de SLD als stijl via Laageigenschappen > Symbologie > Stijl > Stijl laden.`;
    } catch (e) {
      $("qgisExportStatus").className = "status error";
      $("qgisExportStatus").textContent = `SLD-export mislukt: ${e.message}`;
    }
  };

  function getFeatureRequestUrl(outputFormat) {
    if (!state.selected) throw new Error("Geen FeatureType geselecteerd.");
    const endpoint = cleanEndpoint($("endpoint").value);
    const version = $("version").value;
    const params = {
      service: "WFS",
      request: "GetFeature",
      version,
      outputFormat,
      srsName: $("crs").value,
    };
    params[version.startsWith("2") ? "typeNames" : "typeName"] =
      state.selected.qName;
    const max = Math.max(1, Number($("maxFeatures").value) || 3000);
    if (version.startsWith("2")) params.count = String(max);
    else params.maxFeatures = String(max);
    if ($("useBbox").checked) {
      const b = targetBbox();
      if (!b) throw new Error("Teken eerst een BBOX of schakel BBOX uit.");
      // WFS BBOX is minx,miny,maxx,maxy[,crs]. The selected CRS is explicitly appended.
      params.bbox = `${b.map(fmt).join(",")},${$("crs").value}`;
    }
    return withParams(endpoint, params);
  }

  function extensionForFormat(format, contentType = "") {
    const v = `${format || ""} ${contentType || ""}`.toLowerCase();
    if (
      v.includes("shape-zip") ||
      v.includes("shapefile") ||
      v.includes("application/zip")
    )
      return ".zip";
    if (v.includes("geopackage") || v.includes("gpkg")) return ".gpkg";
    if (v.includes("geotiff") || v.includes("tiff") || v.includes("image/tif"))
      return ".tif";
    if (v.includes("netcdf")) return ".nc";
    if (v.includes("jp2") || v.includes("jpeg2000")) return ".jp2";
    if (
      v.includes("geojson") ||
      v.includes("application/json") ||
      v.includes("json; subtype=geojson")
    )
      return ".geojson";
    if (v.includes("csv")) return ".csv";
    if (v.includes("kml")) return ".kml";
    if (v.includes("gml")) return ".gml";
    if (v.includes("xml")) return ".xml";
    return ".dat";
  }

  function filenameFromDisposition(disposition) {
    if (!disposition) return "";
    const utf = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf) {
      try {
        return safeDownloadFilename(
          decodeURIComponent(utf[1].replace(/["']/g, "")),
          "",
        );
      } catch {}
    }
    const plain = disposition.match(/filename="?([^";]+)"?/i);
    return plain ? safeDownloadFilename(plain[1].trim(), "") : "";
  }

  $("downloadFeatures").onclick = async () => {
    try {
      const format = $("downloadFormat").value;
      if (!format) throw new Error("Geen outputformaat geselecteerd.");
      const url = getFeatureRequestUrl(format);
      $("downloadStatus").className = "status";
      $("downloadStatus").textContent = "GetFeature wordt gedownload...";
      validateEndpointUrl(url);
      const r = await fetch(url, {
        headers: { Accept: "*/*" },
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`);
      enforceDeclaredSize(r, MAX_SINGLE_DOWNLOAD_BYTES, "Download");
      const contentType = r.headers.get("content-type") || "";
      const blob = await r.blob();
      if (blob.size > MAX_SINGLE_DOWNLOAD_BYTES)
        throw new Error(
          `Download overschrijdt ${Math.floor(MAX_SINGLE_DOWNLOAD_BYTES / 1024 / 1024)} MB.`,
        );
      let filename = filenameFromDisposition(
        r.headers.get("content-disposition"),
      );
      if (!filename)
        filename = `${safeName($("layerName").value || state.selected.dataset)}${extensionForFormat(format, contentType)}`;
      filename = safeDownloadFilename(filename, "download.dat");
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 2000);
      $("downloadStatus").className = "status ok";
      $("downloadStatus").textContent =
        `Download gereed: ${filename}\nOutputFormat: ${format}${$("useBbox").checked ? "\nBBOX-filter toegepast." : ""}`;
    } catch (e) {
      $("downloadStatus").className = "status error";
      $("downloadStatus").textContent =
        `Download mislukt: ${e.message}\nControleer of de WFS dit outputformaat via HTTP GET ondersteunt en CORS toelaat.`;
    }
  };

  function bytesOfAscii(s) {
    return Uint8Array.from(Array.from(s, (ch) => ch.charCodeAt(0) & 0xff));
  }
  function indexOfBytes(haystack, needle, start = 0) {
    outer: for (let i = start; i <= haystack.length - needle.length; i++) {
      for (let j = 0; j < needle.length; j++)
        if (haystack[i + j] !== needle[j]) continue outer;
      return i;
    }
    return -1;
  }
  function startsWithBytes(data, arr) {
    return arr.every((v, i) => data[i] === v);
  }
  function isTiffBytes(data) {
    if (!data || data.length < 4) return false;
    // Classic TIFF: II*\0 or MM\0* ; BigTIFF: II+\0 or MM\0+
    return (
      (data[0] === 0x49 &&
        data[1] === 0x49 &&
        (data[2] === 0x2a || data[2] === 0x2b) &&
        data[3] === 0x00) ||
      (data[0] === 0x4d &&
        data[1] === 0x4d &&
        data[2] === 0x00 &&
        (data[3] === 0x2a || data[3] === 0x2b))
    );
  }
  function extractBoundary(contentType, bytes) {
    const m = (contentType || "").match(
      /boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i,
    );
    if (m) return m[1] || m[2];
    // Some WCS servers/proxies omit the multipart Content-Type header. Detect the first --boundary line.
    if (bytes.length >= 4 && bytes[0] === 45 && bytes[1] === 45) {
      let end = 2;
      while (
        end < bytes.length &&
        bytes[end] !== 10 &&
        bytes[end] !== 13 &&
        end < 200
      )
        end++;
      if (end > 2)
        return new TextDecoder("ascii").decode(bytes.slice(2, end)).trim();
    }
    return "";
  }
  function parseMultipartResponse(arrayBuffer, contentType) {
    const data = new Uint8Array(arrayBuffer),
      boundary = extractBoundary(contentType, data);
    if (!boundary) return [];
    const marker = bytesOfAscii(`--${boundary}`),
      crlfMarker = bytesOfAscii(`\r\n--${boundary}`),
      lfMarker = bytesOfAscii(`\n--${boundary}`);
    const headerSepCRLF = bytesOfAscii("\r\n\r\n"),
      headerSepLF = bytesOfAscii("\n\n");
    const dec = new TextDecoder("utf-8");
    const parts = [];
    let pos = indexOfBytes(data, marker, 0);
    while (pos >= 0) {
      let p = pos + marker.length;
      if (data[p] === 45 && data[p + 1] === 45) break;
      if (data[p] === 13 && data[p + 1] === 10) p += 2;
      else if (data[p] === 10) p += 1;
      let hs = indexOfBytes(data, headerSepCRLF, p),
        sepLen = 4;
      const hs2 = indexOfBytes(data, headerSepLF, p);
      if (hs < 0 || (hs2 >= 0 && hs2 < hs)) {
        hs = hs2;
        sepLen = 2;
      }
      if (hs < 0) break;
      const headerText = dec.decode(data.slice(p, hs));
      const headers = {};
      for (const line of headerText.split(/\r?\n/)) {
        const k = line.indexOf(":");
        if (k > 0)
          headers[line.slice(0, k).trim().toLowerCase()] = line
            .slice(k + 1)
            .trim();
      }
      const bodyStart = hs + sepLen;
      let next = indexOfBytes(data, crlfMarker, bodyStart),
        prefixLen = 2;
      const next2 = indexOfBytes(data, lfMarker, bodyStart);
      if (next < 0 || (next2 >= 0 && next2 < next)) {
        next = next2;
        prefixLen = 1;
      }
      if (next < 0) {
        next = indexOfBytes(data, marker, bodyStart);
        prefixLen = 0;
      }
      if (next < 0) break;
      let bodyEnd = next;
      const body = data.slice(bodyStart, bodyEnd);
      parts.push({
        headers,
        bytes: body,
        contentType: headers["content-type"] || "",
        disposition: headers["content-disposition"] || "",
        contentId: headers["content-id"] || "",
      });
      pos = next + prefixLen;
    }
    return parts;
  }
  function compactXmlError(bytes) {
    try {
      const t = new TextDecoder("utf-8").decode(bytes);
      if (/Exception|ServiceException|ExceptionReport/i.test(t))
        return t
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 700);
    } catch {}
    return "";
  }
  async function fetchBlobOrThrow(url, options = {}) {
    validateEndpointUrl(url);
    const r = await fetch(url, {
      headers: { Accept: "*/*" },
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    enforceDeclaredSize(r, MAX_SINGLE_DOWNLOAD_BYTES, "Download");
    const ct = r.headers.get("content-type") || "",
      disposition = r.headers.get("content-disposition") || "";
    const ab = await r.arrayBuffer();
    if (ab.byteLength > MAX_SINGLE_DOWNLOAD_BYTES)
      throw new Error(
        `Download overschrijdt ${Math.floor(MAX_SINGLE_DOWNLOAD_BYTES / 1024 / 1024)} MB.`,
      );
    const bytes = new Uint8Array(ab);
    if (!r.ok) {
      const detail =
        compactXmlError(bytes) ||
        (() => {
          try {
            return new TextDecoder("utf-8")
              .decode(bytes.slice(0, 1200))
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 700);
          } catch {
            return "";
          }
        })();
      throw new Error(
        `HTTP ${r.status} ${r.statusText}${detail ? `: ${detail}` : ""}`,
      );
    }

    const looksMultipart =
      /multipart\//i.test(ct) || (bytes[0] === 45 && bytes[1] === 45);
    if (looksMultipart) {
      const parts = parseMultipartResponse(ab, ct);
      if (!parts.length)
        throw new Error(
          "De WCS-server stuurde een multipart-response, maar de onderdelen konden niet worden gescheiden.",
        );
      const xmlPart = parts.find((p) => /xml|gml/i.test(p.contentType));
      const rasterPart =
        parts.find((p) =>
          /image\/(?:tiff|geotiff)|application\/(?:geotiff|x-geotiff)/i.test(
            p.contentType,
          ),
        ) ||
        parts.find(
          (p) =>
            /\.tiff?\b/i.test(p.disposition) || /\.tiff?\b/i.test(p.contentId),
        ) ||
        parts.find((p) => isTiffBytes(p.bytes)) ||
        parts.find((p) => !/xml|gml|text\//i.test(p.contentType));
      if (!rasterPart) {
        const detail = xmlPart ? compactXmlError(xmlPart.bytes) : "";
        throw new Error(
          `Multipart WCS-response bevat geen rasteronderdeel${detail ? `: ${detail}` : ""}.`,
        );
      }
      if (options.expectTiff && !isTiffBytes(rasterPart.bytes)) {
        const detail =
          compactXmlError(rasterPart.bytes) ||
          (xmlPart ? compactXmlError(xmlPart.bytes) : "");
        throw new Error(
          `Het uitgepakte WCS-onderdeel is geen geldige TIFF${detail ? `: ${detail}` : ""}.`,
        );
      }
      return {
        blob: new Blob([rasterPart.bytes], {
          type: rasterPart.contentType || "application/octet-stream",
        }),
        contentType: rasterPart.contentType || ct,
        disposition: rasterPart.disposition || disposition,
        multipart: true,
        metadataXml: xmlPart
          ? new TextDecoder("utf-8").decode(xmlPart.bytes)
          : "",
      };
    }

    if (/xml|text\/html/i.test(ct)) {
      const detail = compactXmlError(bytes);
      if (detail) throw new Error(detail);
    }
    if (options.expectTiff && !isTiffBytes(bytes)) {
      const detail = compactXmlError(bytes);
      throw new Error(
        `De WCS-response is geen geldige TIFF${detail ? `: ${detail}` : ""}.`,
      );
    }
    return {
      blob: new Blob([bytes], { type: ct || "application/octet-stream" }),
      contentType: ct,
      disposition,
      multipart: false,
      metadataXml: "",
    };
  }
  function triggerBlob(blob, filename) {
    const href = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = href;
    a.download = safeDownloadFilename(filename, "download.dat");
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 2000);
  }

  $("downloadWmsRaw").onclick = async () => {
    try {
      const url = getWmsRequestUrl();
      $("wmsDownloadStatus").textContent = "GetMap wordt gedownload...";
      const { blob, contentType } = await fetchBlobOrThrow(url);
      const ext = imageExtension($("wmsFormat").value || contentType);
      const fn = `${safeName($("layerName").value || state.selected.dataset)}${ext}`;
      triggerBlob(blob, fn);
      $("wmsDownloadStatus").className = "status ok";
      $("wmsDownloadStatus").textContent = `Beeld gedownload: ${fn}`;
    } catch (e) {
      $("wmsDownloadStatus").className = "status error";
      $("wmsDownloadStatus").textContent = `WMS-download mislukt: ${e.message}`;
    }
  };
  $("downloadWms").onclick = async () => {
    try {
      if (typeof JSZip === "undefined")
        throw new Error("JSZip kon niet worden geladen.");
      const d = rasterDimensions(Number($("wmsResolution").value));
      if (!d) throw new Error("Geen geldige BBOX/resolutie.");
      const maxPx = Math.max(256, Number($("wmsTileSize").value) || 2048);
      if ($("wmsAutoTile").checked && (d.width > maxPx || d.height > maxPx)) {
        const n = await downloadWmsTileZip(true);
        $("wmsDownloadStatus").className = "status ok";
        $("wmsDownloadStatus").textContent =
          `De GetMap (${d.width} x ${d.height} px) overschrijdt de tegelgrens. ${n} WMS-tegels zijn als gegeorefereerde ZIP opgeslagen.`;
        return;
      }
      const url = getWmsRequestUrl();
      $("wmsDownloadStatus").textContent =
        "GetMap en georeferentie worden opgebouwd...";
      const { blob, contentType } = await fetchBlobOrThrow(url);
      const ext = imageExtension($("wmsFormat").value || contentType),
        base = safeName($("layerName").value || state.selected.dataset);
      const zip = new JSZip();
      zip.file(`${base}${ext}`, blob);
      zip.file(
        `${base}${worldExtension(ext)}`,
        worldFileText(d.b, d.width, d.height),
      );
      zip.file(`${base}.prj`, prjWkt($("crs").value));
      zip.file(`${base}_GetMap_URL.txt`, url);
      const zb = await zip.generateAsync({ type: "blob" });
      triggerBlob(zb, `${base}_WMS_${$("crs").value.replace(":", "")}.zip`);
      $("wmsDownloadStatus").className = "status ok";
      $("wmsDownloadStatus").textContent =
        `ZIP gereed met ${ext}, ${worldExtension(ext)}, .prj en GetMap-URL.`;
    } catch (e) {
      if ($("wmsAutoTile").checked) {
        try {
          $("wmsDownloadStatus").textContent =
            `Enkelvoudige GetMap faalde (${e.message}). Automatisch overschakelen naar tegels...`;
          const n = await downloadWmsTileZip(true);
          $("wmsDownloadStatus").className = "status ok";
          $("wmsDownloadStatus").textContent =
            `Enkelvoudige GetMap faalde; download is opgesplitst in ${n} gegeorefereerde WMS-tegels.`;
          return;
        } catch (te) {
          $("wmsDownloadStatus").className = "status error";
          $("wmsDownloadStatus").textContent =
            `WMS-download en tegel-fallback mislukten.\nDirect: ${e.message}\nTegels: ${te.message}`;
          return;
        }
      }
      $("wmsDownloadStatus").className = "status error";
      $("wmsDownloadStatus").textContent = `WMS-download mislukt: ${e.message}`;
    }
  };
  $("downloadWmsTiles").onclick = async () => {
    try {
      $("wmsDownloadStatus").className = "status";
      const n = await downloadWmsTileZip(true);
      $("wmsDownloadStatus").className = "status ok";
      $("wmsDownloadStatus").textContent =
        `${n} WMS-tegels gedownload als gegeorefereerde ZIP.`;
    } catch (e) {
      $("wmsDownloadStatus").className = "status error";
      $("wmsDownloadStatus").textContent =
        `WMS-tegeldownload mislukt: ${e.message}`;
    }
  };
  $("downloadWcs").onclick = async () => {
    try {
      const url = getWcsRequestUrl();
      $("wcsDownloadStatus").className = "status";
      $("wcsDownloadStatus").textContent =
        "GetCoverage wordt gedownload en gecontroleerd...";
      const format = $("wcsFormat").value;
      const { blob, contentType, disposition, multipart } =
        await fetchBlobOrThrow(url, {
          expectTiff: /tiff|geotiff/i.test(format),
        });
      let fn = filenameFromDisposition(disposition);
      if (!fn)
        fn = `${safeName($("layerName").value || state.selected.dataset)}${extensionForFormat(format, contentType)}`;
      triggerBlob(blob, fn);
      $("wcsDownloadStatus").className = "status ok";
      $("wcsDownloadStatus").textContent =
        `Coverage gedownload: ${fn}${multipart ? "\nMultipart WCS-response automatisch uitgepakt; alleen de rasterdata is opgeslagen." : ""}\nBBOX en gevraagde resolutie toegepast waar door de service ondersteund.`;
    } catch (e) {
      if ($("wcsAutoTile").checked) {
        try {
          $("wcsDownloadStatus").textContent =
            `Enkelvoudige request faalde (${e.message}). Automatisch overschakelen naar tegels...`;
          const n = await downloadWcsTileZip(true);
          $("wcsDownloadStatus").className = "status ok";
          $("wcsDownloadStatus").textContent =
            `Enkelvoudige GetCoverage faalde; download is opgesplitst in ${n} geldige WCS-rastertegels en als ZIP opgeslagen.`;
          return;
        } catch (te) {
          $("wcsDownloadStatus").className = "status error";
          $("wcsDownloadStatus").textContent =
            `WCS-download en tegel-fallback mislukten.\nDirect: ${e.message}\nTegels: ${te.message}`;
          return;
        }
      }
      $("wcsDownloadStatus").className = "status error";
      $("wcsDownloadStatus").textContent = `WCS-download mislukt: ${e.message}`;
    }
  };
  $("downloadWcsTiles").onclick = async () => {
    try {
      $("wcsDownloadStatus").className = "status";
      const n = await downloadWcsTileZip(true);
      $("wcsDownloadStatus").className = "status ok";
      $("wcsDownloadStatus").textContent =
        `${n} WCS-tegels gedownload als ZIP.`;
    } catch (e) {
      $("wcsDownloadStatus").className = "status error";
      $("wcsDownloadStatus").textContent =
        `Tegel-download mislukt: ${e.message}`;
    }
  };

  $("exportLyrx").onclick = () => {
    try {
      const obj = buildLyrx();
      const text = JSON.stringify(obj, null, 2);
      const blob = new Blob([text], { type: "application/json" });
      const a = document.createElement("a");
      const href = URL.createObjectURL(blob);
      a.href = href;
      a.download = `${safeName($("layerName").value || state.selected.dataset)}_ArcGISPro_${$("arcgisVersion").value.replaceAll(".", "_")}.lyrx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
      $("exportStatus").className = "status ok";
      const profile = selectedArcgisProfile();
      $("exportStatus").textContent =
        `LYRX gegenereerd voor ${profile.label}.\nService: ${state.serviceType}\nCIM version/build: ${profile.cimVersion} / ${profile.build}\nLaag/coverage: ${state.selected.qName}${state.serviceType === "WFS" ? `\n${$("useBbox").checked ? "BBOX actief als CIMFeatureTable.studyArea -> MODE=OnDemand." : "Geen BBOX-filter -> MODE=OnDemand."}` : "\nServiceverbinding opgenomen in LYRX."}`;
    } catch (e) {
      $("exportStatus").className = "status error";
      $("exportStatus").textContent = `Export mislukt: ${e.message}`;
    }
  };

  [
    "pointColor",
    "pointSize",
    "pointOutline",
    "lineColor",
    "lineWidth",
    "fillColor",
    "fillOpacity",
    "strokeColor",
    "strokeWidth",
    "layerName",
    "displayField",
  ].forEach((id) => {
    $(id).addEventListener("change", updateQgisPreview);
    $(id).addEventListener("input", updateQgisPreview);
  });

  $("serviceType").addEventListener("change", () =>
    setServiceUI($("serviceType").value),
  );
  $("version").addEventListener("change", () => {
    updateRasterPreviews();
    updateQgisPreview();
  });
  [
    "wmsStyle",
    "wmsFormat",
    "wmsResolution",
    "wmsTransparent",
    "wmsTileSize",
    "wmsAutoTile",
    "wcsFormat",
    "wcsResolution",
    "wcsTileSize",
    "wcsAutoTile",
    "crs",
    "useBbox",
  ].forEach((id) => {
    if ($(id)) {
      $(id).addEventListener("change", () => {
        updateRasterPreviews();
        updateQgisPreview();
        if (id === "wmsStyle") updateMapServicePreview();
      });
      $(id).addEventListener("input", () => {
        updateRasterPreviews();
        updateQgisPreview();
      });
    }
  });
  $("wcsTileSize").addEventListener("input", updateRasterPreviews);
  setServiceUI("WFS");

  updateArcgisVersionInfo();
  $("arcgisVersion").addEventListener("change", updateArcgisVersionInfo);
  updateConnectionPreview();
  updateQgisPreview();
})();

// Table of contents and fieldset visibility tracking.
(() => {
  "use strict";

  const fieldsets = [
    "ogc_service",
    "layer_coverage",
    "bbox",
    "download",
    "visualization",
    "arcgis",
    "qgis",
  ]
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  const toc = document.getElementById("fieldset-toc-list");

  if (!toc || !fieldsets.length) return;

  const links = new Map();

  for (const fieldset of fieldsets) {
    const legend = fieldset.querySelector("legend");
    const link = document.createElement("a");

    link.href = `#${fieldset.id}`;
    link.textContent = legend?.textContent.trim() || fieldset.id;
    link.className = "toc-link";

    toc.appendChild(link);
    links.set(fieldset, link);
  }

  const setActive = (active) => {
    links.forEach((link, fieldset) => {
      const selected = fieldset === active;

      link.classList.toggle("active", selected);

      if (selected) {
        link.setAttribute("aria-current", "location");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  };

  let scheduled = false;

  const updateActive = () => {
    scheduled = false;

    const candidates = fieldsets.filter((el) => el.getClientRects().length);

    if (!candidates.length) return;

    const cutoff = Math.min(180, window.innerHeight * 0.3);
    let active = candidates[0];

    for (const fieldset of candidates) {
      if (fieldset.getBoundingClientRect().top <= cutoff) {
        active = fieldset;
      } else {
        break;
      }
    }

    setActive(active);
  };

  const scheduleActive = () => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(updateActive);
    }
  };

  window.addEventListener("scroll", scheduleActive, {
    passive: true,
  });

  window.addEventListener("resize", scheduleActive, {
    passive: true,
  });

  toc.addEventListener("click", (event) => {
    const link = event.target.closest("a.toc-link");
    if (!link) return;

    const target = document.getElementById(
      decodeURIComponent(link.hash.slice(1)),
    );

    if (!target) return;

    event.preventDefault();

    target.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });

    history.replaceState(null, "", link.hash);
    setActive(target);
  });

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      {
        rootMargin: "0px 0px -25px 0px",
        threshold: 0.1,
      },
    );

    for (const fieldset of fieldsets) {
      fieldset.classList.add("fieldset-observed");
      observer.observe(fieldset);
    }
  }

  scheduleActive();
})();

(() => {
  "use strict";

  const layout = document.querySelector(".ogc-layout");
  const sidebar = document.querySelector(".ogc-sidebar");
  const toc = document.getElementById("fieldset-toc");

  if (!layout || !sidebar || !toc) return;

  const topOffset = 90;
  let ticking = false;

  function updateTocPosition() {
    ticking = false;

    if (window.innerWidth < 992) {
      toc.style.transform = "";
      return;
    }

    const sidebarRect = sidebar.getBoundingClientRect();
    const layoutRect = layout.getBoundingClientRect();
    const tocHeight = toc.offsetHeight;

    // Distance the TOC should move down inside its sidebar.
    const desiredOffset = topOffset - sidebarRect.top;

    // Do not move before the beginning of the sidebar.
    const minimumOffset = 0;

    // Do not move beyond the bottom of the settings layout.
    const maximumOffset = Math.max(0, layoutRect.height - tocHeight);

    const offset = Math.min(
      maximumOffset,
      Math.max(minimumOffset, desiredOffset),
    );

    toc.style.transform = `translateY(${offset}px)`;
  }

  function scheduleUpdate() {
    if (ticking) return;

    ticking = true;
    requestAnimationFrame(updateTocPosition);
  }

  // Capture scroll events from both window and nested scroll containers.
  document.addEventListener("scroll", scheduleUpdate, {
    passive: true,
    capture: true,
  });

  window.addEventListener("resize", scheduleUpdate, {
    passive: true,
  });

  const observer = new ResizeObserver(scheduleUpdate);
  observer.observe(layout);
  observer.observe(toc);

  scheduleUpdate();
})();
