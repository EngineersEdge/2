(function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dmy = d => d ? d.split('-').reverse().join('-') : '-';
  const dmySlash = d => d ? d.split('-').reverse().join('/') : '-';
  $('#yr').textContent = new Date().getFullYear();

  const state = { type: 'job', cat: '', state: '', edu: '', q: '', open: true, page: 1 };
  const LIMIT = 40;
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

  function drawTicker() {
    const t = meta.closingSoon || [];
    $('#ticker').hidden = !t.length;
    $('#tickItems').innerHTML = t.map(p => `<a href="job.html?id=${encodeURIComponent(p.id)}"><span class="left-chip">${p.daysLeft <= 0 ? 'LAST DAY' : p.daysLeft + (p.daysLeft === 1 ? ' DAY LEFT' : ' DAYS LEFT')}</span>${esc(p.title)}</a>`).join(' &middot; ');
  }

  function head() {
    $('#thead').innerHTML = state.type === 'job'
      ? '<tr><th>Post Date</th><th>Recruitment Board</th><th>Exam / Post Name</th><th>Qualification</th><th>Advt No</th><th>Last Date</th><th>More Info</th></tr>'
      : '<tr><th>Post Date</th><th>Recruitment Board</th><th>Post / Exam Name</th><th>More Info</th></tr>';
  }

  function row(p) {
    const name = `${p.featured ? '<span class="star" title="Featured">★</span> ' : ''}${esc(p.postName || p.title)}${p.vacancy ? ` &ndash; ${esc(p.vacancy)} Posts` : ''}`;
    const more = `<a href="job.html?id=${encodeURIComponent(p.id)}">Get Details</a>`;
    if (state.type !== 'job') return `<tr><td class="nw">${dmySlash(p.postDate)}</td><td>${esc(p.board) || '-'}</td><td>${name}</td><td class="nw">${more}</td></tr>`;
    const qual = esc(p.qualificationText || (p.edu || []).join(', ')) || '-';
    return `<tr><td class="nw">${dmySlash(p.postDate)}</td><td>${esc(p.board) || '-'}</td><td>${name}</td><td>${qual}</td><td>${esc(p.advtNo) || '-'}</td><td class="nw">${p.lastDate ? dmy(p.lastDate) : 'N/A'}</td><td class="nw">${more}</td></tr>`;
  }

  let seq = 0;
  async function load() {
    const my = ++seq;
    head(); syncUrl();
    const p = new URLSearchParams({ type: state.type, limit: LIMIT, page: state.page });
    if (state.cat) p.set('cat', state.cat);
    if (state.state) p.set('state', state.state);
    if (state.edu) p.set('edu', state.edu);
    if (state.q) p.set('q', state.q);
    if (state.open && state.type === 'job') p.set('open', '1');
    $('#rows').innerHTML = `<tr><td class="empty" colspan="7">Loading...</td></tr>`;
    try {
      const r = await (await fetch('/api/govt/posts?' + p)).json();
      if (my !== seq) return;
      $('#count').textContent = r.total + ' result' + (r.total === 1 ? '' : 's');
      $('#rows').innerHTML = r.items.map(row).join('') || `<tr><td class="empty" colspan="7">No posts found. Try clearing filters, or message us on WhatsApp and we will help you find it.</td></tr>`;
      const pages = Math.max(Math.ceil(r.total / LIMIT), 1);
      $('#pager').hidden = pages <= 1; $('#pg').textContent = `Page ${r.page} of ${pages}`;
      $('#prev').disabled = r.page <= 1; $('#next').disabled = r.page >= pages;
    } catch { $('#rows').innerHTML = `<tr><td class="empty bad" colspan="7">Could not load. Please refresh.</td></tr>`; }
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
  $('#prev').onclick = () => { state.page--; load(); scrollTo({ top: 0, behavior: 'smooth' }); };
  $('#next').onclick = () => { state.page++; load(); scrollTo({ top: 0, behavior: 'smooth' }); };

  fetch('/api/govt/meta').then(r => r.json()).then(m => { meta = m; drawSelects(); drawTicker(); drawChips(); load(); })
    .catch(() => { $('#rows').innerHTML = `<tr><td class="empty bad">Could not load. Please refresh.</td></tr>`; });
})();
