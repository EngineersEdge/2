// Free in-browser tools. Nothing is uploaded to any server.
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const dl = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  const readBuf = f => f.arrayBuffer();
  const base = n => n.replace(/\.[^.]+$/, '');
  const fmtKB = b => (b / 1024).toFixed(b < 102400 ? 1 : 0) + ' KB';
  const loadImg = file => new Promise((res, rej) => { const u = URL.createObjectURL(file); const i = new Image(); i.onload = () => { URL.revokeObjectURL(u); res(i); }; i.onerror = () => rej(new Error('Could not read image ' + file.name)); i.src = u; });
  const toBlob = (c, type, q) => new Promise(r => c.toBlob(r, type, q));
  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  function drawToCanvas(img, w, h, bg) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
    x.drawImage(img, 0, 0, w, h); return c;
  }
  async function renderPdf(file, scale, onPage) {
    const pdf = await pdfjsLib.getDocument({ data: await readBuf(file) }).promise;
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i), vp = page.getViewport({ scale });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      await onPage(c, i, pdf.numPages, page);
    }
    return pdf.numPages;
  }
  function parseRanges(str, max) {
    const out = [];
    for (const part of str.split(',')) {
      const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/); if (!m) continue;
      let a = +m[1], b = m[2] ? +m[2] : a; if (a > b) [a, b] = [b, a];
      for (let p = Math.max(1, a); p <= Math.min(max, b); p++) out.push(p);
    }
    return out;
  }

  const TOOLS = [
    { id: 'img2pdf', title: 'Image to PDF', desc: 'Combine JPG / PNG images into one PDF (A4).', files: 'image/*', multiple: true, opts: [{ k: 'fit', label: 'Page', type: 'select', options: [['a4', 'A4 page, fit image'], ['orig', 'Same size as image']] }],
      async run(files, o, log) {
        const pdf = await PDFLib.PDFDocument.create();
        for (const f of files) {
          log('Adding ' + f.name);
          let bytes = await readBuf(f), img;
          if (/png$/i.test(f.type)) img = await pdf.embedPng(bytes);
          else if (/jpe?g$/i.test(f.type)) img = await pdf.embedJpg(bytes);
          else { const i = await loadImg(f); const c = drawToCanvas(i, i.naturalWidth, i.naturalHeight, '#fff'); img = await pdf.embedJpg(await (await toBlob(c, 'image/jpeg', 0.92)).arrayBuffer()); }
          if (o.fit === 'orig') { pdf.addPage([img.width, img.height]).drawImage(img, { x: 0, y: 0, width: img.width, height: img.height }); }
          else { const W = 595.28, H = 841.89, M = 24, s = Math.min((W - 2 * M) / img.width, (H - 2 * M) / img.height, 1.5 * 1); const p = pdf.addPage([W, H]); p.drawImage(img, { x: (W - img.width * s) / 2, y: (H - img.height * s) / 2, width: img.width * s, height: img.height * s }); }
        }
        const b = new Blob([await pdf.save()], { type: 'application/pdf' }); dl(b, 'images.pdf'); return 'images.pdf created (' + fmtKB(b.size) + ')';
      } },
    { id: 'pdf2img', title: 'PDF to JPG / PNG', desc: 'Turn every PDF page into an image.', files: '.pdf,application/pdf', opts: [{ k: 'fmt', label: 'Format', type: 'select', options: [['jpeg', 'JPG'], ['png', 'PNG']] }, { k: 'q', label: 'Quality', type: 'select', options: [['2', 'High (sharp)'], ['1.4', 'Medium'], ['1', 'Small']] }],
      async run(files, o, log) {
        const f = files[0], ext = o.fmt === 'png' ? 'png' : 'jpg';
        const n = await renderPdf(f, +o.q, async (c, i, t) => { log(`Page ${i} of ${t}`); dl(await toBlob(c, 'image/' + o.fmt, 0.92), `${base(f.name)}-page${i}.${ext}`); await new Promise(r => setTimeout(r, 250)); });
        return n + ' image(s) downloaded. Allow multiple downloads if your browser asks.';
      } },
    { id: 'pdf2word', title: 'PDF to Word', desc: 'Extract text from a PDF into an editable Word file.', files: '.pdf,application/pdf', opts: [],
      async run(files, o, log) {
        const f = files[0], pdf = await pdfjsLib.getDocument({ data: await readBuf(f) }).promise; let html = '', chars = 0;
        for (let p = 1; p <= pdf.numPages; p++) {
          log(`Reading page ${p} of ${pdf.numPages}`);
          const tc = await (await pdf.getPage(p)).getTextContent(); const lines = []; let cur = [], y = null;
          for (const it of tc.items) { const ty = Math.round(it.transform[5]); if (y !== null && Math.abs(ty - y) > 4) { lines.push(cur.join(' ')); cur = []; } cur.push(it.str); y = ty; }
          if (cur.length) lines.push(cur.join(' '));
          const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
          html += lines.filter(l => l.trim()).map(l => { chars += l.length; return `<p>${esc(l.replace(/\s+/g, ' ').trim())}</p>`; }).join('') + (p < pdf.numPages ? '<br clear=all style="page-break-before:always">' : '');
        }
        if (chars < 20) throw new Error('No selectable text found. This looks like a scanned PDF. Convert it to images, or message us on WhatsApp for OCR typing.');
        const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>body{font-family:Calibri;font-size:11pt}</style></head><body>${html}</body></html>`;
        dl(new Blob(['﻿', doc], { type: 'application/msword' }), base(f.name) + '.doc');
        return 'Word file created. Text is extracted; complex layouts, tables and images are not preserved.';
      } },
    { id: 'merge', title: 'Merge PDF', desc: 'Join several PDFs into one, in the order selected.', files: '.pdf,application/pdf', multiple: true, opts: [],
      async run(files, o, log) {
        if (files.length < 2) throw new Error('Select at least 2 PDF files.');
        const out = await PDFLib.PDFDocument.create();
        for (const f of files) { log('Adding ' + f.name); const d = await PDFLib.PDFDocument.load(await readBuf(f)); (await out.copyPages(d, d.getPageIndices())).forEach(p => out.addPage(p)); }
        const b = new Blob([await out.save()], { type: 'application/pdf' }); dl(b, 'merged.pdf'); return 'merged.pdf created (' + fmtKB(b.size) + ')';
      } },
    { id: 'split', title: 'Split / Extract Pages', desc: 'Keep only the pages you want.', files: '.pdf,application/pdf', opts: [{ k: 'range', label: 'Pages (e.g. 1-3, 5, 8-10)', type: 'text', value: '1' }],
      async run(files, o) {
        const d = await PDFLib.PDFDocument.load(await readBuf(files[0])), pages = parseRanges(o.range, d.getPageCount());
        if (!pages.length) throw new Error('No valid pages. This PDF has ' + d.getPageCount() + ' page(s).');
        const out = await PDFLib.PDFDocument.create(); (await out.copyPages(d, pages.map(p => p - 1))).forEach(p => out.addPage(p));
        dl(new Blob([await out.save()], { type: 'application/pdf' }), base(files[0].name) + '-pages.pdf'); return pages.length + ' page(s) extracted.';
      } },
    { id: 'pdfcompress', title: 'Compress PDF', desc: 'Reduce PDF size for portal uploads (pages become images).', files: '.pdf,application/pdf', opts: [{ k: 'lvl', label: 'Level', type: 'select', options: [['1.3|0.6', 'Balanced'], ['1|0.45', 'Small'], ['0.75|0.35', 'Smallest']] }],
      async run(files, o, log) {
        const [sc, q] = o.lvl.split('|').map(Number), out = await PDFLib.PDFDocument.create();
        await renderPdf(files[0], sc, async (c, i, t, page) => { log(`Page ${i} of ${t}`); const img = await out.embedJpg(await (await toBlob(c, 'image/jpeg', q)).arrayBuffer()); const vp = page.getViewport({ scale: 1 }); out.addPage([vp.width, vp.height]).drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height }); });
        const b = new Blob([await out.save()], { type: 'application/pdf' });
        dl(b, base(files[0].name) + '-small.pdf'); return `${fmtKB(files[0].size)} became ${fmtKB(b.size)}. ` + (b.size >= files[0].size ? 'This file was already small; keep the original.' : 'Text is no longer selectable.');
      } },
    { id: 'imgconv', title: 'Image Converter', desc: 'JPG, PNG and WEBP in any direction.', files: 'image/*', multiple: true, opts: [{ k: 'to', label: 'Convert to', type: 'select', options: [['image/jpeg|jpg', 'JPG'], ['image/png|png', 'PNG'], ['image/webp|webp', 'WEBP']] }],
      async run(files, o, log) {
        const [mime, ext] = o.to.split('|');
        for (const f of files) { log('Converting ' + f.name); const i = await loadImg(f); const c = drawToCanvas(i, i.naturalWidth, i.naturalHeight, mime === 'image/jpeg' ? '#fff' : null); dl(await toBlob(c, mime, 0.92), base(f.name) + '.' + ext); await new Promise(r => setTimeout(r, 250)); }
        return files.length + ' file(s) converted.';
      } },
    { id: 'photo', title: 'Photo / Signature Resize', desc: 'Exact pixel size and maximum KB for exam and portal uploads.', files: 'image/*', opts: [
        { k: 'preset', label: 'Preset', type: 'select', options: [['', 'Custom'], ['200|230|50', 'Photo 200x230, max 50 KB'], ['140|60|20', 'Signature 140x60, max 20 KB'], ['350|450|100', 'Photo 350x450, max 100 KB']] },
        { k: 'w', label: 'Width (px)', type: 'number', value: 200 }, { k: 'h', label: 'Height (px)', type: 'number', value: 230 }, { k: 'kb', label: 'Max size (KB)', type: 'number', value: 50 }],
      async run(files, o, log) {
        const w = +o.w, h = +o.h, kb = +o.kb; if (!w || !h || !kb) throw new Error('Enter width, height and max KB.');
        const i = await loadImg(files[0]); const c = drawToCanvas(i, w, h, '#fff');
        let lo = 0.05, hi = 0.95, best = await toBlob(c, 'image/jpeg', lo);
        if (best.size > kb * 1024) throw new Error('Even at lowest quality this is ' + fmtKB(best.size) + '. Increase max KB or reduce width/height.');
        for (let k = 0; k < 9; k++) { const m = (lo + hi) / 2, b = await toBlob(c, 'image/jpeg', m); if (b.size <= kb * 1024) { best = b; lo = m; } else hi = m; }
        dl(best, base(files[0].name) + `-${w}x${h}.jpg`); return `Saved ${w}x${h}px, ${fmtKB(best.size)}. Image is stretched to the exact size; crop first if the face looks wrong.`;
      } },
    { id: 'qr', title: 'QR Code', desc: 'Create a QR code for a link, UPI ID, WhatsApp number or text.', files: null, opts: [{ k: 'text', label: 'Text or link', type: 'text', value: 'https://wa.me/919797975711' }],
      async run(files, o, log, out) {
        if (!o.text.trim()) throw new Error('Enter some text.'); if (!window.QRCode) throw new Error('QR library did not load. Check internet.');
        out.innerHTML = ''; const box = document.createElement('div'); box.style.cssText = 'background:#fff;padding:14px;display:inline-block;border-radius:8px'; out.appendChild(box);
        new QRCode(box, { text: o.text, width: 240, height: 240, correctLevel: QRCode.CorrectLevel.M });
        await new Promise(r => setTimeout(r, 150)); const cv = box.querySelector('canvas');
        const b = document.createElement('button'); b.className = 'btn'; b.textContent = 'Download PNG'; b.onclick = async () => dl(await toBlob(cv, 'image/png'), 'qr.png'); out.appendChild(document.createElement('br')); out.appendChild(b); return '';
      } },
    { id: 'pdfedit', title: 'PDF Edit', desc: 'Add text, a signature or stamp, and a watermark to a PDF. Positions are % from the top-left of the page.', files: '.pdf,application/pdf',
      opts: [
        { k: 'items', label: 'Text to add: one per line as  page | x% | y% | font size | text  (page 0 = every page)', type: 'textarea', value: '1 | 10 | 12 | 14 | Name: Your name here' },
        { k: 'color', label: 'Text colour', type: 'select', options: [['0,0,0', 'Black'], ['0.8,0,0', 'Red'], ['0,0.25,0.8', 'Blue']] },
        { k: 'img', label: 'Signature or stamp image (optional, PNG or JPG)', type: 'file', accept: 'image/png,image/jpeg' },
        { k: 'imgp', label: 'Signature page (number, 0 = every page)', type: 'number', value: 1 },
        { k: 'imgxy', label: 'Signature position: x% | y% | width%  (top-left corner)', type: 'text', value: '70 | 80 | 25' },
        { k: 'wm', label: 'Watermark text on every page (optional)', type: 'text', value: '' }
      ],
      async run(files, o, log) {
        let doc;
        try { doc = await PDFLib.PDFDocument.load(await readBuf(files[0])); }
        catch { throw new Error('This PDF could not be opened. It may be password-protected or damaged.'); }
        const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica), pages = doc.getPages(), rgb = PDFLib.rgb;
        const num = v => { const n = Number(String(v).trim()); if (!isFinite(n)) throw new Error('Expected a number, got "' + v + '".'); return n; };
        const targets = pg => (num(pg) === 0 ? pages : [pages[num(pg) - 1]]);
        const [r, g, b] = o.color.split(',').map(Number), col = rgb(r, g, b);
        let added = 0;
        for (const line of o.items.split('\n').map(l => l.trim()).filter(Boolean)) {
          const parts = line.split('|').map(x => x.trim());
          if (parts.length < 5) throw new Error('Each text line needs 5 parts: page | x% | y% | size | text. Problem line: ' + line);
          const [pg, x, y, size, ...rest] = parts, text = rest.join('|');
          if (targets(pg).some(p => !p)) throw new Error('Page ' + pg + ' does not exist. This PDF has ' + pages.length + ' page(s).');
          for (const p of targets(pg)) {
            const { width, height } = p.getSize();
            try { p.drawText(text, { x: width * num(x) / 100, y: height * (1 - num(y) / 100), size: num(size) || 12, font, color: col }); }
            catch { throw new Error('Only English letters, numbers and common symbols can be added as text here. Use the Word or PDF editor for other scripts.'); }
            added++;
          }
        }
        if (o.img) {
          log('Placing signature');
          const bytes = await readBuf(o.img), img = /png$/i.test(o.img.type) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
          const [x, y, w] = o.imgxy.split('|').map(v => num(v));
          for (const p of targets(o.imgp)) {
            if (!p) throw new Error('Signature page does not exist.');
            const { width, height } = p.getSize(), dw = width * w / 100, dh = dw * img.height / img.width;
            p.drawImage(img, { x: width * x / 100, y: height * (1 - y / 100) - dh, width: dw, height: dh });
            added++;
          }
        }
        if (o.wm.trim()) {
          log('Adding watermark');
          const text = o.wm.trim();
          for (const p of pages) {
            const { width, height } = p.getSize(), size = Math.max(18, Math.min(72, width / (text.length * 0.55)));
            try { p.drawText(text, { x: width * 0.12, y: height * 0.42, size, font, color: rgb(0.55, 0.55, 0.55), opacity: 0.3, rotate: PDFLib.degrees(35) }); }
            catch { throw new Error('Watermark text must use English letters, numbers and common symbols.'); }
          }
          added++;
        }
        if (!added) throw new Error('Add some text, a signature or a watermark first.');
        dl(new Blob([await doc.save()], { type: 'application/pdf' }), base(files[0].name) + '-edited.pdf');
        return `Edited PDF downloaded (${added} change(s)). Open it to check the placement; adjust the % values and run again if needed.`;
      } },
    { id: 'pdfpages', title: 'PDF Pages: Rotate / Delete', desc: 'Turn pages the right way round, or remove pages you do not need.', files: '.pdf,application/pdf',
      opts: [
        { k: 'act', label: 'Action', type: 'select', options: [['rot90', 'Rotate clockwise 90 degrees'], ['rot270', 'Rotate anticlockwise 90 degrees'], ['rot180', 'Rotate 180 degrees'], ['del', 'Delete the chosen pages']] },
        { k: 'range', label: 'Pages (e.g. 1-3, 5). Leave empty for all pages', type: 'text', value: '' }
      ],
      async run(files, o) {
        let d;
        try { d = await PDFLib.PDFDocument.load(await readBuf(files[0])); }
        catch { throw new Error('This PDF could not be opened. It may be password-protected or damaged.'); }
        const n = d.getPageCount();
        const sel = [...new Set(o.range.trim() ? parseRanges(o.range, n) : d.getPageIndices().map(i => i + 1))];
        if (!sel.length) throw new Error('No valid pages. This PDF has ' + n + ' page(s).');
        if (o.act === 'del') {
          if (sel.length >= n) throw new Error('You cannot delete every page.');
          sel.sort((a, b) => b - a).forEach(p => d.removePage(p - 1));
        } else {
          const add = { rot90: 90, rot180: 180, rot270: 270 }[o.act];
          for (const p of sel) { const pg = d.getPage(p - 1); pg.setRotation(PDFLib.degrees((pg.getRotation().angle + add) % 360)); }
        }
        dl(new Blob([await d.save()], { type: 'application/pdf' }), base(files[0].name) + '-pages.pdf');
        return o.act === 'del' ? `${sel.length} page(s) deleted. ${n - sel.length} page(s) left.` : `${sel.length} page(s) rotated.`;
      } },
    { id: 'aadhaar', title: 'Aadhaar to PVC Card', desc: 'Open your Aadhaar PDF with its password and get the front and back in full colour at exact PVC card size (85.6 x 54 mm), ready to print. Runs in your browser; the PDF and password are not uploaded.', files: '.pdf,application/pdf',
      opts: [
        { k: 'pw', label: 'PDF password: first 4 letters of the name in CAPITALS + birth year (example RAJE1990)', type: 'password', value: '' },
        { k: 'layout', label: 'Print layout', type: 'select', options: [['stack', 'A4 sheet: front above back'], ['side', 'A4 sheet: front and back side by side'], ['card', 'Card-size pages: page 1 front, page 2 back']] },
        { k: 'round', label: 'Corners', type: 'select', options: [['0', 'Square'], ['1', 'Rounded (PVC style)']] }
      ],
      async run(files, o, log, out) {
        let pdf;
        try { pdf = await pdfjsLib.getDocument({ data: await readBuf(files[0]), password: o.pw.trim() }).promise; }
        catch (e) { throw new Error(e && e.name === 'PasswordException' ? (e.code === 1 ? 'This PDF needs a password. Enter it above.' : 'Wrong password. Use the first 4 letters of the name in CAPITALS followed by the birth year.') : 'This PDF could not be opened. It may be damaged.'); }
        log('Reading the PDF ...');
        const page = await pdf.getPage(1), vp = page.getViewport({ scale: 4 });
        const pc = document.createElement('canvas'); pc.width = vp.width; pc.height = vp.height;
        const px = pc.getContext('2d'); px.fillStyle = '#fff'; px.fillRect(0, 0, pc.width, pc.height);
        await page.render({ canvasContext: px, viewport: vp }).promise;

        const DEF = { F: [4, 52, 45, 28], B: [51, 52, 45, 28] }; // x, y, w, h in % of the page
        let areas; try { areas = JSON.parse(localStorage.getItem('ee_aadhaar_areas')); } catch { }
        if (!areas || !areas.F || !areas.B) areas = JSON.parse(JSON.stringify(DEF));
        const MM = 72 / 25.4, CW = 85.6 * MM, CH = 54 * MM, round = o.round === '1';

        out.innerHTML = `<p class="muted">Drag on the page below to mark the <b style="color:#16a34a">front</b> or the <b style="color:#dc2626">back</b> of the card. Check the two previews, then download.</p>
          <div style="margin:8px 0"><label style="display:inline-flex;gap:6px;margin-right:14px"><input type="radio" name="aadside" value="F" checked> Front (green)</label><label style="display:inline-flex;gap:6px;margin-right:14px"><input type="radio" name="aadside" value="B"> Back (red)</label><button type="button" class="btn sm" data-reset>Reset</button></div>
          <div class="aad-stage" style="position:relative;display:inline-block;max-width:100%;touch-action:none"><canvas class="aad-page" style="max-width:100%;height:auto;display:block;border:1px solid #cbd5e1"></canvas>
            <div data-s="F" style="position:absolute;pointer-events:none;border:2px solid #16a34a;background:rgba(22,163,74,.12)"></div>
            <div data-s="B" style="position:absolute;pointer-events:none;border:2px solid #dc2626;background:rgba(220,38,38,.12)"></div></div>
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin:12px 0"><canvas data-pv="F" style="width:260px;max-width:100%;border:1px solid #cbd5e1;background:#fff"></canvas><canvas data-pv="B" style="width:260px;max-width:100%;border:1px solid #cbd5e1;background:#fff"></canvas></div>
          <button type="button" class="btn primary" data-make>Download print PDF</button>`;
        const view = out.querySelector('.aad-page'); view.width = pc.width; view.height = pc.height; view.getContext('2d').drawImage(pc, 0, 0);

        const crop = s => { const a = areas[s], W = pc.width, H = pc.height; const w = Math.max(1, Math.round(a[2] / 100 * W)), h = Math.max(1, Math.round(a[3] / 100 * H)); const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(pc, Math.round(a[0] / 100 * W), Math.round(a[1] / 100 * H), w, h, 0, 0, w, h); return c; };
        const refresh = () => {
          const w = view.clientWidth, h = view.clientHeight;
          for (const s of ['F', 'B']) {
            const el = out.querySelector(`[data-s="${s}"]`), a = areas[s];
            el.style.left = a[0] / 100 * w + 'px'; el.style.top = a[1] / 100 * h + 'px'; el.style.width = a[2] / 100 * w + 'px'; el.style.height = a[3] / 100 * h + 'px';
            const src = crop(s), pv = out.querySelector(`[data-pv="${s}"]`); pv.width = src.width; pv.height = src.height; pv.getContext('2d').drawImage(src, 0, 0);
          }
          try { localStorage.setItem('ee_aadhaar_areas', JSON.stringify(areas)); } catch { }
        };
        let start = null;
        const pos = e => { const r = view.getBoundingClientRect(); return [Math.min(100, Math.max(0, (e.clientX - r.left) / r.width * 100)), Math.min(100, Math.max(0, (e.clientY - r.top) / r.height * 100))]; };
        view.onpointerdown = e => { view.setPointerCapture(e.pointerId); start = pos(e); };
        view.onpointermove = e => { if (!start) return; const p = pos(e), s = out.querySelector('input[name=aadside]:checked').value; areas[s] = [Math.min(start[0], p[0]), Math.min(start[1], p[1]), Math.abs(p[0] - start[0]), Math.abs(p[1] - start[1])]; refresh(); };
        view.onpointerup = () => { start = null; };
        out.querySelector('[data-reset]').onclick = () => { areas = JSON.parse(JSON.stringify(DEF)); refresh(); };
        refresh();

        // Resample each card to exactly 85.6 x 54 mm at 600 dpi
        const cardBlob = async s => {
          const dpi = 600, w = Math.round(85.6 / 25.4 * dpi), h = Math.round(54 / 25.4 * dpi), c = document.createElement('canvas'); c.width = w; c.height = h;
          const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.imageSmoothingQuality = 'high';
          if (round) { const r = Math.round(3.18 / 25.4 * dpi); x.beginPath(); x.moveTo(r, 0); x.arcTo(w, 0, w, h, r); x.arcTo(w, h, 0, h, r); x.arcTo(0, h, 0, 0, r); x.arcTo(0, 0, w, 0, r); x.closePath(); x.clip(); }
          x.drawImage(crop(s), 0, 0, w, h);
          return toBlob(c, round ? 'image/png' : 'image/jpeg', 0.95);
        };
        out.querySelector('[data-make]').onclick = async e => {
          const btn = e.target; btn.disabled = true;
          try {
            const doc = await PDFLib.PDFDocument.create();
            const emb = async s => { const ab = await (await cardBlob(s)).arrayBuffer(); return round ? doc.embedPng(ab) : doc.embedJpg(ab); };
            const F = await emb('F'), B = await emb('B');
            if (o.layout === 'card') {
              doc.addPage([CW, CH]).drawImage(F, { x: 0, y: 0, width: CW, height: CH });
              doc.addPage([CW, CH]).drawImage(B, { x: 0, y: 0, width: CW, height: CH });
            } else {
              const W = 595.28, H = 841.89, p = doc.addPage([W, H]), gap = 8 * MM, top = H - 20 * MM - CH;
              const fx = o.layout === 'side' ? (W - 2 * CW - gap) / 2 : (W - CW) / 2, fy = top;
              const bx = o.layout === 'side' ? fx + CW + gap : fx, by = o.layout === 'side' ? top : top - gap - CH;
              p.drawImage(F, { x: fx, y: fy, width: CW, height: CH }); p.drawImage(B, { x: bx, y: by, width: CW, height: CH });
              for (const [x, y] of [[fx, fy], [bx, by]]) p.drawRectangle({ x, y, width: CW, height: CH, borderColor: PDFLib.rgb(0.6, 0.6, 0.6), borderWidth: 0.3 });
            }
            dl(new Blob([await doc.save()], { type: 'application/pdf' }), 'aadhaar-pvc-print.pdf');
            log('aadhaar-pvc-print.pdf downloaded. Print at 100% / Actual size (not "Fit to page").');
          } catch (err) { log('Could not make the PDF: ' + (err.message || err)); }
          btn.disabled = false;
        };
        return 'PDF opened. Mark the front and back below, then download.';
      } },
    { id: 'docxedit', title: 'Word Editor (.docx)', desc: 'Open a Word file, edit the text here, then download it as .docx or print / save as PDF. Text and basic formatting are kept; complex layouts and headers may change.', files: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', opts: [],
      async run(files, o, log, out) {
        if (!window.mammoth) throw new Error('Word reader did not load. Check your internet connection and refresh.');
        if (!window.htmlDocx) throw new Error('Word export did not load. Check your internet connection and refresh.');
        const name = files[0].name;
        log('Opening ' + name + ' ...');
        let res;
        try { res = await mammoth.convertToHtml({ arrayBuffer: await readBuf(files[0]) }); }
        catch { throw new Error('This file could not be read. Save it again in Word as .docx (old .doc files are not supported).'); }
        const cmds = [['bold', '<b>B</b>', 'Bold'], ['italic', '<i>I</i>', 'Italic'], ['underline', '<u>U</u>', 'Underline'], ['formatBlock:h2', 'H', 'Heading'], ['insertUnorderedList', '&bull; List', 'Bulleted list'], ['insertOrderedList', '1. List', 'Numbered list'], ['undo', 'Undo', 'Undo'], ['redo', 'Redo', 'Redo']];
        out.innerHTML = `<div class="wed">
          <div class="wed-bar">${cmds.map(([c, l, t]) => `<button type="button" class="btn sm" data-cmd="${c}" title="${t}">${l}</button>`).join('')}</div>
          <div class="wed-page" contenteditable="true" spellcheck="true" aria-label="Document text">${res.value || '<p>(empty document)</p>'}</div>
          <div class="wed-actions"><button type="button" class="btn primary" data-act="docx">Download as .docx</button><button type="button" class="btn" data-act="pdf">Print / Save as PDF</button><span class="muted" data-wc></span></div>
        </div>`;
        const page = out.querySelector('.wed-page'), wc = out.querySelector('[data-wc]');
        const count = () => { const w = (page.innerText || '').trim().split(/\s+/).filter(Boolean).length; wc.textContent = w + ' word' + (w === 1 ? '' : 's'); };
        count(); page.addEventListener('input', count);
        out.querySelector('.wed-bar').onclick = e => {
          const b = e.target.closest('[data-cmd]'); if (!b) return;
          page.focus();
          const c = b.dataset.cmd;
          if (c.startsWith('formatBlock:')) document.execCommand('formatBlock', false, c.split(':')[1]);
          else document.execCommand(c, false, null);
        };
        out.querySelector('.wed-actions').onclick = e => {
          const b = e.target.closest('[data-act]'); if (!b) return;
          const body = page.innerHTML;
          if (b.dataset.act === 'docx') {
            const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt}</style></head><body>${body}</body></html>`;
            dl(htmlDocx.asBlob(html), base(name) + '-edited.docx');
          } else {
            const w = window.open('', '_blank');
            if (!w) { alert('Allow pop-ups for this site to print, or download the .docx instead.'); return; }
            w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${base(name)}</title><style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.45;max-width:720px;margin:24px auto;color:#000}img{max-width:100%}</style></head><body>${body}</body></html>`);
            w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
          }
        };
        return 'Document loaded. Edit the text below, then download as .docx.' + (res.messages.length ? ' Some formatting could not be read and was simplified.' : '');
      } },
    { id: 'txt2pdf', title: 'Text to PDF', desc: 'Type or paste text and save it as an A4 PDF. Use English letters, numbers and common symbols.', files: null,
      opts: [
        { k: 'text', label: 'Text', type: 'textarea', value: 'Type or paste your text here.' },
        { k: 'fs', label: 'Font size', type: 'select', options: [['11', '11'], ['12', '12'], ['14', '14']] }
      ],
      async run(files, o) {
        const size = +o.fs, M = 50, W = 595.28, H = 841.89, lh = size * 1.45;
        const doc = await PDFLib.PDFDocument.create(), font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
        const maxW = W - 2 * M, out = [];
        const friendly = 'Only English letters, numbers and common symbols can be used here.';
        try {
          for (const para of o.text.replace(/\r/g, '').split('\n')) {
            if (!para.trim()) { out.push(''); continue; }
            let line = '';
            for (const word of para.split(/\s+/)) {
              const test = line ? line + ' ' + word : word;
              if (font.widthOfTextAtSize(test, size) > maxW && line) { out.push(line); line = word; } else line = test;
            }
            out.push(line);
          }
        } catch { throw new Error(friendly); }
        let page = null, y = 0;
        for (const line of out) {
          if (!page || y < M + lh) { page = doc.addPage([W, H]); y = H - M - size; }
          if (line) { try { page.drawText(line, { x: M, y, size, font }); } catch { throw new Error('Only English letters, numbers and common symbols can be used here.'); } }
          y -= lh;
        }
        if (!page) throw new Error('Enter some text first.');
        dl(new Blob([await doc.save()], { type: 'application/pdf' }), 'text.pdf');
        return `PDF created with ${doc.getPageCount()} page(s).`;
      } },
    { id: 'imgcompress', title: 'Image Compressor', desc: 'Make a JPG smaller for forms and portals, with a maximum file size you choose.', files: 'image/*',
      opts: [
        { k: 'kb', label: 'Maximum size (KB)', type: 'number', value: 200 },
        { k: 'scale', label: 'Size', type: 'select', options: [['1', 'Keep original size'], ['0.75', '75% of original'], ['0.5', '50% of original']] }
      ],
      async run(files, o, log) {
        const kb = +o.kb; if (!kb || kb < 5) throw new Error('Enter a maximum size of at least 5 KB.');
        const i = await loadImg(files[0]), s = +o.scale;
        const c = drawToCanvas(i, Math.round(i.naturalWidth * s), Math.round(i.naturalHeight * s), '#fff');
        let lo = 0.05, hi = 0.95, best = await toBlob(c, 'image/jpeg', lo);
        if (best.size > kb * 1024) throw new Error('Even at the lowest quality this is ' + fmtKB(best.size) + '. Choose a smaller size (50%) or a bigger KB limit.');
        for (let k = 0; k < 9; k++) { const m = (lo + hi) / 2, b = await toBlob(c, 'image/jpeg', m); if (b.size <= kb * 1024) { best = b; lo = m; } else hi = m; }
        dl(best, base(files[0].name) + '-small.jpg');
        return `Saved ${fmtKB(files[0].size)} to ${fmtKB(best.size)} (${c.width} x ${c.height} px).`;
      } }
  ];

  const tabs = $('#toolTabs'), panel = $('#toolPanel');
  function show(t) {
    [...tabs.children].forEach(b => b.classList.toggle('on', b.dataset.id === t.id));
    panel.innerHTML = `<h3>${t.title}</h3><p class="muted">${t.desc}</p><form class="tform"></form><div class="tlog" role="status"></div><div class="tout"></div>`;
    const form = $('.tform', panel), log = $('.tlog', panel), out = $('.tout', panel);
    if (t.files) form.insertAdjacentHTML('beforeend', `<label>${t.multiple ? 'Select files' : 'Select file'}<input type="file" name="f" accept="${t.files}" ${t.multiple ? 'multiple' : ''}></label>`);
    t.opts.forEach(op => {
      const val = op.value ?? '';
      if (op.type === 'file') form.insertAdjacentHTML('beforeend', `<label>${op.label}<input name="${op.k}" type="file" accept="${op.accept || 'image/*'}"></label>`);
      else if (op.type === 'textarea') form.insertAdjacentHTML('beforeend', `<label>${op.label}<textarea name="${op.k}" rows="5">${String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</textarea></label>`);
      else form.insertAdjacentHTML('beforeend', `<label>${op.label}${op.type === 'select' ? `<select name="${op.k}">${op.options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>` : `<input name="${op.k}" type="${op.type}" value="${val}">`}</label>`);
    });
    form.insertAdjacentHTML('beforeend', '<button class="btn primary" type="submit">Convert</button>');
    if (t.id === 'photo') form.preset.onchange = () => { if (form.preset.value) { const [w, h, k] = form.preset.value.split('|'); form.w.value = w; form.h.value = h; form.kb.value = k; } };
    form.onsubmit = async e => {
      e.preventDefault(); log.className = 'tlog'; log.textContent = 'Working...'; out.innerHTML = '';
      const btn = $('button', form); btn.disabled = true;
      try {
        const files = form.f ? [...form.f.files] : []; if (t.files && !files.length) throw new Error('Select a file first.');
        const o = {}; t.opts.forEach(op => o[op.k] = op.type === 'file' ? (form[op.k].files[0] || null) : form[op.k].value);
        const msg = await t.run(files, o, m => log.textContent = m, out); log.textContent = msg || ''; log.classList.add('ok');
      } catch (err) { log.textContent = err.message || String(err); log.classList.add('bad'); }
      btn.disabled = false;
    };
  }
  TOOLS.forEach(t => { const b = document.createElement('button'); b.type = 'button'; b.className = 'tab'; b.dataset.id = t.id; b.textContent = t.title; b.onclick = () => show(t); tabs.appendChild(b); });
  show(TOOLS[0]);
})();
