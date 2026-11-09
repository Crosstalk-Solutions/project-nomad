/* RhinoVault Go offline maps: MapLibre + PMTiles served from the drive. */
(function () {
  'use strict';
  var ROOT = new URL('../../', location.href).href;          // drive root
  var ASSETS = ROOT + 'Maps/assets/';
  var msg = document.getElementById('msg');

  function show(html) { msg.innerHTML = html ? '<div class="note">' + html + '</div>' : ''; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function regionUrl(r) { return ROOT + 'Maps/pmtiles/' + encodeURIComponent(r.file); }

  var protocol = new pmtiles.Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);

  // Build a style with one vector source per region, duplicating each base layer per source.
  function buildStyle(base, regions) {
    var templateLayers = base.layers.filter(function (l) { return l.source; });
    var style = JSON.parse(JSON.stringify(base));
    var attribution = base.sources && base.sources.protomaps && base.sources.protomaps.attribution;
    style.sources = {};
    style.layers = base.layers.filter(function (l) { return !l.source; });
    // Layer order matters (water under roads under labels): add each template layer for every region in turn.
    templateLayers.forEach(function (tl) {
      regions.forEach(function (r) {
        var layer = JSON.parse(JSON.stringify(tl));
        layer.id = tl.id + '-' + r.id;
        layer.source = 'r_' + r.id;
        style.layers.push(layer);
      });
    });
    regions.forEach(function (r) {
      style.sources['r_' + r.id] = { type: 'vector', url: 'pmtiles://' + regionUrl(r), attribution: attribution };
    });
    style.sprite = ASSETS + 'basemaps-assets/sprites/v4/light';
    style.glyphs = ASSETS + 'basemaps-assets/fonts/{fontstack}/{range}.pbf';
    return style;
  }

  function loadJson(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(url.replace(ROOT, '') + ' (HTTP ' + r.status + ')');
      return r.json();
    });
  }

  Promise.all([loadJson('library.json'), loadJson(ASSETS + 'nomad-base-styles.json')])
    .then(function (res) {
      var lib = res[0], base = res[1];
      var regions = (lib.maps || []).slice().sort(function (a, b) { return a.title.localeCompare(b.title); });
      if (!regions.length) { show('No map regions are on this drive.'); return; }

      // Read each region's bounds from its PMTiles header (local, fast).
      return Promise.all(regions.map(function (r) {
        var p = new pmtiles.PMTiles(regionUrl(r));
        protocol.add(p);
        return p.getHeader().then(function (h) {
          r.bounds = [[h.minLon, h.minLat], [h.maxLon, h.maxLat]];
          return r;
        }, function () { r.broken = true; return r; });
      })).then(function (rs) {
        var ok = rs.filter(function (r) { return !r.broken; });
        var broken = rs.filter(function (r) { return r.broken; });
        if (broken.length) show('Some map files could not be read: ' + esc(broken.map(function (r) { return r.title; }).join(', ')));
        if (!ok.length) return;

        var all = ok.reduce(function (b, r) {
          return [[Math.min(b[0][0], r.bounds[0][0]), Math.min(b[0][1], r.bounds[0][1])],
                  [Math.max(b[1][0], r.bounds[1][0]), Math.max(b[1][1], r.bounds[1][1])]];
        }, [[180, 90], [-180, -90]]);

        var map = new maplibregl.Map({
          container: 'map',
          style: buildStyle(base, ok),
          bounds: all,
          fitBoundsOptions: { padding: 30 },
          attributionControl: { compact: true }
        });
        map.addControl(new maplibregl.NavigationControl(), 'top-right');
        map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left');
        map.on('error', function (e) { if (window.console) console.warn('map error', e && e.error); });
        window.rvMap = map;

        var list = document.getElementById('regions');
        function renderList(term) {
          list.innerHTML = ok.filter(function (r) { return !term || r.title.toLowerCase().indexOf(term) >= 0; })
            .map(function (r) { return '<button data-id="' + esc(r.id) + '">' + esc(r.title) + '</button>'; }).join('');
        }
        renderList('');
        document.getElementById('filter').addEventListener('input', function (e) { renderList(e.target.value.trim().toLowerCase()); });
        list.addEventListener('click', function (e) {
          var b = e.target.closest('button[data-id]'); if (!b) return;
          var r = ok.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0];
          if (r) map.fitBounds(r.bounds, { padding: 30 });
        });
      });
    })
    .catch(function (err) {
      show('<strong>Maps could not be loaded.</strong> Start RhinoVault with the <em>Start RhinoVault</em> shortcut on the drive. (' + esc(err.message) + ')');
    });
})();
