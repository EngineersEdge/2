(function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dmy = d => d ? d.split('-').reverse().join('-') : '';
  const TYPE = { job: 'Recruitment', 'admit-card': 'Admit Card', result: 'Result', 'answer-key': 'Answer Key', syllabus: 'Syllabus', edu: 'Education Update' };
  $('#yr').textContent = new Date().getFullYear();

  const id = new URLSearchParams(location.search).get('id') || '';
  const main = $('#main');

  const kv = rows => { const r = rows.filter(([, v]) => v); return r.length ? `<table class="kv">${r.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join('')}</table>` : ''; };
  const table = (cols, rows) => rows && rows.length ? `<div class="dt-wrap"><table class="dt"><thead><tr>${cols.map(c => `<th>${esc(c[1])}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${esc(r[c[0]])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
  const sec = (t, html) => html ? `<h2>${esc(t)}</h2>${html}` : '';
  const lines = t => String(t || '').split('\n').map(s => s.trim()).filter(Boolean);
  const ol = t => { const l = lines(t); return l.length ? `<ol class="steps-ol">${l.map(x => `<li>${esc(x.replace(/^\d+[.)]\s*/, ''))}</li>`).join('')}</ol>` : ''; };
  const prose = t => t ? `<div class="prose">${esc(t)}</div>` : '';
  const safeUrl = u => /^https?:\/\//i.test(u) ? u : '';

  function render(p) {
    document.title = `${p.title} | Engineer's Edge`;
    const age = p.ageMin || p.ageMax ? `${p.ageMin || '-'} to ${p.ageMax || '-'} years` + (p.ageAsOn ? ` (as on ${dmy(p.ageAsOn)})` : '') : '';
    const isJob = p.type === 'job';
    let status = '';
    if (isJob && p.lastDate && p.daysLeft !== null) status = p.daysLeft < 0 ? '<span class="left-chip">CLOSED</span>' : `<span class="left-chip${p.daysLeft > 7 ? ' ok' : ''}">${p.daysLeft === 0 ? 'LAST DATE TODAY' : p.daysLeft + (p.daysLeft === 1 ? ' DAY LEFT' : ' DAYS LEFT')}</span>`;

    const quick = [['Organisation', p.board], ['Post', p.postName], ['Qualification', p.qualificationText || (p.edu || []).join(', ')], ['Vacancy', p.vacancy], ['Age limit', age], ['Salary', p.salary], ['Start date', dmy(p.startDate)], ['Last date', dmy(p.lastDate)]];
    // non-job posts (admit card, result...) only show organisation and post
    const q = (isJob ? quick : quick.slice(0, 2)).filter(([, v]) => v);

    const links = [];
    if (safeUrl(p.applyUrl)) links.push(['Apply Online', p.applyUrl, true]);
    if (safeUrl(p.notificationUrl)) links.push(['Official Notification (PDF)', p.notificationUrl]);
    (p.links || []).forEach(l => { if (safeUrl(l.url)) links.push([l.label, l.url]); });
    const web = p.officialWebsite ? (safeUrl(p.officialWebsite) ? p.officialWebsite : 'https://' + p.officialWebsite.replace(/^\/+/, '')) : '';
    if (safeUrl(web)) links.push(['Official Website', web]);

    const wa = 'https://wa.me/919797975711?text=' + encodeURIComponent(`Hello, I want to apply for: ${p.title}. Please help me fill the form.`);

    main.innerHTML = `
      <div class="crumbs"><a href="/">Home</a> &rsaquo; <a href="jobs.html">Govt Jobs</a> &rsaquo; ${esc(TYPE[p.type] || '')}</div>
      <h1>${esc(p.title)}</h1>
      <p class="meta">${status} Posted: ${esc(dmy(p.postDate))}${p.state && p.state !== 'All India' ? ' &middot; ' + esc(p.state) : ''}${p.advtNo ? ' &middot; Advt No: ' + esc(p.advtNo) : ''}</p>
      ${q.length ? `<div class="quick">${q.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>` : ''}
      ${p.shortInfo ? `<div class="prose">${esc(p.shortInfo)}</div>` : ''}
      ${links.length ? `<div class="links-box" style="margin-top:14px">${links.map(([l, u, pri]) => `<a class="btn${pri ? ' primary' : ''}" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(l)}</a>`).join('')}</div>` : ''}
      ${isJob ? sec('Overview', kv([['Organisation', esc(p.board)], ['Post name', esc(p.postName)], ['Advertisement no.', esc(p.advtNo)], ['Total vacancy', esc(p.vacancy)], ['Qualification', esc(p.qualificationText)], ['Age limit', esc(age)], ['Salary / stipend', esc(p.salary)], ['Application mode', esc(p.appMode)], ['Job location', esc(p.state)], ['Official website', esc(p.officialWebsite)]])) : ''}
      ${sec('Important Dates', table([['event', 'Event'], ['date', 'Date']], p.dates))}
      <div class="two-col">
        <div>${sec('Application Fee', table([['category', 'Category'], ['fee', 'Fee']], p.fees))}</div>
        <div>${sec('Age Relaxation', table([['category', 'Category'], ['relaxation', 'Relaxation']], p.ageRelax))}</div>
      </div>
      ${sec('Vacancy Details (Post-wise)', table([['post', 'Post'], ['vacancies', 'Vacancies'], ['qualification', 'Qualification']], p.postWise))}
      <div class="two-col">
        <div>${sec('Category-wise Vacancy', table([['category', 'Category'], ['vacancies', 'Vacancies']], p.categoryWise))}</div>
        <div>${sec('State-wise Vacancy', table([['state', 'State / UT'], ['vacancies', 'Vacancies']], p.stateWise))}</div>
      </div>
      ${sec('Eligibility Notes', prose(p.eligibilityNotes))}
      ${sec('Selection Process', prose(p.selection))}
      ${sec('Exam Pattern', table([['subject', 'Subject'], ['questions', 'Questions'], ['marks', 'Marks']], p.examPattern))}
      ${sec('How to Apply', ol(p.howToApply))}
      ${sec('Photo / Signature Upload Specifications', table([['document', 'Document'], ['dimensions', 'Dimensions'], ['fileSize', 'File size']], p.uploadSpecs))}
      ${sec('Documents Required', ol(p.documents))}
      ${links.length ? sec('Important Links', `<div class="links-box">${links.map(([l, u]) => `<a class="btn" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(l)}</a>`).join('')}</div>`) : ''}
      <div class="cta-box"><h3>Want us to fill this form for you?</h3><p style="margin:0 0 10px">Send your documents on WhatsApp. We prepare the photo and signature to the right size, fill the form and share your receipt.</p><a class="btn wa" href="${esc(wa)}" target="_blank" rel="noopener">Apply via WhatsApp</a></div>
      <p class="disclaimer">Engineer's Edge is not the recruiting authority. Details are summarised from the official notification and may change. Please verify on the official website before applying.</p>`;
  }

  if (!id) { main.innerHTML = '<p class="bad" style="padding:40px 0">No job selected. <a href="jobs.html">Browse all jobs</a></p>'; return; }
  fetch('/api/govt/posts/' + encodeURIComponent(id)).then(r => r.ok ? r.json() : Promise.reject()).then(render)
    .catch(() => { main.innerHTML = '<p class="bad" style="padding:40px 0">This post was not found or has been removed. <a href="jobs.html">Browse all jobs</a></p>'; });
})();
