/* ============================================================
   المزامنة — Firebase Auth (جوجل) + Firestore عبر REST

   المبدأ: localStorage هو الأساس دايمًا. المزامنة بتحصل لما يبقى في نت،
   والدمج بالمعرّف الفريد لكل جلسة — يعني لو سجّلت من جهازين، الاتنين
   بيتلموا من غير ما حاجة تضيع.

   إعدادات Firebase دي عامة بطبيعتها (مش أسرار) — الحماية جاية من
   تسجيل الدخول وقواعد Firestore اللي بتقفل كل مستند على صاحبه.
   ============================================================ */

const FB = {
  apiKey: '__FB_API_KEY__',
  authDomain: '__FB_AUTH_DOMAIN__',
  projectId: '__FB_PROJECT_ID__'
};

const Sync = (() => {
  const DOCS = `https://firestore.googleapis.com/v1/projects/${FB.projectId}/databases/(default)/documents/users/`;
  let auth = null, user = null, timer = null, busy = false;
  let status = { state: 'off', msg: 'مش مفعّلة', at: 0 };

  function setStatus(state, msg) {
    status = { state, msg, at: Date.now() };
    if (typeof render === 'function' && view === 'ref') render();
    else paintBadge();
  }
  function paintBadge() {
    const el = document.getElementById('syncbadge');
    if (el) el.className = 'syncdot ' + status.state;
  }

  /* ---------- التشغيل ---------- */
  function init() {
    if (typeof firebase === 'undefined') { setStatus('off', 'المزامنة مش متاحة في النسخة دي'); return; }
    try {
      firebase.initializeApp(FB);
      auth = firebase.auth();
      auth.onAuthStateChanged(u => {
        user = u;
        if (u) { setStatus('sync', 'بيزامن…'); pull(true); }
        else setStatus('off', 'مش مسجّل دخول');
      });
      auth.getRedirectResult().catch(e => console.warn('redirect', e));
    } catch (e) {
      console.warn('firebase init', e);
      setStatus('err', 'مشكلة في التشغيل');
    }
  }

  /* ---------- الدخول والخروج ---------- */
  async function signIn() {
    if (!auth) return toast('المزامنة مش متاحة هنا');
    const p = new firebase.auth.GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account' });
    try {
      await auth.signInWithPopup(p);
    } catch (e) {
      /* الآيفون في وضع التطبيق بيمنع النوافذ المنبثقة — بنحوّل لإعادة التوجيه */
      if (['auth/popup-blocked', 'auth/popup-closed-by-user',
           'auth/cancelled-popup-request', 'auth/operation-not-supported-in-this-environment'
          ].includes(e.code)) {
        try { await auth.signInWithRedirect(p); return; } catch (e2) { e = e2; }
      }
      console.warn('signIn', e);
      setStatus('err', 'الدخول فشل: ' + (e.code || e.message));
      toast('الدخول فشل — جرّب من سفاري');
    }
  }
  async function signOut() {
    if (auth) await auth.signOut();
    setStatus('off', 'اتسجّل خروج');
    if (typeof render === 'function') render();
  }

  /* ---------- الشبكة ---------- */
  async function token() { return user ? await user.getIdToken() : null; }

  async function readRemote() {
    const t = await token(); if (!t) return null;
    const r = await fetch(DOCS + user.uid, { headers: { Authorization: 'Bearer ' + t } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('read ' + r.status);
    const j = await r.json();
    const raw = j.fields && j.fields.state && j.fields.state.stringValue;
    return raw ? JSON.parse(raw) : null;
  }

  async function writeRemote(state) {
    const t = await token(); if (!t) return;
    const body = {
      fields: {
        state: { stringValue: JSON.stringify(state) },
        updatedAt: { integerValue: String(state.updatedAt || Date.now()) }
      }
    };
    const url = DOCS + user.uid + '?updateMask.fieldPaths=state&updateMask.fieldPaths=updatedAt';
    const r = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error('write ' + r.status);
  }

  /* ---------- الدمج ---------- */
  function keyOf(rec) { return rec.key || ((rec.dev || '?') + '-' + rec.sid); }

  function merge(local, remote) {
    if (!remote) return local;
    if (!local) return remote;
    const newer = (remote.updatedAt || 0) > (local.updatedAt || 0) ? remote : local;
    const out = Object.assign({}, newer);

    /* السجل: اتحاد بالمفتاح الفريد — مفيش جلسة بتضيع */
    const seen = {};
    (local.history || []).concat(remote.history || []).forEach(r => {
      const k = keyOf(r);
      if (!seen[k] || countSets(r) > countSets(seen[k])) seen[k] = r;
    });
    out.history = Object.values(seen).sort((a, b) =>
      a.date === b.date ? (a.sid || 0) - (b.sid || 0) : (a.date < b.date ? -1 : 1));

    /* القياسات: اتحاد بالتاريخ */
    out.body = unionBy(local.body, remote.body, 'd', local, remote);
    out.tests = unionBy(local.tests, remote.tests, 'd', local, remote);

    /* الجلسة الشغّالة: اللي فيها شغل أكتر */
    const lc = local.cur, rc = remote.cur;
    out.cur = (!lc && !rc) ? null
      : !lc ? rc : !rc ? lc
      : (countSets(lc) >= countSets(rc) ? lc : rc);

    /* العدّاد لازم يفضل فوق أي رقم اتستخدم قبل كده */
    out.sid = Math.max(local.sid || 1, remote.sid || 1);
    out.profile = Object.assign({}, (newer === remote ? local : remote).profile, newer.profile);
    out.updatedAt = Math.max(local.updatedAt || 0, remote.updatedAt || 0);
    return out;
  }

  function countSets(rec) {
    let n = 0;
    Object.values((rec && rec.ex) || {}).forEach(e =>
      (e.sets || []).forEach(s => { if (s && (s.d || +s.r > 0)) n++; }));
    return n;
  }
  function unionBy(a, b, k, ls, rs) {
    const m = {}, lNewer = (ls.updatedAt || 0) >= (rs.updatedAt || 0);
    (lNewer ? b : a).concat([]).forEach(x => { if (x && x[k]) m[x[k]] = x; });
    (lNewer ? a : b).concat([]).forEach(x => { if (x && x[k]) m[x[k]] = x; });
    return Object.keys(m).sort().map(x => m[x]);
  }

  /* ---------- السحب والرفع ---------- */
  async function pull(thenPush) {
    if (!user || busy) return;
    busy = true;
    try {
      const remote = await readRemote();
      if (remote) {
        const merged = merge(S, remote);
        const changed = JSON.stringify(merged) !== JSON.stringify(S);
        if (changed) {
          S = merged;
          localStorage.setItem(LS, JSON.stringify(S));
          if (typeof render === 'function') render();
        }
      }
      busy = false;
      if (thenPush) await push(true);
      else setStatus('ok', 'متزامن');
    } catch (e) {
      busy = false;
      console.warn('pull', e);
      setStatus('err', navigator.onLine ? 'مشكلة في المزامنة' : 'مفيش نت — هيزامن لما يرجع');
    }
  }

  async function push(now) {
    if (!user) return;
    clearTimeout(timer);
    if (!now) { timer = setTimeout(() => push(true), 2500); return; }
    if (busy) { timer = setTimeout(() => push(true), 1500); return; }
    busy = true;
    try {
      await writeRemote(S);
      busy = false;
      setStatus('ok', 'اتحفظ ' + new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      busy = false;
      console.warn('push', e);
      setStatus('err', navigator.onLine ? 'الرفع فشل' : 'مفيش نت — هيرفع لما يرجع');
    }
  }

  addEventListener('online', () => { if (user) pull(true); });

  return {
    init, signIn, signOut, push, pull, merge,
    get user() { return user; },
    get status() { return status; },
    available: () => typeof firebase !== 'undefined'
  };
})();
