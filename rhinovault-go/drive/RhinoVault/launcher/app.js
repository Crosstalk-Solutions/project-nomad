/* RhinoVault Go launcher - runs entirely offline from the drive. */
(function () {
  'use strict';

  // ---- Runtime: where is kiwix-serve? The start script passes ?kiwix=PORT ----
  var params = new URLSearchParams(location.search);
  var kiwixPort = params.get('kiwix');
  try {
    if (kiwixPort) sessionStorage.setItem('rv.kiwix', kiwixPort);
    else kiwixPort = sessionStorage.getItem('rv.kiwix');
  } catch (e) { /* storage unavailable */ }
  kiwixPort = kiwixPort || '8090';
  try { var aiPort = params.get('ai'); if (aiPort) sessionStorage.setItem('rv.ai', aiPort); } catch (e) { /* storage unavailable */ }
  var KIWIX = location.protocol + '//' + location.hostname + ':' + kiwixPort;
  // Drive root is two levels up from /RhinoVault/launcher/
  var ROOT = new URL('../../', location.href).href;

  var lib = null;
  var view = document.getElementById('view');
  var q = document.getElementById('q');
  var manualBranch = 'All';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fileUrl(rel) {
    return ROOT + rel.split('/').map(encodeURIComponent).join('/');
  }
  function bookUrl(z) { return KIWIX + '/content/' + encodeURIComponent(z.name); }
  function fmtSize(mb) {
    if (mb == null) return '';
    return mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : Math.max(1, Math.round(mb)) + ' MB';
  }

  // ---- Status bar ----
  function renderStatus(kiwixUp) {
    var el = document.getElementById('status');
    var built = lib && lib.built ? new Date(lib.built).toLocaleDateString() : 'unknown';
    el.innerHTML =
      '<span><span class="dot ' + (kiwixUp ? 'ok' : '') + '"></span>Library server ' +
      (kiwixUp ? 'running' : 'not reachable - use the Start RhinoVault shortcut on the drive') + '</span>' +
      '<span>Profile: <strong>' + esc(lib && lib.profile_label || '-') + '</strong></span>' +
      '<span>Content date: ' + esc(built) + '</span>';
  }
  function checkKiwix() {
    // no-cors: resolves (opaque) if the server answers, rejects if nothing is listening.
    return fetch(KIWIX + '/', { mode: 'no-cors', cache: 'no-store' })
      .then(function () { return true; }, function () { return false; });
  }

  // ---- Views ----
  function tile(href, icon, title, text, count) {
    return '<a class="tile" href="' + href + '">' +
      (count != null ? '<span class="count">' + esc(count) + '</span>' : '') +
      '<div class="icon">' + icon + '</div><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p></a>';
  }

  function viewHome() {
    var z = lib.zims.length, m = lib.manuals.length, r = lib.maps.length;
    var tools = (lib.tools || []).length + (lib.apps || []).length;
    return '<div class="tiles">' +
      tile('ask.html', '💬', 'Ask RhinoVault', 'Offline AI assistant that answers from the field manuals on this drive and cites the page.',
        lib.ai && lib.ai.model_file ? 'AI on board' : 'no AI model') +
      tile('#/library', '📚', 'Library', 'Wikipedia, medical references, survival, repair, farming and more. Fully searchable.', z + ' collections') +
      tile('#/manuals', '🎖️', 'Field Manuals', 'Public-domain U.S. military field manuals: survival, first aid, land navigation, shelters.', m + ' manuals') +
      tile('maps.html', '🗺️', 'Offline Maps', 'Street and terrain maps that work with no signal and no GPS service.', r + ' regions') +
      tile('#/tools', '🧰', 'Tools & Apps', 'Encryption and data tools, password manager and bootable rescue systems.', tools + ' items') +
      tile('#/about', '🛡️', 'About this drive', 'How to use RhinoVault Go, keep it updated, and who made the content.') +
      '</div>' +
      '<h2>Quick tips</h2><div class="note">' +
      '<strong>Search everything:</strong> type above to find books and field manuals by title. ' +
      'Inside the Library, each collection has its own full-text search.<br>' +
      '<strong>Share with others:</strong> start RhinoVault with the <em>Share on network</em> option and other ' +
      'devices on the same Wi-Fi can open this page in their browser.<br>' +
      '<strong>When you are done:</strong> go back to the RhinoVault window and press Enter, then eject the drive.' +
      '</div>';
  }

  function zimRow(z) {
    return '<a class="row" href="' + bookUrl(z) + '" target="_blank" rel="noopener">' +
      '<div class="main"><div class="title">' + esc(z.title) + '</div><div class="sub">' + esc(z.description || '') + '</div></div>' +
      '<span class="tag">' + esc(z.category) + '</span><span class="size">' + fmtSize(z.size_mb) + '</span></a>';
  }
  function manualRow(m) {
    return '<a class="row" href="' + fileUrl(m.file) + '" target="_blank" rel="noopener">' +
      '<div class="main"><div class="title">' + esc(m.title) + '</div><div class="sub">' + esc(m.file.split('/').pop()) + '</div></div>' +
      '<span class="tag">' + esc(m.branch) + '</span><span class="size">' + fmtSize(m.size_mb) + '</span></a>';
  }

  function viewLibrary() {
    if (!lib.zims.length) return '<div class="empty">No library collections on this drive.</div>';
    var groups = {};
    lib.zims.forEach(function (z) { (groups[z.category] = groups[z.category] || []).push(z); });
    return Object.keys(groups).sort().map(function (cat) {
      return '<h2>' + esc(cat) + ' <small>' + groups[cat].length + '</small></h2><div class="list">' +
        groups[cat].map(zimRow).join('') + '</div>';
    }).join('') +
      '<p class="note" style="margin-top:20px">Collections open in the Kiwix reader. Use its search box for full-text search inside a collection, or open the <a href="' +
      KIWIX + '/" target="_blank" rel="noopener">full library page</a>.</p>';
  }

  function viewManuals() {
    if (!lib.manuals.length) return '<div class="empty">No field manuals on this drive.</div>';
    var branches = ['All'].concat(Array.from(new Set(lib.manuals.map(function (m) { return m.branch; }))).sort());
    var term = q.value.trim().toLowerCase();
    var items = lib.manuals.filter(function (m) {
      return (manualBranch === 'All' || m.branch === manualBranch) &&
        (!term || (m.title + ' ' + m.file).toLowerCase().indexOf(term) >= 0);
    });
    return '<h2>Field Manuals <small>' + items.length + ' of ' + lib.manuals.length + '</small></h2>' +
      '<div class="filters">' + branches.map(function (b) {
        return '<button class="chip ' + (b === manualBranch ? 'on' : '') + '" data-branch="' + esc(b) + '">' + esc(b) + '</button>';
      }).join('') + '</div>' +
      '<div class="list">' + (items.map(manualRow).join('') || '<div class="empty">No manuals match.</div>') + '</div>';
  }

  function viewTools() {
    var html = '';
    var tools = lib.tools || [], apps = lib.apps || [], isos = lib.isos || [];
    html += '<h2>Browser tools</h2><div class="list">' + (tools.map(function (t) {
      return '<a class="row" href="' + fileUrl(t.file) + '" target="_blank" rel="noopener"><div class="main"><div class="title">' +
        esc(t.title) + '</div><div class="sub">Runs in your browser, nothing to install</div></div></a>';
    }).join('') || '<div class="empty">None on this drive.</div>') + '</div>';
    html += '<h2>Portable apps</h2><div class="list">' + (apps.map(function (a) {
      return '<a class="row" href="' + fileUrl(a.folder) + '/" target="_blank" rel="noopener"><div class="main"><div class="title">' +
        esc(a.title) + '</div><div class="sub">On the drive in <code>' + esc(a.folder) + '</code>. Open that folder and run ' +
        esc(a.run || 'the app') + '.</div></div><span class="tag">' + esc(a.platform) + '</span></a>';
    }).join('') || '<div class="empty">None on this drive.</div>') + '</div>';
    html += '<h2>Bootable systems</h2>' + (isos.length ? '<div class="list">' + isos.map(function (i) {
      return '<div class="row"><div class="main"><div class="title">' + esc(i.title) + '</div><div class="sub">' + esc(i.file) +
        '</div></div><span class="size">' + fmtSize(i.size_mb) + '</span></div>';
    }).join('') + '</div>' : '') +
      '<div class="note" style="margin-top:10px">If this drive was prepared with <strong>Ventoy</strong>, restart a computer and choose the USB drive from its ' +
      'boot menu (often F12, F11, Esc or Option on a Mac). Ventoy lists every ISO in the <code>ISOs</code> folder so you can boot a full ' +
      'operating system without touching the computer\'s hard drive.</div>';
    return html;
  }

  function viewAbout() {
    var credits = (lib.credits || []).map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('');
    return '<h2>About RhinoVault Go</h2><div class="note">' +
      'RhinoVault Go is the portable edition of <strong>RhinoVault</strong> by RhinoPCTec: an offline digital survival kit with a ' +
      'knowledge library, field manuals, maps and tools that keep working when the internet does not.<br><br>' +
      '<strong>Starting:</strong> open the drive and run <em>Start RhinoVault</em> for your computer (Windows, Mac or Linux).<br>' +
      '<strong>Updating:</strong> RhinoPCTec can refresh the content; the date in the status bar shows when it was built.<br>' +
      '<strong>Disclaimer:</strong> reference content comes from third parties and may be out of date. In an emergency, ' +
      'contact emergency services if you can.</div>' +
      '<h2>Content credits</h2><div class="note"><ul style="margin:0;padding-left:18px">' + credits + '</ul></div>';
  }

  function viewSearch(term) {
    term = term.toLowerCase();
    var z = lib.zims.filter(function (x) { return (x.title + ' ' + (x.description || '') + ' ' + x.category).toLowerCase().indexOf(term) >= 0; });
    var m = lib.manuals.filter(function (x) { return (x.title + ' ' + x.file).toLowerCase().indexOf(term) >= 0; });
    return '<h2>Library <small>' + z.length + '</small></h2><div class="list">' + (z.map(zimRow).join('') || '<div class="empty">No matching collections.</div>') + '</div>' +
      '<h2>Field Manuals <small>' + m.length + '</small></h2><div class="list">' + (m.slice(0, 200).map(manualRow).join('') || '<div class="empty">No matching manuals.</div>') + '</div>';
  }

  function route() {
    var r = location.hash.replace(/^#\/?/, '');
    document.querySelectorAll('#nav a[data-route]').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-route') === r);
    });
    var term = q.value.trim();
    if (!lib) return;
    if (term && r !== 'manuals') { view.innerHTML = viewSearch(term); return; }
    view.innerHTML = r === 'library' ? viewLibrary()
      : r === 'manuals' ? viewManuals()
      : r === 'tools' ? viewTools()
      : r === 'about' ? viewAbout()
      : viewHome();
  }

  view.addEventListener('click', function (e) {
    var chip = e.target.closest('[data-branch]');
    if (chip) { manualBranch = chip.getAttribute('data-branch'); route(); }
  });
  q.addEventListener('input', route);
  window.addEventListener('hashchange', route);

  fetch('library.json', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (data) {
      lib = data;
      lib.zims = lib.zims || []; lib.manuals = lib.manuals || []; lib.maps = lib.maps || [];
      document.getElementById('footer').innerHTML =
        'RhinoVault Go ' + esc(lib.version || '') + ' &middot; by RhinoPCTec &middot; built on open-source software including ' +
        'Project N.O.M.A.D., Kiwix, MapLibre and Protomaps';
      route();
      renderStatus(false);
      checkKiwix().then(renderStatus);
    })
    .catch(function (err) {
      view.innerHTML = '<div class="note"><strong>The drive index could not be loaded.</strong><br>' +
        'Start RhinoVault using the <em>Start RhinoVault</em> shortcut on the drive instead of opening this page directly. (' + esc(err.message) + ')</div>';
    });
})();
