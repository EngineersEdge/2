// Government jobs & exam-updates module: public read API + admin CRUD.
// Posts are stored in <DATA>/govt-posts.json. On first start they are seeded from seed/govt-posts.json.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TYPES = ['job', 'admit-card', 'result', 'answer-key', 'syllabus', 'edu'];
const TYPE_LABELS = { job: 'Latest Jobs', 'admit-card': 'Admit Card', result: 'Results', 'answer-key': 'Answer Key', syllabus: 'Syllabus', edu: 'Education' };
const CATS = {
  central: 'All India Govt', state: 'State Govt', bank: 'Bank', railway: 'Railway', teaching: 'Teaching',
  engineering: 'Engineering', 'police-defence': 'Police / Defence', psu: 'PSU', ssc: 'SSC', upsc: 'UPSC', medical: 'Medical'
};
const EDU = ['8th', '10th', '12th', 'ITI', 'Diploma', 'B.Tech/B.E', 'B.Sc', 'B.Com', 'B.Ed', 'Any Graduate', 'Post Graduate', 'MBA/PGDM', 'M.Tech/M.E', 'CA/CMA', 'Law', 'Medical/Nursing', 'PhD'];
const STATES = ['All India', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu & Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman & Nicobar', 'Chandigarh', 'Dadra & Nagar Haveli and Daman & Diu', 'Lakshadweep', 'Puducherry'];
const MODES = ['Online', 'Offline', 'Walk-in', 'Email / Post'];

// repeatable tables: key -> column names
const TABLES = {
  dates: ['event', 'date'],
  fees: ['category', 'fee'],
  postWise: ['post', 'vacancies', 'qualification'],
  categoryWise: ['category', 'vacancies'],
  stateWise: ['state', 'vacancies'],
  ageRelax: ['category', 'relaxation'],
  examPattern: ['subject', 'questions', 'marks'],
  uploadSpecs: ['document', 'dimensions', 'fileSize'],
  links: ['label', 'url']
};

const clean = v => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r/g, '');
const str = (v, max = 200) => clean(v).replace(/\s+/g, ' ').trim().slice(0, max);
const text = (v, max = 4000) => clean(v).trim().slice(0, max);
const isoDate = v => { const s = String(v || ''); return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) ? s : ''; };
const link = v => { const s = str(v, 500); return /^https?:\/\/[^\s<>"']+$/i.test(s) ? s : ''; };
const pick = (arr, allowed) => [...new Set((Array.isArray(arr) ? arr : []).filter(x => allowed.includes(x)))];
const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'post';

function sanitizeTable(key, rows) {
  const cols = TABLES[key];
  return (Array.isArray(rows) ? rows : []).slice(0, 60).map(r => {
    const o = {};
    for (const c of cols) o[c] = c === 'url' ? link(r && r[c]) : str(r && r[c], 300);
    return o;
  }).filter(o => (key === 'links' ? o.label && o.url : cols.some(c => o[c])));
}

// returns a clean post body (without id/timestamps) or throws Error with a message for the admin
function sanitizePost(b) {
  b = b || {};
  const p = {
    type: TYPES.includes(b.type) ? b.type : 'job',
    title: str(b.title, 220),
    board: str(b.board, 120),
    postName: str(b.postName, 220),
    advtNo: str(b.advtNo, 120),
    state: STATES.includes(b.state) ? b.state : 'All India',
    cats: pick(b.cats, Object.keys(CATS)),
    edu: pick(b.edu, EDU),
    vacancy: str(b.vacancy, 40),
    qualificationText: str(b.qualificationText, 300),
    appMode: MODES.includes(b.appMode) ? b.appMode : 'Online',
    postDate: isoDate(b.postDate),
    startDate: isoDate(b.startDate),
    lastDate: isoDate(b.lastDate),
    ageMin: str(b.ageMin, 10),
    ageMax: str(b.ageMax, 10),
    ageAsOn: isoDate(b.ageAsOn),
    salary: str(b.salary, 150),
    shortInfo: text(b.shortInfo, 1500),
    eligibilityNotes: text(b.eligibilityNotes, 2000),
    selection: text(b.selection, 2000),
    howToApply: text(b.howToApply, 4000),
    documents: text(b.documents, 2000),
    applyUrl: link(b.applyUrl),
    notificationUrl: link(b.notificationUrl),
    officialWebsite: str(b.officialWebsite, 200),
    featured: !!b.featured,
    published: b.published !== false
  };
  for (const k of Object.keys(TABLES)) p[k] = sanitizeTable(k, b[k]);
  if (!p.title) throw new Error('Title is required');
  if (b.applyUrl && !p.applyUrl) throw new Error('Apply Online link must start with http:// or https://');
  if (b.notificationUrl && !p.notificationUrl) throw new Error('Notification link must start with http:// or https://');
  return p;
}

const SUMMARY_KEYS = ['id', 'type', 'title', 'board', 'postName', 'edu', 'cats', 'state', 'advtNo', 'vacancy', 'qualificationText', 'postDate', 'lastDate', 'featured'];
const summary = p => Object.fromEntries(SUMMARY_KEYS.map(k => [k, p[k]]));

module.exports = function mountGovt(app, { requireAdmin, DATA }) {
  const FILE = path.join(DATA, 'govt-posts.json');
  const SEED = path.join(__dirname, 'seed', 'govt-posts.json');
  const read = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
  const save = () => { const t = FILE + '.tmp'; fs.writeFileSync(t, JSON.stringify(posts, null, 2)); fs.renameSync(t, FILE); };

  let posts = read(FILE);
  if (!Array.isArray(posts)) {
    posts = [];
    const seed = read(SEED);
    if (Array.isArray(seed)) {
      for (const s of seed) {
        try {
          const now = new Date().toISOString();
          posts.push({ id: slug(s.title) + '-' + crypto.randomBytes(2).toString('hex'), ...sanitizePost(s), createdAt: now, updatedAt: now });
        } catch { /* skip bad seed row */ }
      }
    }
    save();
  }

  const byNewest = (a, b) => (b.postDate || '').localeCompare(a.postDate || '') || b.createdAt.localeCompare(a.createdAt);
  const isOpen = (p, today) => p.type !== 'job' || !p.lastDate || p.lastDate >= today;

  // ---------- public ----------
  app.get('/api/govt/meta', (req, res) => {
    const today = todayIST();
    const live = posts.filter(p => p.published);
    const count = (list, keyFn) => { const m = {}; list.forEach(p => [].concat(keyFn(p)).forEach(k => { if (k) m[k] = (m[k] || 0) + 1; })); return m; };
    const openJobs = live.filter(p => p.type === 'job' && isOpen(p, today));
    const closingSoon = openJobs
      .filter(p => p.lastDate && dayDiff(today, p.lastDate) <= 7)
      .sort((a, b) => a.lastDate.localeCompare(b.lastDate))
      .slice(0, 8)
      .map(p => ({ ...summary(p), daysLeft: dayDiff(today, p.lastDate) }));
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      today,
      lists: { types: TYPES.map(k => [k, TYPE_LABELS[k]]), cats: Object.entries(CATS), edu: EDU, states: STATES, modes: MODES },
      counts: {
        types: count(live, p => p.type),
        edu: count(openJobs, p => p.edu),
        states: count(openJobs, p => p.state),
        cats: count(openJobs, p => p.cats)
      },
      closingSoon
    });
  });

  app.get('/api/govt/posts', (req, res) => {
    const q = String(req.query.q || '').toLowerCase().trim();
    const type = TYPES.includes(req.query.type) ? req.query.type : '';
    const cat = String(req.query.cat || '');
    const state = String(req.query.state || '');
    const edu = String(req.query.edu || '');
    const openOnly = req.query.open === '1';
    const today = todayIST();
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    let list = posts.filter(p => p.published);
    if (type) list = list.filter(p => p.type === type);
    if (cat) list = list.filter(p => p.cats.includes(cat));
    if (state) list = list.filter(p => p.state === state);
    if (edu) list = list.filter(p => p.edu.includes(edu));
    if (openOnly) list = list.filter(p => isOpen(p, today));
    if (q) list = list.filter(p => [p.title, p.board, p.postName, p.advtNo, p.state, p.qualificationText].join(' ').toLowerCase().includes(q));
    list.sort(byNewest);
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ total: list.length, page, limit, items: list.slice((page - 1) * limit, page * limit).map(summary) });
  });

  app.get('/api/govt/posts/:id', (req, res) => {
    const p = posts.find(x => x.id === req.params.id && x.published);
    if (!p) return res.status(404).json({ error: 'Not found' });
    res.json({ ...p, daysLeft: p.lastDate ? dayDiff(todayIST(), p.lastDate) : null });
  });

  // ---------- admin ----------
  app.get('/api/admin/govt', requireAdmin, (req, res) => {
    res.json({ posts: posts.slice().sort(byNewest), lists: { types: TYPES.map(k => [k, TYPE_LABELS[k]]), cats: Object.entries(CATS), edu: EDU, states: STATES, modes: MODES } });
  });
  app.post('/api/admin/govt', requireAdmin, (req, res) => {
    try {
      if (posts.length >= 5000) throw new Error('Post limit reached (5000). Delete old posts first.');
      const p = sanitizePost(req.body);
      const now = new Date().toISOString();
      const post = { id: slug(p.title) + '-' + crypto.randomBytes(2).toString('hex'), ...p, postDate: p.postDate || todayIST(), createdAt: now, updatedAt: now };
      posts.unshift(post); save();
      res.json({ ok: true, post });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.put('/api/admin/govt/:id', requireAdmin, (req, res) => {
    const i = posts.findIndex(x => x.id === req.params.id);
    if (i < 0) return res.status(404).json({ error: 'No such post' });
    try {
      const p = sanitizePost(req.body);
      posts[i] = { ...p, id: posts[i].id, postDate: p.postDate || posts[i].postDate, createdAt: posts[i].createdAt, updatedAt: new Date().toISOString() };
      save();
      res.json({ ok: true, post: posts[i] });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.delete('/api/admin/govt/:id', requireAdmin, (req, res) => {
    const i = posts.findIndex(x => x.id === req.params.id);
    if (i < 0) return res.status(404).json({ error: 'No such post' });
    posts.splice(i, 1); save();
    res.json({ ok: true });
  });
  // backup / restore (Render's free disk is wiped on redeploy, so keep an export)
  app.get('/api/admin/govt-export', requireAdmin, (req, res) => {
    res.set('Content-Disposition', 'attachment; filename="govt-posts-' + todayIST() + '.json"');
    res.type('application/json').send(JSON.stringify(posts, null, 2));
  });
  app.post('/api/admin/govt-import', requireAdmin, (req, res) => {
    const rows = Array.isArray(req.body) ? req.body : req.body && req.body.posts;
    if (!Array.isArray(rows)) return res.status(400).json({ error: 'Expected a list of posts' });
    let added = 0, updated = 0, skipped = 0;
    for (const r of rows.slice(0, 5000)) {
      try {
        const p = sanitizePost(r);
        const now = new Date().toISOString();
        const i = r && r.id ? posts.findIndex(x => x.id === String(r.id)) : -1;
        if (i >= 0) { posts[i] = { ...p, id: posts[i].id, createdAt: posts[i].createdAt, updatedAt: now }; updated++; }
        else { posts.push({ id: (r && /^[a-z0-9-]{3,80}$/.test(String(r.id || '')) ? String(r.id) : slug(p.title) + '-' + crypto.randomBytes(2).toString('hex')), ...p, postDate: p.postDate || todayIST(), createdAt: now, updatedAt: now }); added++; }
      } catch { skipped++; }
    }
    posts = posts.slice(0, 5000);
    save();
    res.json({ ok: true, added, updated, skipped });
  });
};
