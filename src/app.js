/* ============================================================
   أداة التدريب — المنطق
   مفيش أيام أسبوع. الجلسات بالترتيب: اللي تخلص أو تتخطّى،
   اللي بعدها تبدأ — وكل جلسة بتتسجّل بتاريخ اليوم اللي اتعملت فيه.
   ============================================================ */

const LS = 'ppl-trainer-v2';
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const AR_MON = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو',
                'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

/* ---------- التخزين ---------- */
let S = load();

function blank() {
  return {
    v: 2, pos: 0, week: 1, cycle: 1, sid: 1, cur: null,
    history: [], body: [], tests: [], ui: {}, profile: {},
    /* معرّف الجهاز — بيخلي كل جلسة ليها مفتاح فريد وقت الدمج بين الأجهزة */
    device: Math.random().toString(36).slice(2, 8),
    updatedAt: 0
  };
}
/* قيمة من «بياناتي» — بترجع '—' لو لسه مسجّلتهاش */
function P(k, unit) {
  const v = (S.profile || {})[k];
  if (v === undefined || v === null || v === '') return '—';
  return unit ? v + ' ' + unit : String(v);
}
function Pn(k) { const v = parseFloat((S.profile || {})[k]); return isFinite(v) ? v : null; }
function load() {
  try {
    const raw = localStorage.getItem(LS);
    if (raw) return Object.assign(blank(), JSON.parse(raw));
  } catch (e) { console.warn(e); }
  return blank();
}
function save() {
  S.updatedAt = Date.now();
  try { localStorage.setItem(LS, JSON.stringify(S)); }
  catch (e) { toast('مساحة التخزين امتلت — صدّر نسخة احتياطية'); }
  if (typeof Sync !== 'undefined' && Sync.user) Sync.push();
}

/* ---------- أدوات ---------- */
function iso(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function parse(s) { const p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function fmt(s) { const d = parse(s); return d.getDate() + ' ' + AR_MON[d.getMonth()]; }
function today() { return iso(new Date()); }
function toast(m) {
  const t = $('#toast'); t.textContent = m; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 1900);
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function L(n) { return `<span class="ltr">${n}</span>`; }
function round25(n) { return Math.round(n * 4) / 4; }
function sessByKey(k) { return SESSIONS.find(s => s.k === k); }

/* ---------- الجلسة الحالية ---------- */
function ensureCur() {
  if (S.cur && S.cur.k === ORDER[S.pos]) return S.cur;
  const sid = S.sid++;
  S.cur = {
    sid: sid, key: (S.device || '?') + '-' + sid, dev: S.device,
    k: ORDER[S.pos], week: S.week, cycle: S.cycle,
    date: today(), ex: {}, warm: {}, note: '', energy: '', cardio: false, cd: {}
  };
  save();
  return S.cur;
}
function advance(status) {
  const c = ensureCur();
  const rec = Object.assign({}, c, { status, date: c.date || today() });
  S.history.push(rec);
  S.pos++;
  if (S.pos >= ORDER.length) {
    S.pos = 0; S.week++;
    if (S.week > 6) { S.week = 1; S.cycle++; }
  }
  S.cur = null;
  openEx = {};
  save();
}
function jumpTo(i) {
  S.pos = i; S.cur = null; openEx = {}; save();
}

/* ---------- محرّك الحجم ---------- */
function setsFor(exId, idx, week) {
  const ex = EX[exId], W = WEEKS[week - 1];
  if (W.extra < 0) return { s: Math.max(2, Math.ceil(ex.s / 2)), plus: 0, cut: true };
  return { s: ex.s + (idx < W.extra ? 1 : 0), plus: idx < W.extra ? 1 : 0 };
}
function sessionPlan(k, week) {
  const D = sessByKey(k), out = [];
  (D.warm || []).forEach(id => out.push({ id, kind: 'warm', sets: EX[id].s, plus: 0 }));
  (D.ex || []).forEach((id, i) => {
    const c = setsFor(id, i, week);
    out.push({ id, kind: 'main', sets: c.s, plus: c.plus, cut: c.cut });
  });
  (D.absEx || []).forEach((id, i) => {
    const c = setsFor(id, i, week);
    out.push({ id, kind: 'abs', sets: c.s, plus: c.plus, cut: c.cut });
  });
  return out;
}

/* ---------- تاريخ التمرين ---------- */
function historyOf(exId) {
  const out = [];
  const scan = r => {
    const e = r.ex && r.ex[exId];
    if (!e || !e.sets) return;
    const done = e.sets.filter(s => s && +s.r > 0);
    if (done.length) out.push({ date: r.date, sid: r.sid, key: r.key, week: r.week, sets: done });
  };
  S.history.forEach(scan);
  if (S.cur) scan(S.cur);
  /* الأحدث الأول — بالتاريخ ثم بالترتيب، عشان السجلات الجاية من جهاز تاني تترتب صح */
  return out.sort((a, b) => a.date === b.date ? (b.sid || 0) - (a.sid || 0) : (a.date < b.date ? 1 : -1));
}

/* ---------- محرّك التدرّج المزدوج ---------- */
function suggest(exId, week) {
  const ex = EX[exId], H = historyOf(exId), W = WEEKS[week - 1];
  const unit = ex.u === 'sec' ? 'ثانية' : ex.u === 'm' ? 'متر' : 'عدة';
  const R = { w: null, reps: ex.lo, msg: '', last: null, icon: '◆' };
  const prev = H.filter(h => !S.cur || h.key !== S.cur.key);

  if (!prev.length) {
    R.msg = ex.bw
      ? `أول مرة: اعمل ${ex.lo}${ex.hi > ex.lo ? '–' + ex.hi : ''} ${unit} نضيفة وسجّلها. لو سهلة، ضيف وزن المرة الجاية.`
      : `أول مرة: اختار وزن يخليك توقف عند ${ex.lo} ${unit} مع ${W.rir} احتياطي — وسجّله.`;
    return R;
  }

  const last = prev[0];
  R.last = last;
  const top = Math.max.apply(null, last.sets.map(s => +s.w || 0));
  const atTop = last.sets.filter(s => (+s.w || 0) === top);
  const maxR = Math.max.apply(null, atTop.map(s => +s.r || 0));
  const allHit = atTop.length >= 2 && atTop.every(s => (+s.r || 0) >= ex.hi);

  if (W.extra < 0) {
    R.w = top; R.reps = ex.lo; R.icon = '↓';
    R.msg = `أسبوع تخفيف: نفس الوزن (${top || 'وزن الجسم'}) بنص المجموعات ووقّف على ${W.rir} عدات احتياطي. متحاولش ترقّم.`;
    return R;
  }

  if (allHit) {
    if (ex.inc > 0 && top > 0) {
      R.w = round25(top + ex.inc); R.reps = ex.lo;
      R.msg = `كمّلت ${ex.hi} في كل المجموعات — زوّد لـ ${R.w} كجم وارجع لـ ${ex.lo} ${unit}.`;
    } else if (ex.u === 'sec') {
      R.w = top; R.reps = ex.hi + 5;
      R.msg = `كمّلت ${ex.hi} ثانية — طوّل لـ ${ex.hi + 5} ثانية${ex.inc ? ` أو ضيف ${ex.inc} كجم` : ''}.`;
    } else if (ex.bw) {
      R.w = top; R.reps = ex.hi + 2;
      R.msg = `كمّلت المدى بوزن الجسم — ${ex.prog || `اطلع لـ ${ex.hi + 2} ${unit} أو ضيف وزن`}.`;
    } else {
      R.w = round25(top + (ex.inc || 2.5)); R.reps = ex.lo;
      R.msg = `كمّلت المدى — زوّد لـ ${R.w} كجم وارجع لـ ${ex.lo} ${unit}.`;
    }
    R.icon = '↑';
  } else {
    R.w = top;
    R.reps = Math.min(ex.hi, maxR + 1);
    if (maxR < ex.lo) {
      R.reps = ex.lo; R.icon = '=';
      R.msg = `آخر مرة وقفت عند ${maxR} — لسه تحت المدى. ثبّت ${top ? top + ' كجم' : 'الوزن'} لحد ما توصل ${ex.lo} ${unit} في كل المجموعات.`;
    } else {
      R.icon = '＋';
      R.msg = `نفس الوزن ${top ? top + ' كجم' : ''} — الهدف ${R.reps} ${unit} في كل المجموعات.`;
    }
  }
  return R;
}

function setLine(ex, sets) {
  const u = ex.u === 'sec' ? 'ث' : ex.u === 'm' ? 'م' : '';
  return sets.map(s => (+s.w ? s.w + '×' : '') + s.r + u).join(' · ');
}
function lastLine(exId) {
  const H = historyOf(exId).filter(h => !S.cur || h.key !== S.cur.key);
  if (!H.length) return '';
  return `آخر مرة (${fmt(H[0].date)}): ` + setLine(EX[exId], H[0].sets);
}

/* ---------- كتابة السجل ---------- */
function entry(exId, n) {
  const c = ensureCur();
  if (!c.ex[exId]) c.ex[exId] = { sets: [] };
  while (c.ex[exId].sets.length <= n) c.ex[exId].sets.push({ w: '', r: '', rir: '', d: false });
  return c.ex[exId];
}

/* ---------- الحالة الحيّة ---------- */
let view = 'today';
let openEx = {};
let viewSid = null;   /* لو بنعرض جلسة قديمة من السجل */

/* ============================================================
   الرسم
   ============================================================ */
let lastView = null;
function render(top) {
  ensureCur();
  $('#wkchip').innerHTML = `أسبوع ${L(S.week)}` + (S.cycle > 1 ? ` · ميزو ${L(S.cycle)}` : '');
  $$('.nav button').forEach(b => b.classList.toggle('on', b.dataset.v === view));
  $('#app').innerHTML =
    view === 'today' ? viewToday() :
    view === 'plan'  ? viewPlan()  :
    view === 'prog'  ? viewProg()  : viewRef();
  wire();
  /* الرجوع لأول الصفحة بس لما الشاشة تتغيّر — غير كده بنفضل مكاننا */
  if (top || view !== lastView) window.scrollTo(0, 0);
  lastView = view;
}

/* إعادة رسم بتثبّت عنصر معيّن في نفس مكانه على الشاشة،
   عشان فتح تمرين وقفل اللي قبله ميحركش الصفحة تحت إيدك */
function renderAt(sel) {
  const el = document.querySelector(sel);
  const before = el ? el.getBoundingClientRect().top : null;
  render();
  if (before == null) return;
  const el2 = document.querySelector(sel);
  if (el2) window.scrollBy(0, el2.getBoundingClientRect().top - before);
}

/* ---------- عرض الجلسة الحالية ---------- */
function viewToday() {
  const c = ensureCur(), D = sessByKey(c.k), wk = S.week;
  let h = '';

  h += `<div class="card">
    <div class="dayhead">
      <div class="dnav">
        <span class="stepchip">جلسة ${L((S.pos + 1) + ' / ' + ORDER.length)}</span>
        <span class="dl" style="margin-inline-start:auto">التاريخ</span>
        <input type="date" class="datepick" value="${c.date}" id="sdate">
      </div>
      <h2>${esc(D.title)}<span class="tg">${esc(D.tag)}</span></h2>
      <p>${esc(D.sub)}</p>
      <div class="chips">
        <span class="chip g">المدة ${L(D.dur)} دقيقة</span>
        ${D.absEx ? `<span class="chip">بطن ${L(D.absEx.length)} تمارين</span>` : ''}
        ${D.cardio ? `<span class="chip">إرجومتر ${L(D.cardio.min)} د</span>` : ''}
      </div>
      <div class="steps">${ORDER.map((k, i) =>
        `<span class="step ${i === S.pos ? 'on' : ''} ${i < S.pos ? 'past' : ''}" title="${esc(sessByKey(k).title)}"></span>`).join('')}</div>
    </div>
    ${wkBar(wk)}
    ${D.type === 'recov' ? '' : progRow(D, wk)}
  </div>`;

  (D.notes || []).forEach((n, i) => h += `<div class="note ${i ? 'g' : ''}">${esc(n)}</div>`);

  if (D.type === 'recov') return h + viewRecov(D, wk) + finishCard(D);

  const plan = sessionPlan(D.k, wk);

  /* ١ — التسخين */
  h += `<div class="sect"><h2>١ · التسخين</h2></div><div class="card">`;
  WARM_GENERAL.concat(WARM_EXTRA[D.type] || []).forEach((w, i) => {
    const on = c.warm['g' + i];
    h += `<button class="warm ${on ? 'on' : ''}" data-warm="g${i}">
      <span class="ck ${on ? 'on' : ''}">✓</span>
      <span class="wt"><b>${esc(w[0])}</b><span>${esc(w[1])}</span></span></button>`;
  });
  const warmEx = plan.filter(p => p.kind === 'warm');
  warmEx.forEach((p, i) => h += exCard(p, i + 1, wk));
  h += `</div>`;
  if (!warmEx.length) h += `<div class="note b">التسخين هنا عام — الخطة مذكور فيها تمرين تسخين بالاسم في جلسات الـ Push بس (الدوران الخارجي).</div>`;

  /* ٢ — التمارين */
  h += `<div class="sect"><h2>٢ · التمارين</h2></div><div class="card">`;
  plan.filter(p => p.kind === 'main').forEach((p, i) => h += exCard(p, i + 1, wk));
  h += `</div>`;

  /* ٣ — البطن */
  if (D.absEx) {
    h += `<div class="sect"><h2>٣ · ${esc(D.absTitle)}</h2></div><div class="card">`;
    plan.filter(p => p.kind === 'abs').forEach((p, i) => h += exCard(p, i + 1, wk));
    h += `</div>`;
  }

  /* ٤ — الكارديو */
  if (D.cardio) {
    h += `<div class="sect"><h2>${D.absEx ? '٤' : '٣'} · الكارديو</h2></div>
    <div class="card card-p">
      <div class="f" style="justify-content:space-between;gap:10px">
        <div style="min-width:0"><b>${esc(D.cardio.t)}</b><div class="sub">${esc(D.cardio.d)}</div></div>
        <button class="btn ${c.cardio ? 'g' : ''}" data-cardio="1" style="flex:none">${c.cardio ? '✓ اتعملت' : 'سجّل'}</button>
      </div>
      ${D.cardio.opt ? '<div class="note" style="margin:10px 0 0">دي اختيارية — لو الطاقة قليلة عدّيها من غير ذنب.</div>' : ''}
    </div>`;
  }

  return h + finishCard(D);
}

function finishCard(D) {
  const c = ensureCur();
  const n = D.absEx ? '٥' : D.cardio ? '٤' : D.type === 'recov' ? '٢' : '٣';
  return `<div class="sect"><h2>${n} · إقفال الجلسة</h2></div>
  <div class="card card-p">
    <div class="f" style="margin-bottom:9px">
      <label style="width:64px">الطاقة</label>
      <input class="inp" type="number" min="1" max="10" inputmode="numeric" placeholder="من ١٠" value="${esc(c.energy || '')}" data-ses="energy">
    </div>
    <textarea class="inp" placeholder="ملاحظات — أي وجع، أي تمرين حسّيته غريب، أي حاجة تفتكرها المرة الجاية" data-ses="note">${esc(c.note || '')}</textarea>
    <div class="exacts" style="margin-top:10px">
      <button class="btn g" data-fin="done">خلّصت — الجلسة اللي بعدها</button>
      <button class="btn" data-fin="skip">تخطّي الجلسة</button>
      <button class="btn" data-cpy="1">نسخ الملخّص</button>
    </div>
    <div class="sub" style="margin-top:9px">هتتسجّل بتاريخ ${L(fmt(c.date))} ثم تبدأ: <b>${esc(sessByKey(ORDER[(S.pos + 1) % ORDER.length]).title)}</b>${S.pos + 1 >= ORDER.length ? ` — وبداية أسبوع ${L(S.week + 1 > 6 ? 1 : S.week + 1)}` : ''}</div>
  </div>`;
}

function wkBar(w) {
  const W = WEEKS[w - 1];
  return `<div class="wkbar ${W.tone === 'deload' ? 'deload' : W.tone === 'peak' ? 'peak' : ''}">
    <div class="n">${w}</div>
    <div class="t"><b>${esc(W.desc)}</b><span>الحجم: ${esc(W.vol)}</span></div>
    <div class="r"><b>${esc(W.rir)}</b><span>احتياطي</span></div>
  </div>`;
}

function progRow(D, wk) {
  const c = ensureCur(), plan = sessionPlan(D.k, wk);
  let tot = 0, done = 0;
  plan.forEach(p => {
    tot += p.sets;
    const e = c.ex[p.id];
    if (e) done += e.sets.filter(s => s && s.d).length;
  });
  const pc = tot ? Math.round(done / tot * 100) : 0;
  return `<div class="prow"><span>${L(done + ' / ' + tot)} مجموعة</span>
    <div class="pbar"><i style="width:${pc}%"></i></div>
    <b style="color:${pc === 100 ? 'var(--ok)' : 'var(--mut)'}">${L(pc + '%')}</b></div>`;
}

/* ---------- كارت التمرين ---------- */
function exCard(p, num, wk) {
  const ex = EX[p.id], c = ensureCur(), e = c.ex[p.id];
  const doneN = e ? e.sets.filter(s => s && s.d).length : 0;
  const isDone = doneN >= p.sets;
  const open = openEx[p.id];
  const img = IMG[ex.im[0]][ex.im[1]];
  const rng = ex.lo === ex.hi ? ex.lo : ex.lo + '–' + ex.hi;
  const u = ex.u === 'sec' ? ' ثانية' : ex.u === 'm' ? ' متر' : '';
  const each = ex.each ? ' لكل ناحية' : '';

  let h = `<div class="ex ${open ? 'open' : ''} ${isDone ? 'done' : ''}">
    <button class="exhead" data-tog="${p.id}">
      <span class="num ${ex.warm ? 'w' : ''}">${isDone ? '✓' : num}</span>
      <span class="exmeta">
        <h3>${esc(ex.n)}</h3>
        <div class="tgt">${L(p.sets + ' × ' + rng)}${u}${each}
          ${p.plus ? '<span class="plus">+١ مجموعة</span>' : ''}
          ${p.cut ? '<span class="plus" style="background:#fdf3e0;color:var(--warn)">تخفيف</span>' : ''}
          ${doneN ? `<span class="tag">${L(doneN)} اتسجّلت</span>` : ''}
        </div>
        <div class="mus">${(ex.m || []).map(m => `<span style="color:${MUSCLES[m].c}">${MUSCLES[m].ar}</span>`).join('')}</div>
      </span>
      <span class="thumbs"><img src="${img[0]}" alt="البداية" loading="lazy"><img src="${img[1]}" alt="النهاية" loading="lazy"></span>
      <span class="caret">▾</span>
    </button>
    <div class="exbody">${open ? exBody(p, wk) : ''}</div>
  </div>`;
  return h;
}

function exBody(p, wk) {
  const ex = EX[p.id], img = IMG[ex.im[0]][ex.im[1]];
  const sg = suggest(p.id, wk), c = ensureCur();
  const e = c.ex[p.id] || { sets: [] };
  const u = ex.u === 'sec' ? 'ثواني' : ex.u === 'm' ? 'متر' : 'عدات';

  let h = `<div class="frames">
    <div class="frame"><b>١ — البداية</b><img src="${img[0]}" alt="وضع البداية"></div>
    <div class="frame"><b>٢ — النهاية</b><img src="${img[1]}" alt="وضع النهاية"></div>
  </div>`;
  h += `<ul class="cues">${ex.cue.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
  if (ex.tip) h += `<div class="note g">${esc(ex.tip)}</div>`;
  if (ex.prog) h += `<div class="note b"><b>التدرّج:</b> ${esc(ex.prog)}</div>`;
  h += `<div class="rec"><i>${sg.icon}</i><span>${esc(sg.msg)}${sg.last ? `<br><span style="font-weight:600;opacity:.75">${esc(lastLine(p.id))}</span>` : ''}</span></div>`;

  const showW = !(ex.bw && !ex.inc);
  h += `<table class="sets"><thead><tr>
      <th></th>${showW ? '<th>وزن (كجم)</th>' : ''}<th>${u}</th><th>احتياطي</th><th></th>
    </tr></thead><tbody>`;
  for (let i = 0; i < p.sets; i++) {
    const s = e.sets[i] || {};
    h += `<tr class="${s.d ? 'ok' : ''}">
      <td class="sn">${i + 1}</td>
      ${showW ? `<td><input type="number" inputmode="decimal" step="0.5" value="${s.w != null ? esc(s.w) : ''}" placeholder="${sg.w != null ? sg.w : ''}" data-in="w" data-i="${i}" data-id="${p.id}"></td>` : ''}
      <td><input type="number" inputmode="numeric" value="${s.r != null ? esc(s.r) : ''}" placeholder="${sg.reps}" data-in="r" data-i="${i}" data-id="${p.id}"></td>
      <td><input type="number" inputmode="numeric" value="${s.rir != null ? esc(s.rir) : ''}" placeholder="${WEEKS[wk - 1].rirLo}" data-in="rir" data-i="${i}" data-id="${p.id}"></td>
      <td><button class="ck ${s.d ? 'on' : ''}" data-ck="${i}" data-id="${p.id}">✓</button></td>
    </tr>`;
  }
  h += `</tbody></table>
  <div class="exacts">
    ${sg.w != null ? `<button class="btn sm" data-fill="${p.id}">املأ الاقتراح</button>` : ''}
    <button class="btn sm" data-rest="${ex.r}" data-name="${esc(ex.n)}">راحة ${ex.r >= 60 ? String(ex.r / 60).replace(/\.5$/, '.٥') + ' د' : ex.r + ' ث'}</button>
    <button class="btn sm" data-hist="${p.id}">السجل</button>
  </div>`;
  return h;
}

/* ---------- جلسة الاستشفاء ---------- */
function viewRecov(D, wk) {
  const c = ensureCur();
  let h = '';

  if (D.intervals) {
    const I = INTERVALS[wk - 1];
    h += `<div class="sect"><h2>١ · جلسة الفترات — أسبوع ${L(wk)}</h2></div>
    <div class="card card-p">
      <div style="font-size:25px;font-weight:800;color:var(--navy)">${esc(I.p)}</div>
      <div class="sub" style="font-size:13px">راحة ${esc(I.rest)} · ${esc(I.int)}</div>
      <div class="note b" style="margin-top:10px">تسخين ١٠ دقايق UT2 قبلها · تهدئة ٥ دقايق بعدها.</div>
      <div class="grid2" style="margin-top:10px">
        <div><label class="lb">متوسط ٥٠٠م</label><input class="inp" placeholder="1:52.3" value="${esc(c.cd.split || '')}" data-cd="split"></div>
        <div><label class="lb">إجمالي الوقت</label><input class="inp" placeholder="24:10" value="${esc(c.cd.time || '')}" data-cd="time"></div>
      </div>
      <button class="btn ${c.cardio ? 'g' : 'p'}" style="width:100%;margin-top:10px" data-cardio="1">${c.cardio ? '✓ الفترات اتعملت' : 'خلّصت الفترات'}</button>
      ${wk === 5 ? '<div class="note" style="margin-top:10px">أسبوع ٥ = اختبار ٢٠٠٠ متر. سجّله في صفحة التقدّم عشان يتقارن باللي قبله.</div>' : ''}
    </div>`;
  } else {
    h += `<div class="sect"><h2>١ · إرجومتر هادي</h2></div>
    <div class="card card-p">
      <div style="font-size:25px;font-weight:800;color:var(--navy)">${L(25)}–${L(35)} دقيقة UT2</div>
      <div class="sub" style="font-size:13px">١٨–٢٢ ضربة/دقيقة · تقدر تتكلم طول الوقت · صفر شدّة</div>
      <div class="note g" style="margin-top:10px">الجلسة دي للاستشفاء مش للتحسين. لو حسيت إنك بتلهث، هدّي.</div>
      <div class="grid2" style="margin-top:10px">
        <div><label class="lb">الدقايق</label><input class="inp" type="number" inputmode="numeric" placeholder="30" value="${esc(c.cd.time || '')}" data-cd="time"></div>
        <div><label class="lb">متوسط ٥٠٠م</label><input class="inp" placeholder="2:20" value="${esc(c.cd.split || '')}" data-cd="split"></div>
      </div>
      <button class="btn ${c.cardio ? 'g' : 'p'}" style="width:100%;margin-top:10px" data-cardio="1">${c.cardio ? '✓ اتعملت' : 'خلّصت'}</button>
    </div>`;
  }

  h += `<div class="sect"><h2>إعدادات الإرجومتر</h2></div><div class="card"><table class="tbl">
    ${ERG_SETTINGS.map(r => `<tr><td style="width:38%;font-weight:700">${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}
  </table></div>`;

  h += `<div class="sect"><h2>السونا والاستشفاء</h2></div><div class="card card-p">
    <ul class="cues">${SAUNA.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
    <div class="note g">اللي فعلًا بيسرّع الاستشفاء بالترتيب: النوم ٧–٨ ساعات · البروتين الكافي · المشي الخفيف · إدارة الضغط.</div>
  </div>`;

  h += `<div class="sect"><h2>كل الفترات على ٦ أسابيع</h2></div><div class="card scroll"><table class="tbl">
    <tr><th>الأسبوع</th><th>البروتوكول</th><th>الراحة</th><th>الشدة</th></tr>
    ${INTERVALS.map(r => `<tr class="${r.w === wk ? 'hi' : ''}"><td>${r.w}</td><td>${esc(r.p)}</td><td>${esc(r.rest)}</td><td>${esc(r.int)}</td></tr>`).join('')}
  </table></div>`;
  return h;
}

/* ---------- عرض الخطة ---------- */
function viewPlan() {
  let h = `<div class="sect"><h2>ترتيب الجلسات</h2></div>
  <div class="note b">مفيش ارتباط بأيام الأسبوع. خلّص الجلسة أو تخطّاها، واللي بعدها تبقى هي الحالية — والتاريخ بيتسجّل يوم ما تعملها.</div>
  <div class="card">`;
  ORDER.forEach((k, i) => {
    const D = sessByKey(k);
    const n = (D.warm || []).length + (D.ex || []).length + (D.absEx || []).length;
    const st = i === S.pos ? 'on' : i < S.pos ? 'past' : '';
    h += `<button class="exhead" data-jump="${i}" style="border-bottom:1px solid var(--line)">
      <span class="num" style="background:${i === S.pos ? 'var(--navy)' : D.type === 'recov' ? '#fdf3e0' : 'var(--bg)'};color:${i === S.pos ? '#fff' : D.type === 'recov' ? 'var(--warn)' : 'var(--navy)'}">${i + 1}</span>
      <span class="exmeta">
        <h3>${esc(D.title)} ${i === S.pos ? '<span class="tag" style="background:var(--navy);color:#fff">دلوقتي</span>' : ''}</h3>
        <div class="sub">${n ? L(n) + ' تمرين · ' : ''}${L(D.dur)} دقيقة${D.absEx ? ' · بطن ' + L(D.absEx.length) : ''}${D.cardio ? ' · إرجومتر ' + L(D.cardio.min) + ' د' : ''}</div>
      </span>
      <span class="tag">${esc(D.tag)}</span>
    </button>`;
  });
  h += `</div>`;

  h += `<div class="sect"><h2>التدرّج على ٦ أسابيع</h2></div><div class="card scroll"><table class="tbl">
    <tr><th>الأسبوع</th><th>الحجم</th><th>الاحتياطي</th><th>الوصف</th></tr>
    ${WEEKS.map(w => `<tr class="${w.w === S.week ? 'hi' : ''}"><td>${w.w}</td><td>${esc(w.vol)}</td><td>${esc(w.rir)}</td><td>${esc(w.desc)}</td></tr>`).join('')}
  </table>
  <div class="card-p" style="padding-top:10px"><div class="sub">الأسبوع بيتقدّم لوحده لما تخلص الـ${L(ORDER.length)} جلسات كلها. دلوقتي: أسبوع ${L(S.week)} · جلسة ${L(S.pos + 1)}.</div></div></div>`;

  h += `<div class="sect"><h2>الحجم الأسبوعي المستهدف</h2></div><div class="card scroll"><table class="tbl">
    <tr><th>العضلة</th><th>أسبوع ١–٢</th><th>٣–٤</th><th>٥</th></tr>
    ${Object.keys(VOLUME_TARGET).map(k => {
      const v = VOLUME_TARGET[k];
      return `<tr><td style="font-weight:700">${MUSCLES[k].ar}</td><td>${v[0]}</td><td>${v[2]}</td><td>${v[4]}</td></tr>`;
    }).join('')}
  </table></div>`;

  h += `<div class="sect"><h2>القواعد التلاتة</h2></div><div class="card card-p"><ul class="cues">
    <li>جلسة الظهر مفيهاش تجديف — الإرجومتر بيشتغل على نفس العضلات ونفس القبضة.</li>
    <li>جلسة الرجل مفيهاش تجديف خالص — ده أهم فصل في الخطة.</li>
    <li>جلسة الفترات مستقلة بعد يوم الرجل عشان تديها حقها.</li>
  </ul></div>`;
  return h;
}

/* ---------- عرض التقدّم ---------- */
function viewProg() {
  let h = '';

  /* حجم الأسبوع الحالي */
  const vol = {};
  const inWeek = r => r.week === S.week && r.cycle === S.cycle;
  const scan = r => {
    if (!inWeek(r)) return;
    Object.keys(r.ex || {}).forEach(id => {
      const ex = EX[id]; if (!ex) return;
      const n = r.ex[id].sets.filter(s => s && (s.d || +s.r > 0)).length;
      if (n) vol[ex.m[0]] = (vol[ex.m[0]] || 0) + n;
    });
  };
  S.history.forEach(scan); if (S.cur) scan(S.cur);

  h += `<div class="sect"><h2>حجم أسبوع ${L(S.week)} — المسجَّل</h2></div><div class="card card-p">`;
  Object.keys(VOLUME_TARGET).forEach(k => {
    const got = vol[k] || 0, tgt = VOLUME_TARGET[k][S.week - 1];
    const pc = Math.min(100, Math.round(got / tgt * 100));
    h += `<div class="vol"><span class="lbl">${MUSCLES[k].ar}</span>
      <span class="track"><span class="fill" style="width:${pc}%;background:${got >= tgt ? 'var(--ok)' : MUSCLES[k].c}"></span></span>
      <span class="val">${L(got + ' / ' + tgt)}</span></div>`;
  });
  const other = Object.keys(vol).filter(k => !VOLUME_TARGET[k]);
  if (other.length) h += `<div class="sub" style="margin-top:8px">كمان: ${other.map(k => MUSCLES[k].ar + ' ' + vol[k]).join(' · ')}</div>`;
  h += `<div class="note" style="margin-top:10px">العدّ بيحسب مجموعة كاملة للعضلة الأساسية في كل تمرين. مجموع جداول الجلسات في الملف أعلى من جدول الحجم المستهدف — اعتبر الرقم المستهدف حدًّا أدنى للمجموعات الجادّة.</div></div>`;

  /* الوزن والوسط */
  h += `<div class="sect"><h2>الوزن ومحيط الوسط</h2></div><div class="card card-p">
    <div class="grid3">
      <div><label class="lb">التاريخ</label><input class="inp" type="date" value="${today()}" id="bd"></div>
      <div><label class="lb">الوزن</label><input class="inp" type="number" step="0.1" inputmode="decimal" placeholder="كجم" id="bw"></div>
      <div><label class="lb">الوسط (سم)</label><input class="inp" type="number" step="0.5" inputmode="decimal" placeholder="سم" id="bwa"></div>
    </div>
    <button class="btn p" style="margin-top:9px;width:100%" data-addbody="1">سجّل</button>`;
  if (S.body.length) {
    const B = S.body.slice().sort((a, b) => a.d < b.d ? -1 : 1);
    h += spark(B.map(x => +x.w).filter(Boolean), 'الوزن');
    const f = B[0], l = B[B.length - 1], dw = (l.w - f.w).toFixed(1);
    h += `<div class="f" style="justify-content:space-between;margin-top:6px;font-size:12.5px">
      <span class="sub">${fmt(f.d)} ← ${fmt(l.d)}</span>
      <b style="color:${dw <= 0 ? 'var(--ok)' : 'var(--red)'}">${L((dw > 0 ? '+' : '') + dw)} كجم</b></div>
      <div class="note g" style="margin-top:8px">${P('weightT') !== '—' ? `الهدف: ${esc(P('weightT', 'كجم'))}${P('bfT') !== '—' ? ' ونسبة دهون ' + esc(P('bfT', '٪')) : ''} — ` : ''}نزول ٠.٣ كجم في الأسبوع. محيط الوسط أدق من الميزان في إعادة التكوين.</div>
      <div style="max-height:190px;overflow:auto;margin-top:8px">` +
      B.slice().reverse().map(x => `<div class="hist"><span class="d">${fmt(x.d)}</span>
        <span class="s">${x.w ? L(x.w) + ' كجم' : ''}${x.waist ? ' · وسط ' + L(x.waist) + ' سم' : ''}</span>
        <button class="btn sm d" data-delbody="${x.d}">حذف</button></div>`).join('') + `</div>`;
  }
  h += `</div>`;

  /* تقدّم التمارين */
  const ids = Object.keys(EX).filter(id => historyOf(id).length);
  h += `<div class="sect"><h2>تقدّم التمارين</h2></div>`;
  if (!ids.length) h += `<div class="card empty">لسه مفيش تمارين مسجّلة. ابدأ سجّل من صفحة الجلسة وهتلاقي الأرقام هنا.</div>`;
  else {
    const sel = ids.includes(S.ui.progEx) ? S.ui.progEx : ids[0];
    h += `<div class="card card-p"><select class="inp" id="progsel">${
      ids.map(id => `<option value="${id}" ${id === sel ? 'selected' : ''}>${esc(EX[id].n)}</option>`).join('')}</select>`;
    const H = historyOf(sel).slice().reverse();
    h += spark(H.map(x => Math.max.apply(null, x.sets.map(s => +s.w || +s.r || 0))), 'أعلى وزن');
    h += `<div style="max-height:230px;overflow:auto;margin-top:8px">` + H.slice().reverse().map(x =>
      `<div class="hist"><span class="d">${fmt(x.date)}</span><span class="s">${L(setLine(EX[sel], x.sets))}</span></div>`).join('') + `</div></div>`;
  }

  /* اختبار ٢٠٠٠م */
  h += `<div class="sect"><h2>اختبار ٢٠٠٠ متر</h2></div><div class="card card-p">
    <div class="grid3">
      <input class="inp" type="date" id="td" value="${today()}">
      <input class="inp" id="tt" placeholder="الوقت 7:24">
      <input class="inp" id="ts" placeholder="متوسط 500م">
    </div>
    <button class="btn p" style="margin-top:9px;width:100%" data-addtest="1">سجّل الاختبار</button>
    ${S.tests.slice().sort((a, b) => a.d < b.d ? 1 : -1).map(t =>
      `<div class="hist"><span class="d">${fmt(t.d)}</span><span class="s">${L(esc(t.time || ''))}${t.split ? ' · ' + L(esc(t.split)) : ''}</span>
       <button class="btn sm d" data-deltest="${t.d}">حذف</button></div>`).join('')}
  </div>`;

  /* سجل الجلسات */
  h += `<div class="sect"><h2>سجل الجلسات</h2></div><div class="card">`;
  if (!S.history.length) h += `<div class="empty">مفيش جلسات متقفولة لحد دلوقتي.</div>`;
  else h += S.history.slice().reverse().slice(0, 50).map(r => {
    const D = sessByKey(r.k); if (!D) return '';
    let sets = 0, tonn = 0;
    Object.values(r.ex || {}).forEach(e => e.sets.forEach(s => {
      if (s && (s.d || +s.r > 0)) { sets++; tonn += (+s.w || 0) * (+s.r || 0); }
    }));
    return `<div class="hist">
      <span class="d">${fmt(r.date)}</span>
      <span class="s"><b style="color:var(--ink)">${esc(D.title)}</b> · أسبوع ${L(r.week)}${sets ? ' · ' + L(sets) + ' مجموعة' : ''}${tonn ? ' · ' + L(Math.round(tonn).toLocaleString('en')) + ' كجم' : ''}</span>
      <span class="tag" style="${r.status === 'skip' ? 'background:#fdecea;color:var(--red)' : 'background:#e8f5ec;color:var(--ok)'}">${r.status === 'skip' ? 'اتخطّت' : 'خلصت'}</span>
    </div>`;
  }).join('');
  h += `</div>`;
  return h;
}

function spark(vals, label) {
  vals = (vals || []).filter(v => isFinite(v));
  if (vals.length < 2) return '';
  const w = 300, hh = 52, p = 4;
  const mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), rg = (mx - mn) || 1;
  const pts = vals.map((v, i) => {
    const x = p + i * (w - p * 2) / (vals.length - 1);
    const y = hh - p - ((v - mn) / rg) * (hh - p * 2);
    return x.toFixed(1) + ',' + y.toFixed(1);
  });
  return `<svg class="spark" viewBox="0 0 ${w} ${hh}" preserveAspectRatio="none" style="margin-top:10px" aria-label="${esc(label)}">
    <polyline points="${pts.join(' ')}" fill="none" stroke="#2c4d8a" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map(pt => `<circle cx="${pt.split(',')[0]}" cy="${pt.split(',')[1]}" r="2.5" fill="#1f3864"/>`).join('')}
  </svg>
  <div class="f" style="justify-content:space-between;font-size:11px;color:var(--mut)"><span>${L(mn)}</span><span>${esc(label)}</span><span>${L(mx)}</span></div>`;
}

/* ---------- المرجع ---------- */
function acc(title, body, id) {
  return `<div class="acc ${S.ui['a' + id] ? 'open' : ''}"><button data-acc="${id}">${esc(title)}<span class="caret">▾</span></button><div class="accb">${body}</div></div>`;
}
function tbl(head, rows) {
  return `<div class="scroll"><table class="tbl">${head ? `<tr>${head.map(x => `<th>${esc(x)}</th>`).join('')}</tr>` : ''}
    ${rows.map(r => `<tr>${r.map((c, i) => `<td${i === 0 ? ' style="font-weight:700"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</table></div>`;
}
function ul(items) { return `<ul class="cues">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`; }

/* كام كيلو دهون فاضلين لحد ما البطن تبان — محسوبة من وزنك ونسبتك */
function bfNote() {
  const w = Pn('weight'), bf = Pn('bf');
  if (w == null || bf == null || bf <= 0 || bf >= 60) return REF.bodyfat.note;
  if (bf <= 13) return 'نسبتك عند حد الظهور أو تحته — الشغل دلوقتي على السُمك مش على التنشيف.';
  const lean = w * (1 - bf / 100);
  const target = lean / (1 - 0.13);
  const diff = w - target;
  return `إنت على بُعد ${diff.toFixed(1)}–${(diff + 1).toFixed(1)} كجم دهون من إن البطن تبدأ تبان (عند ١٣٪ تقريبًا). ده رقم واقعي في ١٠–١٤ أسبوع.`;
}

function viewRef() {
  let h = `<div class="sect"><h2>المرجع</h2></div><div class="card">`;
  h += acc('التسخين — البروتوكول', tbl(['الخطوة', 'التفصيل'], WARM_GENERAL) +
    `<div style="margin-top:10px"></div>` +
    `<b style="font-size:13px">زيادة حسب نوع الجلسة</b>` +
    ['push', 'pull', 'legs'].map(t => `<div style="margin-top:8px"><span class="tag">${t === 'push' ? 'Push' : t === 'pull' ? 'Pull' : 'Legs'}</span>` +
      tbl(null, WARM_EXTRA[t]) + `</div>`).join('') +
    `<div class="note" style="margin-top:10px">الخطة نفسها مذكور فيها تمرين تسخين واحد بالاسم: الدوران الخارجي في جلسات الـ Push. الباقي بروتوكول قياسي مضاف.</div>`, 0);
  h += acc('التدرّج المزدوج — إزاي تزوّد', tbl(['الخطوة', 'المثال'], REF.dblProg) +
    `<div style="margin-top:10px"></div>` + tbl(['نوع التمرين', 'مقدار الزيادة'], INC_RULES) +
    `<div class="note" style="margin-top:10px">قاعدة: متزوّدش الحجم والوزن في نفس الأسبوع. واحدة بس في كل مرة، عشان لما حاجة تحصل تعرف سببها.</div>`, 1);
  /* جدول نسبة الدهون — بيعلّم على النطاق بتاعك لو مسجّل نسبتك */
  const bf = Pn('bf');
  const bfTbl = `<div class="scroll"><table class="tbl">
    <tr><th>نسبة الدهون</th><th>شكل البطن</th></tr>
    ${REF.bodyfat.rows.map(r => {
      const on = bf != null && bf >= r[2] && bf < r[3];
      return `<tr class="${on ? 'hi' : ''}"><td style="font-weight:700">${esc(r[0])}${on ? ' <span class="tag">إنت هنا</span>' : ''}</td><td>${esc(r[1])}</td></tr>`;
    }).join('')}</table></div>`;
  h += acc('نسبة الدهون وشكل البطن', bfTbl +
    `<div class="note g" style="margin-top:10px">${esc(bfNote())}</div><div style="margin-top:10px"></div>` +
    tbl(['القاعدة', 'التفصيل'], REF.absRules) + `<div style="margin-top:10px"></div>` +
    tbl(['التمرين', 'ابدأ بـ', 'زوّد لما توصل', 'الزيادة'], REF.absProg), 2);

  const goalTbl = tbl(['البند', 'دلوقتي', 'الهدف'],
    REF.nutritionGoal.map(r => [r[0], P(r[1], r[3]), P(r[2], r[3])]).concat([['المدة', '—', '١٠–١٤ أسبوع']]));
  const dailyTbl = tbl(['العنصر', 'دلوقتي', 'الهدف', 'ملاحظة'],
    REF.nutritionDaily.map(r => [r[0], P(r[1], r[3]), P(r[2], r[3]), r[4]]));
  h += acc('التغذية ونسبة الدهون', goalTbl + `<div style="margin-top:10px"></div>` + dailyTbl +
    `<div class="note g" style="margin-top:10px">٠.٣ كجم في الأسبوع بطيء عن قصد. النزول السريع بياخد عضل معاه.</div>` +
    `<div class="note b">الأرقام دي بتتقرا من «بياناتي» تحت — متخزّنة على جهازك بس ومش جزء من الأداة نفسها.</div>`, 3);
  h += acc('الكارديو — نقطة صريحة', ul(REF.cardio) +
    `<div class="note b">مش مطلوب تزوّد شدّة الكارديو ولا تقلل من قوة التمرينة. المطلوب تحافظ على الجلسات الهادية ومتشطبهاش لما تكون مستعجل.</div>`, 4);
  h += acc('علامات إن الحجم مناسب', ul(REF.volOk), 5);
  h += acc('علامات إن الحجم زيادة', ul(REF.volHigh) +
    `<div class="note">التصرف: قدّم أسبوع التخفيف، أو ارجع لعدد المجموعات الأقل. الحجم وسيلة مش هدف.</div>`, 6);
  h += acc('ملاحظات الكتف', tbl(['الحالة', 'التصرف'], REF.shoulder), 7);
  h += acc('التنفس', ul(REF.breathing), 8);
  h += acc('جدول القياس', tbl(['القياس', 'كل قد إيه', 'الطريقة'], REF.measure), 9);
  h += acc('مراجعة التكامل', `<p style="font-size:13.5px;margin:0 0 10px">${esc(REF.coverage)}</p>` +
    `<div class="note g">الخلاصة: الخطة مغطية الجسم بالكامل من غير فجوات.</div>`, 10);
  h += `</div>`;

  /* المزامنة */
  if (typeof Sync !== 'undefined' && Sync.available()) {
    const u = Sync.user, st = Sync.status;
    h += `<div class="sect"><h2>المزامنة</h2></div><div class="card card-p">`;
    if (u) {
      h += `<div class="f" style="justify-content:space-between;gap:10px">
        <div style="min-width:0">
          <b style="display:block">${esc(u.email || 'مسجّل دخول')}</b>
          <span class="sub"><span class="syncdot ${st.state}" id="syncbadge"></span> ${esc(st.msg)}</span>
        </div>
        <button class="btn" data-syncnow="1" style="flex:none">زامن دلوقتي</button>
      </div>
      <div class="exacts" style="margin-top:10px">
        <button class="btn d" data-signout="1">تسجيل خروج</button>
      </div>
      <div class="sub" style="margin-top:9px">سجلاتك بتترفع لحسابك أول ما يبقى في نت. افتح الأداة على أي جهاز وسجّل بنفس الحساب وهتلاقي كل حاجة.</div>`;
    } else {
      h += `<label class="lb">الإيميل</label>
      <input class="inp" type="email" inputmode="email" autocomplete="username"
             placeholder="you@example.com" value="${esc(S.ui.mail || '')}" id="syncmail">
      <label class="lb" style="margin-top:8px">الباسورد</label>
      <input class="inp" type="password" autocomplete="current-password" placeholder="٦ حروف على الأقل" id="syncpass">
      <div class="exacts" style="margin-top:10px">
        <button class="btn p" data-signin="1">دخول</button>
        <button class="btn" data-signup="1">حساب جديد</button>
        <button class="btn sm" data-resetpass="1">نسيت الباسورد</button>
      </div>
      <div class="sub" style="margin-top:9px">الباسورد بيروح لـ Firebase مباشرة — الأداة مبتشوفهوش ومبتخزّنهوش. من غير تسجيل دخول كل حاجة شغّالة عادي، بس البيانات بتفضل على الجهاز ده بس.</div>`;
    }
    h += `</div>`;
  }

  /* بياناتي */
  h += `<div class="sect"><h2>بياناتي</h2></div>
  <div class="note b">الأرقام دي بتتحفظ على الجهاز ده بس — مش بتترفع ولا بتتنشر مع الأداة. منها بتتملّى جداول التغذية ونسبة الدهون.</div>
  <div class="card card-p"><div class="grid2">`;
  PROFILE_FIELDS.forEach(f => {
    h += `<div><label class="lb">${esc(f[1])}${f[2] ? ' (' + esc(f[2]) + ')' : ''}</label>
      <input class="inp" type="${f[3]}" ${f[3] === 'number' ? 'step="0.1" inputmode="decimal"' : ''}
        value="${esc((S.profile || {})[f[0]] || '')}" data-pf="${f[0]}"></div>`;
  });
  h += `</div><div class="sub" style="margin-top:9px">الخانات الفاضية بتظهر «—» في الجداول.</div></div>`;

  h += `<div class="sect"><h2>الإعدادات والبيانات</h2></div><div class="card card-p">
    <div class="grid2">
      <div><label class="lb">الأسبوع (١–٦)</label><input class="inp" type="number" min="1" max="6" value="${S.week}" id="setwk"></div>
      <div><label class="lb">الجلسة الحالية</label>
        <select class="inp" id="setpos">${ORDER.map((k, i) => `<option value="${i}" ${i === S.pos ? 'selected' : ''}>${i + 1} — ${esc(sessByKey(k).title)}</option>`).join('')}</select></div>
    </div>
    <div class="sub" style="margin:6px 0 12px">عدّلهم بس لو الترتيب اتلخبط. عادي بيتحرّكوا لوحدهم.</div>
    <div class="exacts">
      <button class="btn" data-exp="1">تصدير نسخة احتياطية</button>
      <button class="btn" data-imp="1">استيراد</button>
      <button class="btn d" data-reset="1">مسح كل البيانات</button>
    </div>
    <input type="file" id="impf" accept="application/json" class="sh">
    <div class="sub" style="margin-top:10px">البيانات كلها متخزّنة على الجهاز ده بس. صدّر نسخة كل فترة.</div>
  </div>`;
  return h;
}

/* ============================================================
   الأحداث
   ============================================================ */
function wire() {
  const app = $('#app');

  app.onclick = ev => {
    const t = ev.target.closest('[data-tog],[data-ck],[data-fill],[data-rest],[data-hist],[data-jump],[data-acc],[data-fin],[data-cpy],[data-cardio],[data-warm],[data-addbody],[data-delbody],[data-addtest],[data-deltest],[data-exp],[data-imp],[data-reset],[data-signin],[data-signup],[data-resetpass],[data-signout],[data-syncnow]');
    if (!t) return;
    const d = t.dataset, c = ensureCur();

    if (d.tog) {
      /* واحد مفتوح بس في المرة */
      openEx = openEx[d.tog] ? {} : { [d.tog]: true };
      renderAt('[data-tog="' + d.tog + '"]');
      return;
    }
    if (d.acc) { S.ui['a' + d.acc] = !S.ui['a' + d.acc]; save(); render(); return; }
    if (d.warm) { c.warm[d.warm] = !c.warm[d.warm]; save(); render(); return; }

    if (d.jump) {
      const i = +d.jump;
      if (i === S.pos) { view = 'today'; render(true); return; }
      const has = Object.keys(c.ex).length || c.note || c.energy;
      if (has && !confirm('في حاجة مسجّلة في الجلسة الحالية ومش هتتقفل. تنقل برضه؟')) return;
      jumpTo(i); view = 'today'; render(true); return;
    }

    if (d.ck != null) {
      const i = +d.ck, id = d.id, e = entry(id, i), s = e.sets[i];
      s.d = !s.d;
      if (s.d) {
        const sg = suggest(id, S.week);
        if (s.w === '' && sg.w != null && !(EX[id].bw && !EX[id].inc)) s.w = sg.w;
        if (s.r === '') s.r = sg.reps;
        startRest(EX[id].r, EX[id].n);
      }
      save(); render(); return;
    }

    if (d.fill) {
      const id = d.fill, sg = suggest(id, S.week);
      const p = sessionPlan(c.k, S.week).find(x => x.id === id);
      for (let i = 0; i < p.sets; i++) {
        const s = entry(id, i).sets[i];
        if (s.w === '' && sg.w != null) s.w = sg.w;
        if (s.r === '') s.r = sg.reps;
      }
      save(); render(); toast('اتملى الاقتراح — عدّله لو محتاج'); return;
    }

    if (d.rest) { startRest(+d.rest, d.name); return; }

    if (d.hist) {
      const H = historyOf(d.hist), ex = EX[d.hist];
      if (!H.length) { toast('مفيش سجل للتمرين ده لسه'); return; }
      alert(ex.n + '\n\n' + H.slice(0, 12).map(x => fmt(x.date) + ': ' + setLine(ex, x.sets)).join('\n'));
      return;
    }

    if (d.cardio) { c.cardio = !c.cardio; save(); render(); return; }

    if (d.fin) {
      const next = sessByKey(ORDER[(S.pos + 1) % ORDER.length]).title;
      if (d.fin === 'skip' && !confirm('هتتخطّى الجلسة دي وتتسجّل كمتخطّاة. تمام؟')) return;
      advance(d.fin);
      view = 'today'; render(true);
      toast((d.fin === 'skip' ? 'اتخطّت — ' : 'اتقفلت ✓ — ') + 'الجاية: ' + next);
      return;
    }

    if (d.cpy) { copySummary(); return; }

    if (d.addbody) {
      const dt = $('#bd').value, w = $('#bw').value, wa = $('#bwa').value;
      if (!dt || (!w && !wa)) { toast('اكتب الوزن أو محيط الوسط'); return; }
      S.body = S.body.filter(x => x.d !== dt);
      S.body.push({ d: dt, w: w, waist: wa });
      save(); render(); toast('اتسجّل'); return;
    }
    if (d.delbody) { S.body = S.body.filter(x => x.d !== d.delbody); save(); render(); return; }

    if (d.addtest) {
      const dt = $('#td').value, tt = $('#tt').value, ts = $('#ts').value;
      if (!dt || !tt) { toast('اكتب وقت الاختبار'); return; }
      S.tests = S.tests.filter(x => x.d !== dt);
      S.tests.push({ d: dt, time: tt, split: ts });
      save(); render(); toast('الاختبار اتسجّل'); return;
    }
    if (d.deltest) { S.tests = S.tests.filter(x => x.d !== d.deltest); save(); render(); return; }

    if (d.signin || d.signup || d.resetpass) {
      const m = ($('#syncmail') || {}).value || '';
      const pw = ($('#syncpass') || {}).value || '';
      S.ui.mail = m; save();                       /* الإيميل بس — الباسورد عمره ما بيتخزّن */
      if (d.resetpass) Sync.resetPass(m);
      else if (d.signup) Sync.signUp(m, pw);
      else Sync.signIn(m, pw);
      return;
    }
    if (d.signout) {
      if (confirm('البيانات هتفضل على الجهاز ده، بس مش هتتزامن تاني لحد ما تسجّل دخول. تمام؟')) Sync.signOut();
      return;
    }
    if (d.syncnow) { toast('بيزامن…'); Sync.pull(true); return; }

    if (d.exp) { exportData(); return; }
    if (d.imp) { $('#impf').click(); return; }
    if (d.reset) {
      if (confirm('هيتمسح كل السجلات والقياسات نهائيًا. متأكد؟')) { S = blank(); save(); render(); toast('اتمسح كل حاجة'); }
      return;
    }
  };

  app.oninput = ev => {
    const t = ev.target, d = t.dataset, c = ensureCur();
    if (d.in != null) { entry(d.id, +d.i).sets[+d.i][d.in] = t.value; save(); return; }
    if (d.ses) { c[d.ses] = t.value; save(); return; }
    if (d.cd) { c.cd[d.cd] = t.value; save(); return; }
    if (d.pf) { (S.profile = S.profile || {})[d.pf] = t.value; save(); return; }
  };

  app.onchange = ev => {
    const t = ev.target, c = ensureCur();
    if (t.id === 'sdate') { c.date = t.value; save(); render(); toast('اتظبط تاريخ الجلسة'); return; }
    if (t.id === 'progsel') { S.ui.progEx = t.value; save(); render(); return; }
    if (t.id === 'setwk') {
      const v = Math.min(6, Math.max(1, +t.value || 1));
      S.week = v; if (S.cur) S.cur.week = v; save(); render(); return;
    }
    if (t.id === 'setpos') { jumpTo(+t.value); render(true); return; }
    if (t.id === 'impf') { importData(t.files[0]); return; }
  };
}

/* ---------- مؤقت الراحة ---------- */
let restT = null, restLeft = 0;
function startRest(sec, name) {
  clearInterval(restT); restLeft = sec;
  $('#timer').classList.add('on');
  $('#tlabel').textContent = 'راحة بعد ' + (name || 'المجموعة');
  paintRest();
  restT = setInterval(() => {
    restLeft--; paintRest();
    if (restLeft <= 0) { clearInterval(restT); beep(); setTimeout(stopRest, 2500); }
  }, 1000);
}
function paintRest() {
  const m = Math.floor(Math.max(0, restLeft) / 60), s = Math.max(0, restLeft) % 60;
  $('#tval').textContent = m + ':' + String(s).padStart(2, '0');
}
function stopRest() { clearInterval(restT); $('#timer').classList.remove('on'); }
function beep() {
  try {
    const C = new (window.AudioContext || window.webkitAudioContext)();
    [0, .18, .36].forEach(t => {
      const o = C.createOscillator(), g = C.createGain();
      o.connect(g); g.connect(C.destination); o.frequency.value = 880; o.type = 'sine';
      g.gain.setValueAtTime(.0001, C.currentTime + t);
      g.gain.exponentialRampToValueAtTime(.3, C.currentTime + t + .01);
      g.gain.exponentialRampToValueAtTime(.0001, C.currentTime + t + .14);
      o.start(C.currentTime + t); o.stop(C.currentTime + t + .16);
    });
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  } catch (e) {}
}

/* ---------- تصدير واستيراد ---------- */
function exportData() {
  const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'training-backup-' + today() + '.json';
  a.click(); URL.revokeObjectURL(a.href);
  toast('اتصدّرت النسخة');
}
function importData(f) {
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const j = JSON.parse(r.result);
      if (!j || typeof j !== 'object' || !('history' in j)) throw 0;
      if (!confirm('هيتم استبدال البيانات الحالية بالنسخة دي. تمام؟')) return;
      S = Object.assign(blank(), j); save(); render(); toast('اتسحبت النسخة');
    } catch (e) { toast('الملف مش صالح'); }
  };
  r.readAsText(f);
}

function copySummary() {
  const c = ensureCur(), D = sessByKey(c.k);
  let out = `${D.title} — ${fmt(c.date)} — أسبوع ${S.week} — جلسة ${S.pos + 1}/${ORDER.length}\n`;
  sessionPlan(c.k, S.week).forEach(p => {
    const e = c.ex[p.id]; if (!e) return;
    const done = e.sets.filter(s => s && (s.d || +s.r > 0));
    if (done.length) out += `${EX[p.id].n}: ${setLine(EX[p.id], done)}\n`;
  });
  if (c.cardio) out += `الكارديو: اتعمل${c.cd.time ? ' — ' + c.cd.time : ''}${c.cd.split ? ' · ' + c.cd.split : ''}\n`;
  if (c.energy) out += `الطاقة: ${c.energy}/10\n`;
  if (c.note) out += `ملاحظات: ${c.note}\n`;
  navigator.clipboard ? navigator.clipboard.writeText(out).then(() => toast('اتنسخ الملخّص')) : prompt('انسخ:', out);
}


/* ---------- بذرة «بياناتي» من لينك ----------
   الأرقام بتيجي في جزء الـ hash من الرابط — الجزء ده مبيتبعتش لأي خادم،
   فبيفضل على الجهاز. بيتقري مرة واحدة وبعدين بيتمسح من شريط العنوان. */
function seedFromHash() {
  const m = /[#&]p=([A-Za-z0-9_-]+)/.exec(location.hash || '');
  if (!m) return false;
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const obj = JSON.parse(new TextDecoder().decode(bytes));
    const allowed = PROFILE_FIELDS.map(f => f[0]);
    let n = 0;
    S.profile = S.profile || {};
    Object.keys(obj).forEach(k => {
      if (allowed.includes(k) && obj[k] !== '' && obj[k] != null) { S.profile[k] = obj[k]; n++; }
    });
    history.replaceState(null, '', location.pathname + location.search);
    if (n) { save(); toast(n + ' رقم اتسجّلوا في «بياناتي»'); return true; }
  } catch (e) { console.warn('seed', e); toast('اللينك مش مقروء'); }
  return false;
}

/* ---------- التشغيل ---------- */
document.addEventListener('click', ev => {
  const n = ev.target.closest('.nav button');
  if (n) { view = n.dataset.v; render(); return; }
  if (ev.target.closest('#tskip')) { stopRest(); return; }
  if (ev.target.closest('#tadd')) { restLeft += 30; paintRest(); return; }
  if (ev.target.closest('#gotoday')) { view = 'today'; render(true); return; }
});

seedFromHash();
render();
if (typeof Sync !== 'undefined') Sync.init();
