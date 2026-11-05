(function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const api = async (url, method = 'GET', body) => {
    const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401 && !url.includes('login')) { showLogin(); throw new Error('Login required'); }
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Request failed'); return j;
  };
  let posts = [], lists = null, editId = null;
  const form = $('#pf');

  function showLogin() { $('#app').hidden = true; $('#loginView').hidden = false; }
  async function showApp() { $('#loginView').hidden = true; $('#app').hidden = false; await load(); }

  $('#loginForm').onsubmit = async e => {
    e.preventDefault();
    try { await api('/api/admin/login', 'POST', { password: $('#pw').value }); $('#pw').value = ''; $('#loginMsg').textContent = ''; showApp(); }
    catch (err) { $('#loginMsg').textContent = err.message; }
  };
  $('#logout').onclick = async () => { await api('/api/admin/logout', 'POST'); showLogin(); };

  // ----- repeatable table rows -----
  function addRow(box, vals = {}) {
    const cols = box.dataset.cols.split(',').map(c => { const i = c.indexOf(':'); return [c.slice(0, i), c.slice(i + 1)]; });
    const div = document.createElement('div'); div.className = 'r'; div.style.setProperty('--n', cols.length);
    div.innerHTML = cols.map(([k, ph]) => `<input type="text" data-k="${k}" placeholder="${esc(ph)}" maxlength="300" value="${esc(vals[k] || '')}">`).join('') + '<button type="button" class="btn sm danger" title="Remove row">&times;</button>';
    div.querySelector('button').onclick = () => div.remove();
    box.insertBefore(div, box.querySelector('.add'));
  }
  document.querySelectorAll('.rep').forEach(box => {
    const add = document.createElement('button'); add.type = 'button'; add.className = 'btn sm add'; add.textContent = '+ Add row'; add.style.justifySelf = 'start';
    add.onclick = () => addRow(box); box.appendChild(add);
  });
  const readRows = box => [...box.querySelectorAll('.r')].map(r => Object.fromEntries([...r.querySelectorAll('input')].map(i => [i.dataset.k, i.value])));

  function fillLists() {
    $('#f_type').innerHTML = lists.types.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('');
    $('#f_state').innerHTML = lists.states.map(s => `<option>${esc(s)}</option>`).join('');
    $('#f_mode').innerHTML = lists.modes.map(s => `<option>${esc(s)}</option>`).join('');
    $('#f_cats').innerHTML = lists.cats.map(([k, l]) => `<label><input type="checkbox" name="cats" value="${k}"> ${esc(l)}</label>`).join('');
    $('#f_edu').innerHTML = lists.edu.map(e => `<label><input type="checkbox" name="edu" value="${esc(e)}"> ${esc(e)}</label>`).join('');
  }

  function openForm(p) {
    editId = p ? p.id : null;
    form.reset();
    document.querySelectorAll('.rep .r').forEach(r => r.remove());
    $('#formTitle').textContent = p ? 'Edit post' : 'New post';
    const v = p || { published: true, type: 'job', state: 'All India', appMode: 'Online' };
    for (const el of form.elements) {
      if (!el.name || el.type === 'submit' || el.type === 'button') continue;
      if (el.name === 'cats' || el.name === 'edu') el.checked = (v[el.name] || []).includes(el.value);
      else if (el.type === 'checkbox') el.checked = !!v[el.name];
      else if (v[el.name] !== undefined) el.value = v[el.name];
    }
    document.querySelectorAll('.rep').forEach(box => (v[box.dataset.t] || []).forEach(r => addRow(box, r)));
    form.hidden = false; $('#msg').textContent = '';
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function collect() {
    const o = {};
    for (const el of form.elements) {
      if (!el.name || el.type === 'submit' || el.type === 'button' || el.name === 'cats' || el.name === 'edu') continue;
      o[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    }
    o.cats = [...form.querySelectorAll('input[name=cats]:checked')].map(e => e.value);
    o.edu = [...form.querySelectorAll('input[name=edu]:checked')].map(e => e.value);
    document.querySelectorAll('.rep').forEach(box => { o[box.dataset.t] = readRows(box); });
    return o;
  }

  form.onsubmit = async e => {
    e.preventDefault();
    const btn = $('#saveBtn'); btn.disabled = true; const m = $('#msg'); m.className = ''; m.textContent = 'Saving...';
    try {
      await api(editId ? '/api/admin/govt/' + editId : '/api/admin/govt', editId ? 'PUT' : 'POST', collect());
      m.className = 'ok'; m.textContent = 'Saved';
      await load(); form.hidden = true; editId = null; scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) { m.className = 'bad'; m.textContent = err.message; }
    btn.disabled = false;
  };
  $('#cancelBtn').onclick = () => { form.hidden = true; editId = null; };
  $('#newBtn').onclick = () => openForm(null);

  // ----- list -----
  const dmy = d => d ? d.split('-').reverse().join('-') : '-';
  function drawList() {
    const q = $('#listQ').value.toLowerCase().trim();
    const rows = posts.filter(p => !q || (p.title + ' ' + p.board).toLowerCase().includes(q));
    const typeName = Object.fromEntries(lists.types);
    $('#list').innerHTML = rows.map(p => `<tr>
      <td class="nw">${dmy(p.postDate)}</td><td>${esc(typeName[p.type] || p.type)}</td>
      <td>${p.featured ? '★ ' : ''}${esc(p.title)}<br><span class="muted" style="font-size:12px">${esc(p.board)}</span></td>
      <td class="nw">${dmy(p.lastDate)}</td>
      <td><span class="pill ${p.published ? 'printed' : 'queued'}">${p.published ? 'Live' : 'Hidden'}</span></td>
      <td style="white-space:nowrap"><button class="btn sm" data-a="edit" data-id="${esc(p.id)}">Edit</button>
        <a class="btn sm" href="job.html?id=${encodeURIComponent(p.id)}" target="_blank">View</a>
        <button class="btn sm" data-a="copy" data-id="${esc(p.id)}">Copy</button>
        <button class="btn sm danger" data-a="del" data-id="${esc(p.id)}">Delete</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">No posts yet. Press "+ New post".</td></tr>';
  }
  $('#listQ').oninput = drawList;
  $('#list').onclick = async e => {
    const b = e.target.closest('button[data-a]'); if (!b) return;
    const p = posts.find(x => x.id === b.dataset.id); if (!p) return;
    try {
      if (b.dataset.a === 'edit') openForm(p);
      if (b.dataset.a === 'copy') { openForm({ ...p, title: p.title + ' (copy)' }); editId = null; $('#formTitle').textContent = 'New post (copy)'; }
      if (b.dataset.a === 'del' && confirm('Delete "' + p.title + '"?')) { await api('/api/admin/govt/' + p.id, 'DELETE'); await load(); }
    } catch (err) { alert(err.message); }
  };

  $('#importFile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const r = await api('/api/admin/govt-import', 'POST', data);
      alert(`Restored: ${r.added} added, ${r.updated} updated, ${r.skipped} skipped.`); await load();
    } catch (err) { alert('Could not restore: ' + err.message); }
  };

  async function load() {
    const r = await api('/api/admin/govt'); posts = r.posts;
    if (!lists) { lists = r.lists; fillLists(); }
    drawList();
  }

  api('/api/admin/me').then(showApp).catch(showLogin);
})();
