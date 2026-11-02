/* 拡散シミュレーターの画面 */
(function () {
  "use strict";
  const M = window.CDModel, D = window.CDDisp;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const KEY = "cd-sim-v1";

  const DIRS = ["北", "北北東", "北東", "東北東", "東", "東南東", "南東", "南南東", "南", "南南西", "南西", "西南西", "西", "西北西", "北西", "北北西"];
  const dirName = deg => DIRS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];

  const SRC_LABEL = { liquefied: "加圧液化ガスの漏えい", gas: "圧縮ガス容器の漏えい", pool: "液体の漏えい（液だまり蒸発）", direct: "直接放出（放出率を指定）" };
  const BLD = {
    single: "木造平屋・一般住宅（ALOHA の平屋モデル）", double: "2 階建て住宅（ALOHA の 2 階建てモデル）",
    office: "事務所ビル（換気回数 0.5 回/h）", ach: "換気回数を直接入力",
  };

  // 研修ケース：折尾ケミカル西工場（架空）。地点は発生源からの東西・南北の距離 [m]
  const CASE_ORIO = {
    title: "研修ケース：折尾ケミカル西工場 アンモニア漏えい（架空）",
    chemId: "ammonia", srcType: "liquefied",
    src: { mass: 20000, TstoreC: 5, holeD: 50, path: "pipe", airborneRule: "all", dikeArea: 0, pressure: 10, volume: 1, rate: 1, durationMin: 10, releaseHeight: 0, liquidHead: 0 },
    met: { u: 3, zRef: 10, dirFrom: 315, TambC: 5, cloud: 5, terrain: "open", stab: "auto", dateLocal: "2026-02-08T13:10", lat: 33.88, lon: 130.70, lid: 0 },
    loc: { family: "auto", minutes: 60, custom: [null, null, null] },
    model: "auto",
    receptors: [
      { name: "A 冷凍設備西側", dx: -90, dy: -20, b: { type: "single", sheltered: false, ach: 1 } },
      { name: "B 事務棟北側交差点", dx: -170, dy: 170, b: { type: "office", sheltered: false, ach: 0.5 } },
      { name: "C 正門西側空地", dx: -230, dy: -220, b: { type: "single", sheltered: false, ach: 1 } },
      { name: "風下の住宅地（1.5 km）", dx: 1060, dy: -1060, b: { type: "single", sheltered: false, ach: 1 } },
    ],
    base: "none",
  };

  let st = load() || clone(CASE_ORIO);
  let map = null, layers = null, last = null;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* 保存できない環境でも動く */ } }
  function chemOf(id) { return CD.CHEMICALS.find(c => c.id === id) || customChem(); }
  function customChem() {
    const c = st.custom || { ja: "その他の物質", mw: 50 };
    return { id: "custom", ja: c.ja || "その他の物質", en: c.en || "", cas: c.cas || "", mw: +c.mw || 50, antoine: [], forms: ["direct"], aegl: null, pac: c.pac || [null, null, null], erpg: null, idlh: c.idlh || null };
  }

  /* ---------- 入力フォーム ---------- */
  function render(root) {
    st = load() || clone(CASE_ORIO);
    fitNext = true;
    root.innerHTML = `
    <h2 class="page">化学物質拡散シミュレーター</h2>
    <p class="lead small">ALOHA（NOAA/EPA）と同じ考え方で、漏えい・爆発で放出された化学物質が風下へどこまで広がるかを推計します。
      計算式と係数はすべて出典つきで、<a href="#/method">計算方法</a>にまとめています。<b>結果は防護措置を考えるための目安で、実測値を優先してください。</b></p>
    <p class="noprint mobile-only"><button type="button" class="btn sm ghost" onclick="document.getElementById('simOut').scrollIntoView({behavior:'smooth'})">結果（地図・濃度）へ移動 ↓</button></p>
    <div class="sim-grid">
      <div class="sim-side noprint" id="simForm"></div>
      <div id="simOut"></div>
    </div>`;
    renderForm();
    compute();
  }

  function num(id, val, unit, attrs = "") {
    return `<div class="unit"><input class="inp" type="number" id="${id}" value="${val ?? ""}" ${attrs}><span>${unit}</span></div>`;
  }
  function segBtns(name, cur, items) {
    return `<div class="seg" data-seg="${name}">${items.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${String(cur) === String(v)}">${l}</button>`).join("")}</div>`;
  }

  function renderForm() {
    const c = chemOf(st.chemId);
    const forms = c.forms;
    if (!forms.includes(st.srcType)) st.srcType = forms[0];
    const s = st.src, m = st.met;
    $("#simForm").innerHTML = `
    <div class="card"><div class="card-h">ケース</div><div class="card-b">
      <div class="seg"><button type="button" class="btn sm ghost" id="btnCase">研修ケース（折尾ケミカル）を読み込む</button></div>
      <p class="hint">2026年2月8日の実践研修で使った架空の事例です（アンモニア 20 t タンクの配管破断、北西の風 3 m/s、気温 5 ℃）。配管の口径は資料にないため 50 mm と仮定しています。</p>
    </div></div>

    <div class="card"><div class="card-h"><span class="step">1</span>物質</div><div class="card-b">
      <div class="field"><select class="inp" id="chem">${CD.CHEMICALS.map(x => `<option value="${x.id}" ${x.id === st.chemId ? "selected" : ""}>${x.ja}（${x.en}）</option>`).join("")}
        <option value="custom" ${st.chemId === "custom" ? "selected" : ""}>その他の物質（直接放出のみ）</option></select>
        <p class="hint">${esc(c.storage || "")}${c.id !== "custom" ? `　<a href="#/chem/${c.id}">基準値と健康影響</a>` : ""}</p></div>
      ${st.chemId === "custom" ? `
      <div class="row2"><div class="field"><label for="cuName">物質名</label><input class="inp" id="cuName" value="${esc((st.custom || {}).ja || "")}"></div>
        <div class="field"><label for="cuMw">分子量</label>${num("cuMw", (st.custom || {}).mw || 50, "g/mol")}</div></div>
      <p class="hint">基準値は「4 基準値」で直接入力します。<a href="#/chem">物質・基準値</a>の検索で PubChem から取得した値を使うこともできます。</p>` : ""}
    </div></div>

    <div class="card"><div class="card-h"><span class="step">2</span>発生源</div><div class="card-b">
      <div class="field">${segBtns("srcType", st.srcType, forms.map(f => [f, SRC_LABEL[f]]))}</div>
      ${srcFields(c)}
    </div></div>

    <div class="card"><div class="card-h"><span class="step">3</span>気象</div><div class="card-b">
      <div class="row2">
        <div class="field"><label for="u">風速</label>${num("u", m.u, "m/s", 'step="0.5" min="1"')}</div>
        <div class="field"><label for="zRef">測定高さ</label>${num("zRef", m.zRef, "m", 'step="1" min="1"')}</div>
      </div>
      <div class="field"><label for="dirFrom">風向（風が吹いてくる方位）</label>
        <div class="unit"><select class="inp" id="dirFrom">${DIRS.map((d, i) => `<option value="${i * 22.5}" ${Math.abs(m.dirFrom - i * 22.5) < 1 ? "selected" : ""}>${d}の風（${i * 22.5}°）</option>`).join("")}</select></div>
        <p class="hint">煙は風下＝${dirName(m.dirFrom + 180)}方向へ流れます。</p></div>
      <div class="row2">
        <div class="field"><label for="TambC">気温</label>${num("TambC", m.TambC, "℃", 'step="1"')}</div>
        <div class="field"><label for="cloud">雲量</label>${num("cloud", m.cloud, "/10", 'step="1" min="0" max="10"')}</div>
      </div>
      <div class="field"><label for="dateLocal">日時（日本時間）</label><input class="inp" type="datetime-local" id="dateLocal" value="${m.dateLocal}"></div>
      <div class="field"><span class="lbl">地表の状態</span>${segBtns("terrain", m.terrain, [["open", "開けた土地（z0 = 3 cm）"], ["urban", "市街地・森林・工場群（z0 = 1 m）"]])}</div>
      <div class="field"><label for="stab">大気安定度</label><select class="inp" id="stab">
        <option value="auto" ${m.stab === "auto" ? "selected" : ""}>自動（日射・雲量・風速から判定）</option>
        ${["A", "B", "C", "D", "E", "F"].map(k => `<option value="${k}" ${m.stab === k ? "selected" : ""}>${k}（${{ A: "非常に不安定", B: "不安定", C: "やや不安定", D: "中立", E: "やや安定", F: "安定" }[k]}）</option>`).join("")}</select>
        <p class="hint" id="stabHint"></p></div>
      <details class="more"><summary>詳細設定</summary>
        <div class="field"><label for="lid">逆転層（混合層）の高さ</label>${num("lid", m.lid || "", "m（空欄＝なし）", 'step="50" min="0"')}</div>
        <div class="field"><span class="lbl">拡散モデル</span>${segBtns("model", st.model, [["auto", "自動判定"], ["gauss", "ガウス（中立浮力）"], ["dense", "重いガス"]])}
          <p class="hint">自動判定は ALOHA と同じ摩擦リチャードソン数 Ri ≥ 1 で重いガスを選びます。</p></div>
      </details>
    </div></div>

    <div class="card"><div class="card-h"><span class="step">4</span>基準値（脅威ゾーンの線）</div><div class="card-b">
      <div class="field">${segBtns("locFamily", st.loc.family, [["auto", "ALOHA 既定"], ["AEGL", "AEGL"], ["PAC", "PAC"], ["ERPG", "ERPG"], ["custom", "直接入力"]])}
        <p class="hint">ALOHA 既定は 60 分 AEGL → ERPG → PAC の順に、ある値を使います（NOAA）。</p></div>
      ${st.loc.family === "AEGL" ? `<div class="field"><label for="locMin">AEGL のばく露時間</label><select class="inp" id="locMin">${D.AEGL_T.map(t => `<option value="${t}" ${st.loc.minutes === t ? "selected" : ""}>${D.label(t)}</option>`).join("")}</select></div>` : ""}
      ${st.loc.family === "custom" || st.chemId === "custom" ? `<div class="row3">${[3, 2, 1].map((lv, i) => `<div class="field"><label for="cu${lv}">レベル ${lv}</label>${num("cu" + lv, st.loc.custom[i], "ppm", 'step="any" min="0"')}</div>`).join("")}</div>` : ""}
    </div></div>

    <div class="card"><div class="card-h"><span class="step">5</span>評価する地点</div><div class="card-b">
      <div id="rcptList"></div>
      <div class="seg" style="margin-top:8px"><button type="button" class="btn sm ghost" id="addR">地点を追加</button></div>
      <p class="hint">地図をクリックした位置にも追加できます。地点と発生源の印はドラッグで動かせます。</p>
    </div></div>
    <p class="xs muted">入力はこの端末のブラウザにだけ保存されます。</p>`;
    renderReceptorList();
    bindForm();
  }

  function srcFields(c) {
    const s = st.src;
    switch (st.srcType) {
      case "liquefied": return `
        <div class="row2"><div class="field"><label for="mass">貯蔵量</label>${num("mass", s.mass, "kg", 'min="1"')}</div>
          <div class="field"><label for="TstoreC">貯蔵温度</label>${num("TstoreC", s.TstoreC, "℃")}</div></div>
        <div class="field"><span class="lbl">漏れ方</span>${segBtns("path", s.path, [["pipe", "配管の破断"], ["hole", "容器の穴"]])}</div>
        <div class="field"><label for="holeD">${s.path === "pipe" ? "配管の内径" : "穴の直径"}</label>${num("holeD", s.holeD, "mm", 'min="1"')}</div>
        <div class="field"><span class="lbl">空中に出る量</span>${segBtns("airborneRule", s.airborneRule, [["all", "全量（ALOHA と同じ）"], ["2x", "フラッシュ率の 2 倍"]])}
          <p class="hint">液化ガスは噴出と同時に一部が気化（フラッシュ）し、残りは霧になって雲に含まれます。ALOHA は液だまりを作らず全量を雲に入れます（安全側）。</p></div>
        ${s.airborneRule === "2x" ? `<div class="field"><label for="dikeArea">防液堤の面積</label>${num("dikeArea", s.dikeArea || "", "m²（空欄＝堤なし）")}</div>` : ""}`;
      case "gas": return `
        <div class="row2"><div class="field"><label for="pressure">容器内圧力（ゲージ）</label>${num("pressure", s.pressure, "MPa", 'step="0.1" min="0.01"')}</div>
          <div class="field"><label for="volume">容器の内容積</label>${num("volume", s.volume, "m³", 'step="0.01" min="0.001"')}</div></div>
        <div class="row2"><div class="field"><label for="TstoreC">ガス温度</label>${num("TstoreC", s.TstoreC, "℃")}</div>
          <div class="field"><label for="holeD">穴の直径</label>${num("holeD", s.holeD, "mm", 'min="1"')}</div></div>
        <p class="hint">47 L ボンベは 0.047 m³。液化ガスのボンベ（塩素・アンモニアなど）は「加圧液化ガス」を選んでください。</p>`;
      case "pool": return `
        <div class="row2"><div class="field"><label for="mass">漏えい量</label>${num("mass", s.mass, "kg", 'min="1"')}</div>
          <div class="field"><label for="TstoreC">液温</label>${num("TstoreC", s.TstoreC, "℃")}</div></div>
        <div class="field"><label for="dikeArea">液だまりの面積（防液堤）</label>${num("dikeArea", s.dikeArea || "", "m²（空欄＝厚さ 1 cm まで広がる）")}</div>`;
      default: return `
        <div class="row2"><div class="field"><label for="rate">放出率</label>${num("rate", s.rate, "kg/s", 'step="any" min="0"')}</div>
          <div class="field"><label for="durationMin">継続時間</label>${num("durationMin", s.durationMin, "分", 'step="1" min="1" max="60"')}</div></div>
        <div class="field"><label for="releaseHeight">放出の高さ</label>${num("releaseHeight", s.releaseHeight, "m", 'step="1" min="0"')}
          <p class="hint">煙突・塔頂などからの放出。高所放出は中立浮力（ガウス）でのみ計算します（ALOHA と同じ）。爆発・火災で一気に放出された量は「放出率 × 1 分」で入れます。</p></div>`;
    }
  }

  function renderReceptorList() {
    $("#rcptList").innerHTML = st.receptors.map((r, i) => `
      <div class="rcpt" style="padding:8px 10px">
        <div class="row2" style="grid-template-columns: 1fr auto; align-items:center">
          <input class="inp" data-r="${i}" data-k="name" value="${esc(r.name)}" aria-label="地点名">
          <button type="button" class="btn sm ghost" data-del="${i}" aria-label="削除">削除</button></div>
        <div class="row2" style="margin-top:6px">
          <div class="unit"><span>東</span><input class="inp" type="number" data-r="${i}" data-k="dx" value="${Math.round(r.dx)}"><span>m</span></div>
          <div class="unit"><span>北</span><input class="inp" type="number" data-r="${i}" data-k="dy" value="${Math.round(r.dy)}"><span>m</span></div></div>
        <select class="inp" style="margin-top:6px" data-r="${i}" data-k="btype">${Object.entries(BLD).map(([k, l]) => `<option value="${k}" ${r.b.type === k ? "selected" : ""}>${l}</option>`).join("")}</select>
        ${r.b.type === "ach" ? `<div class="unit" style="margin-top:6px"><span>換気回数</span><input class="inp" type="number" step="0.1" min="0.05" data-r="${i}" data-k="ach" value="${r.b.ach}"><span>回/h</span></div>` : ""}
        ${r.b.type === "single" || r.b.type === "double" ? `<label class="xs" style="display:block;margin-top:4px"><input type="checkbox" data-r="${i}" data-k="sheltered" ${r.b.sheltered ? "checked" : ""}> 周囲に建物や木があり風が遮られる</label>` : ""}
      </div>`).join("") || `<p class="hint">地点はまだありません。</p>`;
  }

  function bindForm() {
    const f = $("#simForm");
    f.onchange = f.oninput = e => {
      const t = e.target;
      if (t.dataset.r !== undefined) {
        const r = st.receptors[+t.dataset.r], k = t.dataset.k;
        if (k === "name") r.name = t.value;
        else if (k === "dx" || k === "dy") r[k] = +t.value || 0;
        else if (k === "btype") { r.b.type = t.value; if (e.type === "change") renderReceptorList(); }
        else if (k === "ach") r.b.ach = Math.max(0.05, +t.value || 0.5);
        else if (k === "sheltered") r.b.sheltered = t.checked;
        if (e.type === "change" || k !== "name") schedule();
        return;
      }
      const id = t.id, v = t.value;
      if (!id) return;
      const s = st.src, m = st.met;
      if (id === "chem") { st.chemId = v; renderForm(); schedule(); return; }
      if (id === "cuName") { st.custom = Object.assign(st.custom || {}, { ja: v }); }
      else if (id === "cuMw") { st.custom = Object.assign(st.custom || {}, { mw: +v }); }
      else if (["mass", "TstoreC", "holeD", "dikeArea", "pressure", "volume", "rate", "durationMin", "releaseHeight"].includes(id)) s[id] = v === "" ? null : +v;
      else if (["u", "zRef", "TambC", "cloud", "lid"].includes(id)) m[id] = v === "" ? null : +v;
      else if (id === "dirFrom") { m.dirFrom = +v; renderForm(); }
      else if (id === "dateLocal") m.dateLocal = v;
      else if (id === "stab") m.stab = v;
      else if (id === "locMin") st.loc.minutes = +v;
      else if (/^cu[123]$/.test(id)) st.loc.custom[3 - +id[2]] = v === "" ? null : +v;
      schedule();
    };
    f.onclick = e => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.id === "btnCase") { st = clone(CASE_ORIO); renderForm(); fitNext = true; compute(); return; }
      if (b.id === "addR") { st.receptors.push({ name: "地点 " + (st.receptors.length + 1), dx: 500, dy: 0, b: { type: "single", sheltered: false, ach: 1 } }); renderReceptorList(); compute(); return; }
      if (b.dataset.del !== undefined) { st.receptors.splice(+b.dataset.del, 1); renderReceptorList(); compute(); return; }
      const seg = b.closest("[data-seg]");
      if (seg) {
        const name = seg.dataset.seg, v = b.dataset.v;
        if (name === "srcType") st.srcType = v;
        else if (name === "terrain") st.met.terrain = v;
        else if (name === "model") st.model = v;
        else if (name === "locFamily") st.loc.family = v;
        else st.src[name] = v;
        renderForm(); compute();
      }
    };
  }

  let timer = null, fitNext = true;
  function schedule() { clearTimeout(timer); timer = setTimeout(compute, 250); }

  /* ---------- 計算 ---------- */
  function buildInputs() {
    const c = chemOf(st.chemId), s = st.src, m = st.met;
    const Tamb = (m.TambC ?? 15) + 273.15;
    const date = m.dateLocal ? new Date(m.dateLocal + ":00+09:00") : new Date();
    const met = { u: Math.max(m.u || 1, 1), zRef: m.zRef || 10, dirFrom: m.dirFrom, Tamb, cloud: Math.min(10, Math.max(0, m.cloud ?? 5)),
      terrain: m.terrain, stab: m.stab === "auto" ? null : m.stab, lat: m.lat, lon: m.lon, date, lid: m.lid || 0 };
    const u10 = M.windAt(10, met.u, met.zRef, "D");
    const Ts = (s.TstoreC ?? m.TambC ?? 15) + 273.15;
    let source;
    const type = c.forms.includes(st.srcType) ? st.srcType : c.forms[0];
    if (type === "liquefied") source = M.sourceLiquefied({ chem: c, Tstore: Ts, holeD: (s.holeD || 10) / 1000, path: s.path, mass: s.mass || 1, airborneRule: s.airborneRule, dikeArea: s.dikeArea, u10, Tamb, liquidHead: s.liquidHead });
    else if (type === "gas") source = M.sourceGasTank({ chem: c, Tstore: Ts, holeD: (s.holeD || 5) / 1000, pressure: (s.pressure || 1) * 1e6 + M.P_ATM, volume: s.volume || 0.047 });
    else if (type === "pool") source = M.sourcePool({ chem: c, Tstore: Ts, mass: s.mass || 1, dikeArea: s.dikeArea, u10 });
    else source = M.sourceDirect({ rate: s.rate || 0, duration: (s.durationMin || 1) * 60, Tamb });
    const releaseHeight = type === "direct" ? (s.releaseHeight || 0) : 0;
    let model = st.model;
    if (releaseHeight > 0) model = "gauss";
    return { chem: c, met, source, model, releaseHeight, type };
  }

  function locs(c) {
    if (st.loc.family === "custom" || c.id === "custom") return [3, 2, 1].map((lv, i) => ({ level: lv, name: "レベル " + lv + "（入力値）", ppm: st.loc.custom[i] }));
    return D.defaultLocs(c, st.loc.family, st.loc.family === "AEGL" ? st.loc.minutes : 60);
  }

  function compute() {
    save();
    let inp, sim;
    try {
      inp = buildInputs();
      sim = D.buildSim(inp);
    } catch (e) {
      $("#simOut").innerHTML = `<div class="note crit">計算できませんでした：${esc(e.message)}</div>`;
      return;
    }
    const c = inp.chem, Tamb = inp.met.Tamb;
    const L = locs(c).map(l => {
      if (l.ppm == null || !(l.ppm > 0)) return Object.assign(l, { zone: null });
      return Object.assign(l, { zone: sim.zone(M.ppmToMg(l.ppm, c.mw, Tamb)) });
    });
    const rcpts = st.receptors.map(r => {
      const th = (inp.met.dirFrom + 180) * Math.PI / 180;
      const x = r.dx * Math.sin(th) + r.dy * Math.cos(th);
      const y = r.dx * Math.cos(th) - r.dy * Math.sin(th);
      const res = sim.receptor(x, y, r.b);
      return { r, x, y, dist: Math.hypot(r.dx, r.dy), res };
    });
    last = { inp, sim, L, rcpts };
    renderOut();
  }

  /* ---------- 結果 ---------- */
  const fmt = v => v == null ? "—" : v >= 100 ? Math.round(v).toLocaleString() : v >= 10 ? String(+v.toFixed(1)) : v >= 1 ? String(+v.toFixed(2)) : v > 0 ? String(+v.toPrecision(2)) : "0";
  const fmtD = m => m >= 1000 ? (m / 1000).toFixed(m >= 10000 ? 0 : 1) + " km" : Math.round(m / 10) * 10 + " m";
  const toPpm = mg => M.mgToPpm(mg, last.inp.chem.mw, last.inp.met.Tamb);

  function renderOut() {
    const { inp, sim, L, rcpts } = last;
    const c = inp.chem, met = sim.met, src = sim.src;
    const maxQ = Math.max(...src.segments.map(s => s.Q));
    const stabTxt = met.stab + (st.met.stab === "auto" ? `（自動：${{ strong: "日射 強", moderate: "日射 中", slight: "日射 弱", night: "夜間", overcast: "曇天" }[met.insol]}、地上 10 m 風速 ${met.u10.toFixed(1)} m/s）` : "（手動）");
    const hint = $("#stabHint"); if (hint) hint.textContent = "判定結果：" + stabTxt;
    const zoneCls = { 3: "z3", 2: "z2", 1: "z1" };
    const lvName = { 3: "生命に危険", 2: "不可逆・避難困難", 1: "不快・刺激" };
    $("#simOut").innerHTML = `
    <div class="card">
      <div class="card-h">脅威ゾーン<span class="right xs muted">${esc(c.ja)}／${SRC_LABEL[inp.type]}／${sim.model === "dense" ? "重いガスモデル" : "ガウスモデル"}</span></div>
      <div class="zone-legend">${L.map(l => `<span><i style="background:var(--z${l.level})"></i>${esc(l.name)}${l.ppm != null ? " " + fmt(l.ppm) + " ppm" : ""}</span>`).join("")}
        <span><i style="border:2px dashed #555;background:none"></i>風向の信頼線（±${(sim.alpha * 180 / Math.PI).toFixed(0)}°）</span></div>
      <div id="map"></div>
    </div>
    <div class="kpis" style="margin-bottom:16px">
      ${L.map(l => `<div class="kpi ${zoneCls[l.level]}"><div class="k">レベル ${l.level}：${lvName[l.level]}</div>
        <div class="v">${l.zone ? (l.zone.length > 0 ? (l.zone.truncated ? "10 km 超" : fmtD(l.zone.length)) : "到達せず") : "—"}</div>
        <div class="xs muted">${esc(l.name)}${l.zone && l.zone.length > 0 ? `・最大幅 ${fmtD(2 * l.zone.maxHalfWidth)}` : ""}${l.zone && l.zone.short && l.zone.length > 0 ? "・50 m 未満は参考" : ""}</div></div>`).join("")}
      <div class="kpi"><div class="k">空中への最大放出率</div><div class="v">${fmt(maxQ)} <small>kg/s</small></div>
        <div class="xs muted">60 分間の放出量 ${fmt(src.airborne)} kg</div></div>
    </div>
    <div class="card"><div class="card-h">指揮官への助言（たたき台）</div><div class="card-b">
      <div class="advice" id="advice">${esc(adviceText())}</div>
      <div class="seg" style="margin-top:8px"><button type="button" class="btn sm ghost" id="copyAdv">コピー</button><button type="button" class="btn sm ghost" onclick="window.print()">印刷</button></div>
      <p class="hint">推計値です。風向の変化・建物・地形・火災の上昇気流は考慮していません。検知器の実測値と合わせて判断し、判断の根拠と時刻をログに残してください。</p>
    </div></div>
    <div class="card"><div class="card-h">地点ごとの濃度（屋外・屋内）</div><div class="card-b">
      ${rcpts.length ? rcpts.map(rcptHtml).join("") : `<p class="muted small">評価する地点を追加すると、屋外と屋内の濃度の時間変化、AEGL との比較を表示します。</p>`}
      <p class="hint">屋内は ALOHA と同じ 1 室の換気モデル（Wilson 1987）。窓・扉を閉め、換気扇・空調を止めた状態を想定しています。雲が通り過ぎたら、屋内の方が濃度が高くなる時間帯があります（換気の再開時期に注意）。</p>
    </div></div>
    <div class="card"><div class="card-h">発生源と計算条件</div><div class="card-b small">
      <ul class="list">${src.notes.map(n => `<li>${esc(n)}</li>`).join("")}
        <li>大気安定度 ${esc(stabTxt)}、地表 ${met.terrain === "urban" ? "市街地・森林（σz は都市の係数）" : "開けた土地"}、気温 ${(met.Tamb - 273.15).toFixed(0)} ℃。</li>
        <li>雲の初期密度 ${sim.dc.rho.toFixed(2)} kg/m³（空気 ${sim.dc.rhoA.toFixed(2)}）、摩擦リチャードソン数 Ri = ${fmt(sim.dc.Ri)} → ${sim.dc.dense ? "重いガス" : "中立浮力"}と判定${st.model !== "auto" ? `（手動で${sim.model === "dense" ? "重いガス" : "ガウス"}を指定）` : ""}。</li>
        ${sim.model === "dense" && sim.denseModel ? `<li>重いガス（Britter & McQuaid 1988）：α（連続）= ${sim.denseModel.info.map(i => i.alphaPlume.toFixed(2)).join(" / ")}。最後の等値線より遠方は仮想点源からのガウスプルームに接続。受動拡散の方が高い所はそちらを採用。</li>` : ""}
      </ul>
      <details class="more"><summary>このシミュレーターの限界</summary><ul class="list small">
        <li>ALOHA と同じく、放出は最長 60 分、評価は 10 km まで、風速は地上 10 m で 1 m/s 以上を前提とします。50 m より近い範囲は濃度のむらが大きく信頼できません。</li>
        <li>風向・風速・安定度は一定と仮定します。建物・地形による流れの変化、海陸風、谷筋への流れ込みは扱いません。</li>
        <li>火災・爆発の熱による上昇（プルームの持ち上がり）を考慮しないため、地上濃度は高め（安全側）に出ることがあります。燃焼生成物（CO・シアン化水素・窒素酸化物など）は別に評価が必要です。</li>
        <li>重いガスは ALOHA の DEGADIS 系モデルではなく、HSE の作業手引き（Britter & McQuaid 1988）で計算します。液だまりの蒸発は EPA RMP の簡易式で、ALOHA の熱収支モデルより粗い近似です。</li>
        <li>結果は ALOHA の出力と一致するものではありません。正式な計画・評価には ALOHA 等の検証済みソフトウェアを使ってください。</li>
      </ul></details>
    </div></div>`;
    drawMap();
    $("#copyAdv").onclick = () => { navigator.clipboard && navigator.clipboard.writeText($("#advice").textContent); };
  }

  function rcptHtml(o, i) {
    const { r, res, dist, x } = o;
    const c = last.inp.chem;
    const aegl = c.aegl;
    const bearing = (Math.atan2(r.dx, r.dy) * 180 / Math.PI + 360) % 360;
    const peakO = toPpm(res.peakOut), peakI = toPpm(res.peakIn);
    const L = last.L;
    const over = v => { const hit = L.filter(l => l.ppm != null && v >= l.ppm).sort((a, b) => b.level - a.level)[0]; return hit ? `<span class="pill ${hit.level >= 2 ? "crit" : "warn"}">レベル ${hit.level} 超</span>` : `<span class="pill good">レベル 1 未満</span>`; };
    const rows = aegl ? [1, 2, 3].filter(lv => aegl[lv]).map(lv => `<tr><th>AEGL-${lv}</th>${aegl[lv].map(v => `<td class="r">${v == null ? "NR" : fmt(v)}</td>`).join("")}</tr>`).join("") : "";
    const twaO = res.twaOut.map(toPpm), twaI = res.twaIn.map(toPpm);
    const cmp = (vals) => vals.map((v, k) => {
      let lvl = 0;
      if (aegl) for (const lv of [3, 2, 1]) { const a = aegl[lv] && aegl[lv][k]; if (a != null && v >= a) { lvl = lv; break; } }
      return `<td class="r ${lvl >= 2 ? "diff" : ""}">${fmt(v)}${lvl ? `<br><span class="xs">AEGL-${lvl} 超</span>` : ""}</td>`;
    }).join("");
    return `<div class="rcpt">
      <h4>${esc(r.name)} <span class="xs muted">発生源から${dirName(bearing)}へ ${fmtD(dist)}${x <= 0 ? "（風上側）" : Math.abs(o.y) > x ? "（風横）" : "（風下側）"}</span></h4>
      <div class="kpis" style="margin-bottom:8px">
        <div class="kpi"><div class="k">屋外の最大濃度</div><div class="v">${fmt(peakO)} <small>ppm</small></div>${over(peakO)}</div>
        <div class="kpi"><div class="k">屋内の最大濃度</div><div class="v">${fmt(peakI)} <small>ppm</small></div>${over(peakI)} <span class="xs muted">換気 ${res.ach.toFixed(2)} 回/h</span></div>
        <div class="kpi"><div class="k">到達時刻（発災から）</div><div class="v">${res.arrival != null && peakO > 0.001 ? Math.round(res.arrival / 60) + " <small>分後</small>" : "—"}</div></div>
      </div>
      ${peakO > 1e-6 ? chartSvg(res) : `<p class="small muted">この地点には届かない計算です（風上・風横）。風向が変わる可能性は信頼線で確認してください。</p>`}
      ${aegl && peakO > 1e-6 ? `<details class="more"><summary>時間加重平均と AEGL の比較</summary><div class="tbl-wrap"><table class="tbl">
        <tr><th></th>${D.AEGL_T.map(t => `<th class="r">${D.label(t)}</th>`).join("")}</tr>
        <tr><th>屋外 最大平均</th>${cmp(twaO)}</tr><tr><th>屋内 最大平均</th>${cmp(twaI)}</tr>${rows}</table></div>
        <p class="hint">各時間幅で最も高くなる平均濃度（雲が来る前後の 0 を含む）を、同じばく露時間の AEGL と比べます。</p></details>` : ""}
    </div>`;
  }

  function chartSvg(res) {
    const W = 640, H = 220, pl = 46, pr = 22, pt = 22, pb = 28;
    const n = res.out.length, dt = res.dt;
    let tEnd = 0;
    const thr = res.peakOut * 0.005;
    for (let i = 0; i < n; i++) if (res.out[i] > thr || res.ind[i] > thr) tEnd = i * dt;
    tEnd = Math.min(Math.max(tEnd * 1.15, 20 * 60), 8 * 3600);
    const ppmO = res.out.map(toPpm), ppmI = res.ind.map(toPpm);
    const L = last.L.filter(l => l.ppm != null);
    const top = Math.max(...ppmO, ...ppmI, ...L.map(l => l.ppm)) * 1.5;
    const bot = Math.max(top / 1e4, Math.min(...L.map(l => l.ppm), top) / 20);
    const ly = v => pt + (H - pt - pb) * (1 - (Math.log10(Math.max(v, bot)) - Math.log10(bot)) / (Math.log10(top) - Math.log10(bot)));
    const lx = t => pl + (W - pl - pr) * t / tEnd;
    const path = arr => arr.map((v, i) => i * dt <= tEnd ? `${i ? "L" : "M"}${lx(i * dt).toFixed(1)},${ly(v).toFixed(1)}` : "").join("");
    const decades = [];
    for (let e = Math.ceil(Math.log10(bot)); e <= Math.floor(Math.log10(top)); e++) decades.push(Math.pow(10, e));
    const step = tEnd > 3 * 3600 ? 3600 : tEnd > 3600 ? 1800 : 600;
    const xt = [];
    for (let t = 0; t <= tEnd; t += step) xt.push(t);
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="濃度の時間変化">
      ${decades.map(d => `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${ly(d)}" y2="${ly(d)}"/><text x="${pl - 4}" y="${ly(d) + 4}" text-anchor="end">${d >= 1 ? d.toLocaleString() : d}</text>`).join("")}
      ${xt.map(t => `<text x="${lx(t)}" y="${H - 8}" text-anchor="middle">${t / 60}分</text>`).join("")}
      <line class="ax" x1="${pl}" x2="${pl}" y1="${pt}" y2="${H - pb}"/><line class="ax" x1="${pl}" x2="${W - pr}" y1="${H - pb}" y2="${H - pb}"/>
      ${L.map(l => `<line class="loc${l.level}" x1="${pl}" x2="${W - pr}" y1="${ly(l.ppm)}" y2="${ly(l.ppm)}" stroke-dasharray="2 3"/><text x="${W - pr - 2}" y="${ly(l.ppm) - 3}" text-anchor="end">${esc(l.name.split("（")[0])}</text>`).join("")}
      <path class="out" d="${path(ppmO)}"/><path class="in" d="${path(ppmI)}"/>
      <text x="${pl}" y="12" style="fill:var(--s-out)">― 屋外</text><text x="${pl + 50}" y="12" style="fill:var(--s-in)">--- 屋内（窓を閉め換気停止）</text>
      <text x="4" y="12">ppm</text>
    </svg>`;
  }

  function adviceText() {
    const { inp, sim, L, rcpts } = last;
    const c = inp.chem;
    const down = dirName(inp.met.dirFrom + 180);
    const l2 = L.find(l => l.level === 2), l3 = L.find(l => l.level === 3), l1 = L.find(l => l.level === 1);
    const d = l => l && l.zone && l.zone.length > 0 ? (l.zone.truncated ? "10 km 以上" : "約 " + fmtD(l.zone.length)) : null;
    const lines = [];
    lines.push(`【推計】${c.ja}の放出（${SRC_LABEL[inp.type]}）。${dirName(inp.met.dirFrom)}の風 ${inp.met.u} m/s、大気安定度 ${sim.met.stab}。`);
    if (d(l3)) lines.push(`・風下（${down}）${d(l3)}まで ${l3.name}（${fmt(l3.ppm)} ppm）を超えるおそれ：生命に危険なレベル。立入禁止・救助は空気呼吸器（SCBA）と化学防護服で。`);
    if (d(l2)) lines.push(`・風下（${down}）${d(l2)}まで ${l2.name}（${fmt(l2.ppm)} ppm）を超えるおそれ：屋外にいる人の避難が困難になるレベル。この範囲の住民・従業員に屋内退避（窓を閉め換気を止める）または風上・風横への避難を。`);
    if (d(l1)) lines.push(`・風下${d(l1)}まで ${l1.name}（${fmt(l1.ppm)} ppm）：刺激・不快を感じるレベル。苦情・受診相談が増える範囲として広報・相談窓口を準備。`);
    if (!d(l1) && !d(l2) && !d(l3)) lines.push("・設定した基準値を超える範囲は計算上ありません。実測値で確認を続けてください。");
    if (c.idlh) lines.push(`・IDLH ${fmt(c.idlh)} ppm を超えうる区域では、防毒マスク（ろ過式）ではなく SCBA が必要。`);
    lines.push(`・救護所・指揮所は風上または風横に置き、風向の変化（信頼線 ±${(sim.alpha * 180 / Math.PI).toFixed(0)}°）に備える。`);
    for (const o of rcpts) {
      const p = toPpm(o.res.peakOut), pi = toPpm(o.res.peakIn);
      if (p < 1e-3) { lines.push(`・${o.r.name}：計算上は届かない（${o.x <= 0 ? "風上側" : "風横"}）。風向が変われば届くため、信頼線と実測で確認。`); continue; }
      lines.push(`・${o.r.name}：屋外最大 ${fmt(p)} ppm、屋内（換気 ${o.res.ach.toFixed(1)} 回/h）最大 ${fmt(pi)} ppm、到達は発災後 約 ${Math.round((o.res.arrival || 0) / 60)} 分。`);
    }
    lines.push("※推計値。検知器の実測値・風向の変化で随時見直す。");
    return lines.join("\n");
  }

  /* ---------- 地図 ---------- */
  function ll(dx, dy) {
    const lat = st.met.lat, lon = st.met.lon;
    return [lat + dy / 111320, lon + dx / (111320 * Math.cos(lat * Math.PI / 180))];
  }
  function dxy(latlng) {
    const lat = st.met.lat, lon = st.met.lon;
    return [(latlng.lng - lon) * 111320 * Math.cos(lat * Math.PI / 180), (latlng.lat - lat) * 111320];
  }

  function drawMap() {
    const el = $("#map");
    if (!window.L) { el.innerHTML = `<div class="card-b small muted">地図ライブラリを読み込めませんでした（オフライン）。数値の結果は下に表示しています。</div>`; return; }
    if (map) { map.remove(); map = null; }
    const view = window.__cdView;
    map = L.map(el, { zoomControl: true, attributionControl: true });
    const gsi = L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", { maxZoom: 18, attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>' });
    const photo = L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg", { maxZoom: 18, attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>' });
    const blank = L.layerGroup();
    const bases = { "背景なし（距離の目盛のみ）": blank, "地理院地図（淡色）": gsi, "地理院地図（写真）": photo };
    (st.base === "gsi" ? gsi : st.base === "photo" ? photo : blank).addTo(map);
    L.control.layers(bases, null, { collapsed: true }).addTo(map);
    map.on("baselayerchange", e => { st.base = e.layer === gsi ? "gsi" : e.layer === photo ? "photo" : "none"; save(); });
    L.control.scale({ imperial: false }).addTo(map);

    const { sim, L: locsL } = last;
    const th = (st.met.dirFrom + 180) * Math.PI / 180;
    const toLL = (x, y, rot = 0) => { const t = th + rot; return ll(x * Math.sin(t) + y * Math.cos(t), x * Math.cos(t) - y * Math.sin(t)); };
    const poly = (z, rot) => {
      const pts = z.pts;
      const right = pts.map(([x, w]) => toLL(x, w, rot)), left = pts.slice().reverse().map(([x, w]) => toLL(x, -w, rot));
      return [ll(0, 0), ...right, ...left];
    };
    // 距離の目盛（背景なしでも縮尺がわかるように）
    let maxL = 0;
    for (const l of locsL) if (l.zone && l.zone.length > maxL) maxL = l.zone.length;
    for (const r of [100, 500, 1000, 2000, 5000, 10000]) {
      if (r > Math.max(maxL * 1.3, 600) && r > 500) break;
      L.circle(ll(0, 0), { radius: r, color: "#888", weight: 1, dashArray: "2 4", fill: false, interactive: false }).addTo(map);
      L.marker(ll(0, r), { interactive: false, icon: L.divIcon({ className: "", html: `<span class="xs muted">${fmtD(r)}</span>`, iconSize: [50, 14], iconAnchor: [25, 7] }) }).addTo(map);
    }
    const col = { 3: "#d0261d", 2: "#f08a0c", 1: "#e9c400" };
    for (const l of locsL.slice().sort((a, b) => a.level - b.level)) {
      if (!l.zone || !l.zone.length) continue;
      L.polygon(poly(l.zone, 0), { color: col[l.level], weight: 2, fillColor: col[l.level], fillOpacity: 0.3 }).bindTooltip(`${l.name} ${fmt(l.ppm)} ppm：${fmtD(l.zone.length)}`).addTo(map);
    }
    const big = locsL.filter(l => l.zone && l.zone.length).sort((a, b) => b.zone.length - a.zone.length)[0];
    if (big) for (const s of [1, -1]) L.polyline(poly(big.zone, s * sim.alpha), { color: "#444", weight: 1.5, dashArray: "6 5", fill: false, interactive: false }).addTo(map);
    // 風向の矢印
    const arrowLen = Math.max(maxL * 0.25, 150);
    L.polyline([toLL(-arrowLen * 1.2, 0), toLL(-arrowLen * 0.25, 0)], { color: "#1f63b8", weight: 3, interactive: false }).addTo(map);
    L.marker(toLL(-arrowLen * 1.25, 0), { interactive: false, icon: L.divIcon({ className: "", html: `<span class="marker-lbl">風 ${dirName(st.met.dirFrom)} ${st.met.u} m/s →</span>`, iconSize: [130, 20], iconAnchor: [65, 10] }) }).addTo(map);

    const srcM = L.marker(ll(0, 0), { draggable: true, title: "発生源", icon: L.divIcon({ className: "", html: '<div class="src-icon"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }) }).addTo(map).bindTooltip("発生源（ドラッグで移動）");
    srcM.on("dragend", e => { const p = e.target.getLatLng(); const [ox, oy] = dxy(p); st.met.lat = p.lat; st.met.lon = p.lng; st.receptors.forEach(r => { r.dx -= ox; r.dy -= oy; }); window.__cdView = { c: map.getCenter(), z: map.getZoom() }; renderReceptorList(); compute(); });
    st.receptors.forEach((r, i) => {
      const m = L.marker(ll(r.dx, r.dy), { draggable: true, icon: L.divIcon({ className: "", html: `<span class="marker-lbl">● ${esc(r.name)}</span>`, iconSize: null, iconAnchor: [6, 10] }) }).addTo(map);
      m.on("dragend", e => { const [x, y] = dxy(e.target.getLatLng()); r.dx = x; r.dy = y; window.__cdView = { c: map.getCenter(), z: map.getZoom() }; renderReceptorList(); compute(); });
    });
    map.on("click", e => {
      const [x, y] = dxy(e.latlng);
      st.receptors.push({ name: "地点 " + (st.receptors.length + 1), dx: x, dy: y, b: { type: "single", sheltered: false, ach: 1 } });
      window.__cdView = { c: map.getCenter(), z: map.getZoom() };
      renderReceptorList(); compute();
    });
    if (view && !fitNext) map.setView(view.c, view.z);
    else {
      // 最も大きいゾーン（信頼線を含む）と評価地点が収まるように表示する
      const pts = [ll(-300, -300), ll(300, 300), ...st.receptors.map(r => ll(r.dx, r.dy))];
      if (big) for (const s of [1, 0, -1]) pts.push(...poly(big.zone, s * sim.alpha));
      map.fitBounds(L.latLngBounds(pts).pad(0.08));
      fitNext = false;
    }
    window.__cdView = null;
  }

  window.CDSim = { render, setCustom(c) { st.chemId = "custom"; st.custom = c; st.srcType = "direct"; st.loc.family = "custom"; st.loc.custom = [c.pac[2], c.pac[1], c.pac[0]]; save(); } };
})();
