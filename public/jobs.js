(function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dmy = d => d ? d.split('-').reverse().join('-') : '';
  const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  $('#yr').textContent = new Date().getFullYear();

  const state = { type: 'job', cat: '', state: '', edu: '', q: '', open: true, page: 1 };
  const LIMIT = 24;
  let meta = null;

  // restore from URL
  const u = new URLSearchParams(location.search);
  for (const k of ['type', 'cat', 'state', 'edu', 'q']) if (u.get(k)) state[k] = u.get(k);
  if (u.get('open') === '0') state.open = false;
  $('#q').value = state.q; $('#fOpen').checked = state.open;

  function syncUrl() {
    const p = new URLSearchParams();
    for (const k of ['type', 'cat', 'state', 'edu', 'q']) if (state[k] && !(k === 'type' && state[k] === 'job')) p.set(k, state[k]);
    if (!state.open) p.set('open', '0');
    history.replaceState(null, '', p.toString() ? '?' + p : location.pathname);
  }

  const chip = (label, on, attrs, n) => `<button type="button" class="chip${on ? ' on' : ''}" ${attrs}>${esc(label)}${n ? `<small>${n}</small>` : ''}</button>`;

  // status badge for a job: open / closing soon / closed
  function status(p) {
    if (p.type !== 'job') return { cls: 'info', text: (meta.lists.types.find(t => t[0] === p.type) || [, 'Update'])[1] };
    if (!p.lastDate) return { cls: 'info', text: 'Check notice for dates' };
    const left = dayDiff(meta.today, p.lastDate);
    if (left < 0) return { cls: 'closed', text: 'Closed ' + dmy(p.lastDate) };
    if (left === 0) return { cls: 'soon', text: 'Last day today' };
    if (left <= 7) return { cls: 'soon', text: left + (left === 1 ? ' day' : ' days') + ' left' };
    return { cls: 'open', text: 'Open till ' + dmy(p.lastDate) };
  }

  function drawChips() {
    const L = meta.lists, c = meta.counts;
    $('#typeChips').innerHTML = L.types.map(([k, l]) => chip(l, state.type === k, `data-type="${k}"`, c.types[k])).join('');
    $('#eduChips').innerHTML = chip('All', !state.edu, 'data-edu=""') + L.edu.filter(e => c.edu[e]).map(e => chip(e, state.edu === e, `data-edu="${esc(e)}"`, c.edu[e])).join('');
  }

  function drawSelects() {
    const L = meta.lists;
    $('#fCat').innerHTML = '<option value="">All categories</option>' + L.cats.map(([k, l]) => `<option value="${k}" ${state.cat === k ? 'selected' : ''}>${esc(l)}</option>`).join('');
    $('#fState').innerHTML = '<option value="">All states</option>' + L.states.map(s => `<option ${state.state === s ? 'selected' : ''}>${esc(s)}</option>`).join('');
  }

  function drawStats() {
    const open = meta.counts.types.job || 0;
    const soon = (meta.closingSoon || []).length;
    $('#stats').textContent = `${open} recruitment notifications listed${soon ? ` · ${soon} closing within 7 days` : ''}`;
  }

  function drawTicker() {
    const t = meta.closingSoon || [];
    $('#ticker').hidden = !t.length;
    $('#tickItems').innerHTML = t.map(p => `<a href="job.html?id=${encodeURIComponent(p.id)}"><span class="left-chip">${p.daysLeft <= 0 ? 'LAST DAY' : p.daysLeft + (p.daysLeft === 1 ? ' DAY LEFT' : ' DAYS LEFT')}</span>${esc(p.title)}</a>`).join(' &middot; ');
  }

  // featured posters: only notifications that have a poster image
  async function drawFeatured() {
    try {
      const r = await (await fetch('/api/govt/posts?featured=1&limit=12')).json();
      const items = r.items.filter(p => p.poster && p.type === 'job');
      if (!items.length) return;
      $('#posterStrip').innerHTML = items.map(p => `<a class="pcard" href="job.html?id=${encodeURIComponent(p.id)}">
        <img src="${esc(p.poster)}" alt="${esc(p.title)} poster" loading="lazy">
        <div><b>${esc(p.postName || p.title)}</b><small>${p.vacancy ? esc(p.vacancy) + ' posts' : ''}${p.lastDate ? ' · Last date ' + dmy(p.lastDate) : ''}</small></div></a>`).join('');
      $('#featuredSec').hidden = false;
    } catch { /* posters are optional */ }
  }

  function card(p) {
    const s = status(p);
    const media = p.poster
      ? `<img src="${esc(p.poster)}" alt="${esc(p.title)} poster" loading="lazy">`
      : `<div class="jc-ph" aria-hidden="true">${esc((p.board || p.title || '?').trim().charAt(0).toUpperCase())}</div>`;
    const facts = state.type === 'job'
      ? [['Vacancy', p.vacancy ? p.vacancy + ' posts' : '-'], ['Qualification', p.qualificationText || (p.edu || []).join(', ') || '-'], ['Advt no.', p.advtNo || '-'], ['Last date', p.lastDate ? dmy(p.lastDate) : 'N/A']]
      : [['Posted', dmy(p.postDate) || '-']];
    return `<article class="jcard">
      <a class="jc-media" href="job.html?id=${encodeURIComponent(p.id)}" tabindex="-1" aria-hidden="true">${media}</a>
      <div class="jc-body">
        <div class="jc-badges"><span class="badge ${s.cls}">${esc(s.text)}</span>${p.featured ? '<span class="star" title="Featured">★ Featured</span>' : ''}</div>
        <h3><a href="job.html?id=${encodeURIComponent(p.id)}">${esc(p.postName || p.title)}</a></h3>
        <p class="jc-board">${esc(p.board) || '&nbsp;'}</p>
        <dl class="jc-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        <a class="btn primary sm" href="job.html?id=${encodeURIComponent(p.id)}">View details</a>
      </div>
    </article>`;
  }

  let seq = 0;
  async function load() {
    const my = ++seq;
    syncUrl();
    const p = new URLSearchParams({ type: state.type, limit: LIMIT, page: state.page });
    if (state.cat) p.set('cat', state.cat);
    if (state.state) p.set('state', state.state);
    if (state.edu) p.set('edu', state.edu);
    if (state.q) p.set('q', state.q);
    if (state.open && state.type === 'job') p.set('open', '1');
    $('#grid').innerHTML = '<p class="empty">Loading...</p>';
    try {
      const r = await (await fetch('/api/govt/posts?' + p)).json();
      if (my !== seq) return;
      $('#count').textContent = r.total + ' result' + (r.total === 1 ? '' : 's');
      $('#grid').innerHTML = r.items.map(card).join('') || '<p class="empty">No posts found. Try clearing filters, or message us on WhatsApp and we will help you find it.</p>';
      const pages = Math.max(Math.ceil(r.total / LIMIT), 1);
      $('#pager').hidden = pages <= 1; $('#pg').textContent = `Page ${r.page} of ${pages}`;
      $('#prev').disabled = r.page <= 1; $('#next').disabled = r.page >= pages;
    } catch { $('#grid').innerHTML = '<p class="empty bad">Could not load. Please refresh.</p>'; }
  }

  const refresh = () => { state.page = 1; drawChips(); load(); };

  // qualification only applies to job posts, so clear it when switching to admit cards, results etc.
  $('#typeChips').onclick = e => { const b = e.target.closest('[data-type]'); if (b) { state.type = b.dataset.type; if (state.type !== 'job') state.edu = ''; refresh(); } };
  $('#eduChips').onclick = e => { const b = e.target.closest('[data-edu]'); if (b) { state.edu = b.dataset.edu; refresh(); } };
  $('#fCat').onchange = e => { state.cat = e.target.value; refresh(); };
  $('#fState').onchange = e => { state.state = e.target.value; refresh(); };
  $('#fOpen').onchange = e => { state.open = e.target.checked; refresh(); };
  $('#fReset').onclick = () => { Object.assign(state, { type: 'job', cat: '', state: '', edu: '', q: '', open: true }); $('#q').value = ''; $('#fOpen').checked = true; drawSelects(); refresh(); };
  $('#sForm').onsubmit = e => { e.preventDefault(); state.q = $('#q').value.trim(); state.type = state.q ? '' : state.type; if (!state.q && !state.type) state.type = 'job'; refresh(); };
  $('#prev').onclick = () => { state.page--; load(); scrollTo({ top: $('#jobList').offsetTop, behavior: 'smooth' }); };
  $('#next').onclick = () => { state.page++; load(); scrollTo({ top: $('#jobList').offsetTop, behavior: 'smooth' }); };

  fetch('/api/govt/meta').then(r => r.json()).then(m => { meta = m; drawSelects(); drawTicker(); drawStats(); drawChips(); drawFeatured(); load(); })
    .catch(() => { $('#grid').innerHTML = '<p class="empty bad">Could not load. Please refresh.</p>'; });
})();
