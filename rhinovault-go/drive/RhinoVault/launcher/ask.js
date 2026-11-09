/* Ask RhinoVault: offline AI chat (llama-server) with retrieval from the field manual index. */
(function () {
  'use strict';

  // ---- Where things are ---------------------------------------------------
  var params = new URLSearchParams(location.search);
  function port(name, fallback) {
    var v = params.get(name);
    try { if (v) sessionStorage.setItem('rv.' + name, v); else v = sessionStorage.getItem('rv.' + name); } catch (e) { /* no storage */ }
    return v || fallback;
  }
  var AI = location.protocol + '//' + location.hostname + ':' + port('ai', '8091');
  port('kiwix', '8090');
  var ROOT = new URL('../../', location.href).href;
  var INDEX = ROOT + 'RhinoVault/ai/index/';

  var SYSTEM = [
    'You are RhinoVault, an offline survival assistant on a RhinoVault Go drive made by RhinoPCTec.',
    'You help with first aid, water, food, shelter, fire, navigation, signaling, repair and preparedness.',
    'Be practical and specific, use short steps, and put safety first.',
    'For life-threatening situations, tell the person to contact emergency services if at all possible, then give interim guidance.',
    'Never invent dosages, measurements or procedures. If you are not sure, say so.'
  ].join(' ');

  // ---- Search index (must match Build-RhinoVaultGo.ps1) --------------------
  var STOP = new Set(('the and for are but not you all any can had her was one our out has his how its may new now see two who did get him let say she too use ' +
    'with that this from they will have been were what when which their there into than then them these those such shall also each other some only very ' +
    'more most must upon over under about after before while where being would could should does done your yours page figure table chapter section ' +
    'paragraph appendix www http https without within is it in of on or to as at be by an if no so up we do go he me my am us').split(' '));
  function stem(w) {
    if (w.length > 5 && w.slice(-3) === 'ing') return w.slice(0, -3);
    if (w.length > 4 && w.slice(-2) === 'ed') return w.slice(0, -2);
    if (w.length > 4 && w.slice(-2) === 'es') return w.slice(0, -2);
    if (w.length > 3 && w.slice(-1) === 's' && w.slice(-2) !== 'ss') return w.slice(0, -1);
    return w;
  }
  function tokens(text) {
    return text.toLowerCase().split(/[^a-z0-9]+/).filter(function (w) {
      return w.length >= 2 && w.length <= 30 && !STOP.has(w) && !(/^\d+$/.test(w) && w.length > 4);
    }).map(stem);
  }
  function shardOf(t, n) { var h = 0; for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % n; return h; }

  var meta = null, termCache = {}, chunkCache = {};
  function getJson(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function loadMeta() {
    if (meta) return Promise.resolve(meta);
    return getJson(INDEX + 'meta.json').then(function (m) { meta = m; return m; });
  }
  function terms(id) { return termCache[id] || (termCache[id] = getJson(INDEX + 'terms-' + id + '.json')); }
  function chunks(id) { return chunkCache[id] || (chunkCache[id] = getJson(INDEX + 'chunks-' + id + '.json')); }

  function search(question, k) {
    return loadMeta().then(function (m) {
      var qt = Array.from(new Set(tokens(question)));
      if (!qt.length || !m.n) return [];
      var shardIds = Array.from(new Set(qt.map(function (t) { return shardOf(t, m.termShards); })));
      return Promise.all(shardIds.map(terms)).then(function (loaded) {
        var byShard = {}; shardIds.forEach(function (s, i) { byShard[s] = loaded[i]; });
        var scores = new Map(), k1 = 1.2, b = 0.75;
        qt.forEach(function (t) {
          var entry = byShard[shardOf(t, m.termShards)][t];
          if (!entry) return;
          var df = entry[0], post = entry[1];
          var idf = Math.log(1 + (m.n - df + 0.5) / (df + 0.5));
          for (var i = 0; i < post.length; i += 2) {
            var id = post[i], tf = post[i + 1], dl = m.len[id];
            var s = idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * dl / m.avgdl));
            scores.set(id, (scores.get(id) || 0) + s);
          }
        });
        var ranked = Array.from(scores.entries()).sort(function (a, c) { return c[1] - a[1]; }).slice(0, 30);
        if (!ranked.length) return [];
        var top = ranked[0][1];
        var ids = ranked.filter(function (r) { return r[1] >= top * 0.35; }).map(function (r) { return r[0]; });
        var shardNos = Array.from(new Set(ids.map(function (id) { return Math.floor(id / m.shardSize); })));
        return Promise.all(shardNos.map(chunks)).then(function (cs) {
          var bySh = {}; shardNos.forEach(function (s, i) { bySh[s] = cs[i]; });
          var perDoc = {}, out = [];
          ids.forEach(function (id) {
            if (out.length >= k) return;
            var c = bySh[Math.floor(id / m.shardSize)][id % m.shardSize];
            if ((perDoc[c[0]] = (perDoc[c[0]] || 0) + 1) > 2) return;   // at most 2 passages per manual
            var d = m.docs[c[0]];
            out.push({ title: d.t, file: d.f, page: c[1], text: c[2] });
          });
          return out;
        });
      });
    });
  }

  // ---- Rendering ------------------------------------------------------------
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fileUrl(rel) { return ROOT + rel.split('/').map(encodeURIComponent).join('/'); }
  function inline(s) {
    return s.replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
      .replace(/\[(\d{1,2})\]/g, '<sup><a href="#" data-cite="$1">[$1]</a></sup>');
  }
  function md(src) {
    var out = [], list = null, code = null;
    function closeList() { if (list) { out.push('</' + list + '>'); list = null; } }
    esc(src).split('\n').forEach(function (line) {
      if (/^```/.test(line)) { if (code === null) { closeList(); code = []; } else { out.push('<pre>' + code.join('\n') + '</pre>'); code = null; } return; }
      if (code !== null) { code.push(line); return; }
      var m;
      if ((m = line.match(/^(#{1,3})\s+(.*)/))) { closeList(); out.push('<h3>' + inline(m[2]) + '</h3>'); return; }
      if ((m = line.match(/^\s*[-*•]\s+(.*)/))) { if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; } out.push('<li>' + inline(m[1]) + '</li>'); return; }
      if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push('<li>' + inline(m[1]) + '</li>'); return; }
      if (!line.trim()) { closeList(); return; }
      closeList(); out.push('<p>' + inline(line) + '</p>');
    });
    if (code !== null) out.push('<pre>' + code.join('\n') + '</pre>');
    closeList();
    return out.join('');
  }

  var log = document.getElementById('log'), chat = document.getElementById('chat');
  var input = document.getElementById('input'), sendBtn = document.getElementById('send'), stopBtn = document.getElementById('stop');
  var useManuals = document.getElementById('useManuals');
  var history = [], busy = false, controller = null, aiReady = false;

  function addMsg(role, html) {
    var w = document.getElementById('welcome'); if (w) w.remove();
    var el = document.createElement('div');
    el.className = 'msg ' + role;
    el.innerHTML = '<div class="who">' + (role === 'user' ? 'You' : '<img src="rhinovault-logo.webp" alt="">') + '</div><div class="bubble">' + html + '</div>';
    log.appendChild(el); chat.scrollTop = chat.scrollHeight;
    return el.querySelector('.bubble');
  }
  function sourcesHtml(src) {
    if (!src.length) return '';
    return '<div class="sources">Sources on this drive:' + src.map(function (s, i) {
      return '<a href="' + fileUrl(s.file) + '#page=' + s.page + '" target="_blank" rel="noopener" data-src="' + (i + 1) + '">[' + (i + 1) + '] ' +
        esc(s.title) + ', page ' + s.page + '</a>';
    }).join('') + '</div>';
  }

  // ---- Talking to llama-server ----------------------------------------------
  function buildMessages(question, sources) {
    var sys = SYSTEM;
    if (sources.length) {
      sys += '\n\nExcerpts from the field manuals on this drive (they may or may not be relevant):\n\n' +
        sources.map(function (s, i) { return '[' + (i + 1) + '] ' + s.title + ', page ' + s.page + ':\n' + s.text; }).join('\n\n') +
        '\n\nUse the excerpts when they answer the question and cite them like [1]. ' +
        'If they do not cover the question, answer from general knowledge without citing them.';
    }
    return [{ role: 'system', content: sys }].concat(history.slice(-6), [{ role: 'user', content: question }]);
  }

  function ask(question) {
    if (busy || !question.trim()) return;
    if (!aiReady) { addMsg('bot', '<p>The AI engine is not running. Start RhinoVault with the <em>Start RhinoVault</em> shortcut on the drive.</p>'); return; }
    busy = true; sendBtn.disabled = true; stopBtn.hidden = false;
    addMsg('user', esc(question));
    var bubble = addMsg('bot', '<p class="cursor">' + (useManuals.checked ? 'Searching the manuals and books' : 'Thinking') + '</p>');
    var found = useManuals.checked ? search(question, 4).catch(function () { return []; }) : Promise.resolve([]);
    var answer = '';
    found.then(function (sources) {
      controller = new AbortController();
      return fetch(AI + '/v1/chat/completions', {
        method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: buildMessages(question, sources), stream: true, temperature: 0.3, max_tokens: 800 })
      }).then(function (res) {
        if (!res.ok || !res.body) throw new Error('AI engine error (HTTP ' + res.status + ')');
        var reader = res.body.getReader(), dec = new TextDecoder(), buf = '';
        function render(done) { bubble.innerHTML = md(answer) + (done ? sourcesHtml(sources) : '<span class="cursor"></span>'); chat.scrollTop = chat.scrollHeight; }
        function pump() {
          return reader.read().then(function (r) {
            if (r.done) return;
            buf += dec.decode(r.value, { stream: true });
            var lines = buf.split('\n'); buf = lines.pop();
            lines.forEach(function (l) {
              if (l.indexOf('data: ') !== 0 || l === 'data: [DONE]') return;
              try { var d = JSON.parse(l.slice(6)); var t = d.choices && d.choices[0] && d.choices[0].delta && d.choices[0].delta.content; if (t) answer += t; } catch (e) { /* partial */ }
            });
            render(false);
            return pump();
          });
        }
        return pump().then(function () { render(true); });
      }).then(function () {
        bubble.addEventListener('click', function (e) {
          var a = e.target.closest('[data-cite]'); if (!a) return;
          e.preventDefault();
          var s = bubble.querySelector('[data-src="' + a.getAttribute('data-cite') + '"]'); if (s) s.click();
        });
      });
    }).catch(function (err) {
      if (err.name === 'AbortError') { bubble.innerHTML = md(answer || '*Stopped.*'); return; }
      bubble.innerHTML = '<p>Sorry, something went wrong: ' + esc(err.message) + '</p>';
    }).then(function () {
      history.push({ role: 'user', content: question });
      if (answer) history.push({ role: 'assistant', content: answer });
      busy = false; sendBtn.disabled = false; stopBtn.hidden = true; controller = null; input.focus();
    });
  }

  // ---- Wiring ---------------------------------------------------------------
  sendBtn.addEventListener('click', function () { var q = input.value; input.value = ''; ask(q); });
  stopBtn.addEventListener('click', function () { if (controller) controller.abort(); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBtn.click(); }
  });
  input.addEventListener('input', function () { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 180) + 'px'; });
  document.getElementById('clear').addEventListener('click', function () { history = []; log.innerHTML = ''; input.focus(); });
  log.addEventListener('click', function (e) {
    var b = e.target.closest('.suggest button'); if (b) ask(b.textContent);
  });

  fetch('library.json', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (lib) {
    var ai = lib.ai || {};
    if (ai.model_title) document.getElementById('modelName').textContent = 'Model: ' + ai.model_title;
    if (!ai.index) { useManuals.checked = false; useManuals.disabled = true; useManuals.parentNode.title = 'No field manual index on this drive'; }
  }).catch(function () { /* optional */ });

  fetch(AI + '/health').then(function (r) { return r.json(); }).then(function (h) {
    aiReady = h && h.status === 'ok';
    var st = document.getElementById('aiStatus');
    if (st) st.textContent = aiReady ? 'Ask anything. Answers come from the AI running on this computer, with no internet.' : 'The AI engine is still loading. Try again in a moment.';
    if (!aiReady) setTimeout(function () { location.reload(); }, 5000);
  }).catch(function () {
    var st = document.getElementById('aiStatus');
    if (st) st.innerHTML = 'The AI engine is not running. Start RhinoVault with the <em>Start RhinoVault</em> shortcut on the drive (the AI needs about 4 GB of free memory).';
  });
  input.focus();
})();
