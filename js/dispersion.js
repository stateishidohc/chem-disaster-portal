/* 拡散計算の組み立て：発生源 → 拡散モデルの選択 → 脅威ゾーン・地点の濃度の時間変化
 * 依存：js/model.js（CDModel）、js/dense.js（CDDense：Britter & McQuaid）
 */
(function (root) {
  "use strict";
  const M = root.CDModel || (typeof require !== "undefined" ? require("./model.js") : null);
  const DENSE = () => root.CDDense || (typeof require !== "undefined" ? require("./dense.js") : null);

  const K_VON = 0.4;

  /* ---------- 気象条件の整理 ---------- */
  // met 入力：{ u, zRef, dirFrom(度), Tamb(K), cloud(0–10), terrain('open'|'urban'), stab(手動 or null), lat, lon, date, lid }
  function resolveMet(m) {
    const u10 = M.windAt(10, m.u, m.zRef, "D");
    let stab = m.stab, insol = null, sinPhi = null;
    if (!stab) {
      sinPhi = M.sinSolarAltitude(m.lat, m.lon, m.date);
      insol = M.insolationClass(sinPhi, m.cloud);
      stab = M.pasquillClass(u10, insol, m.cloud);
    }
    const u10s = M.windAt(10, m.u, m.zRef, stab);
    const z0 = m.terrain === "urban" ? M.Z0.urban : M.Z0.open;
    const ustar = K_VON * u10s / Math.log((10 + z0) / z0);   // 中立の対数則（TD p.40）
    return Object.assign({}, m, { stab, insol, sinPhi, u10: u10s, z0, ustar });
  }

  /* ---------- 雲の密度と重いガスの判定（TD §4.4.1） ---------- */
  // 放出直後の雲：温度 T0 の純蒸気（1 atm）＋ミスト（質量分率 a、体積は無視）
  function cloudDensity(chem, src) {
    const rv = M.P_ATM * chem.mw / 1000 / (M.R * src.T0);
    const a = Math.min(src.aerosolFrac || 0, 0.95);
    return rv / (1 - a);
  }
  // ALOHA の摩擦リチャードソン数 Ri = H·ĝ/U*²（ĝ = g(ρ − ρa)/ρa）。Ri ≥ 1 で重いガスとして扱う。
  //  連続放出の代表長 H = √(E·π/(4·ρ·U10))、液だまりは H = E/(ρ·U10·D)。
  function denseCheck(chem, src, met) {
    const rho = cloudDensity(chem, src);
    const rhoA = M.P_ATM * M.M_AIR / 1000 / (M.R * met.Tamb);
    const gh = M.G * (rho - rhoA) / rhoA;
    const E = Math.max(...src.segments.map(s => s.Q));
    let H;
    if (src.kind === "pool" && src.pool) {
      const D = Math.sqrt(4 * src.pool.area / Math.PI);
      H = E / (rho * met.u10 * D);
    } else {
      H = Math.sqrt(E * Math.PI / (4 * rho * met.u10));
    }
    const Ri = gh > 0 ? H * gh / (met.ustar * met.ustar) : 0;
    return { rho, rhoA, gh, H, Ri, dense: Ri >= 1 };
  }

  /* ---------- 一つの計算ケース ---------- */
  // 戻り値 sim：{ met, src, model, centerMax(x), conc(x, y, t), ... }
  function buildSim(inp) {
    const met = resolveMet(inp.met);
    const chem = inp.chem;
    const src = inp.source;
    const dc = denseCheck(chem, src, met);
    let model = inp.model === "gauss" ? "gauss" : inp.model === "dense" ? "dense" : (dc.dense ? "dense" : "gauss");
    const H = model === "dense" ? 0 : (inp.releaseHeight || 0);
    const zr = inp.receptorHeight || 0;
    const uRel = M.windAt(Math.max(H, 2), met.u, met.zRef, met.stab);
    const segs = src.segments;
    const lid = met.lid || 0;

    let denseModel = null;
    if (model === "dense") {
      const D = DENSE();
      denseModel = D ? D.build({ chem, src, met, dc, segs }) : null;
      if (!denseModel) model = "gauss";
    }

    // 時刻 t・地点 (x, y) の濃度 mg/m3
    function concGauss(x, y, t) {
      if (x <= 0) return 0;
      const s = M.sigmas(x, met.stab, met.terrain);
      let c = 0;
      for (const g of segs) {
        const f = M.palazzi(x, t, uRel, g.t0, g.t1, s.sx);
        if (f > 0) c += f * M.chi(g.Q, uRel, y, zr, H, s.sy, s.sz, lid);
      }
      return c;
    }
    // 重いガスでも、遠方で受動拡散（ガウス）の方が高くなればそちらを採る（希釈後は受動的にふるまうため）
    const conc = model === "dense" ? (x, y, t) => Math.max(denseModel.conc(x, y, t), concGauss(x, y, t)) : concGauss;

    // 地点 (x, y) の最大濃度（TD §4.5.1：最大放出段の中央時刻 + x/u から 30 秒刻みで山を登る）
    function maxAt(x, y) {
      if (x <= 0) return 0;
      const top = segs.reduce((a, b) => (b.Q > a.Q ? b : a), segs[0]);
      const u = model === "dense" ? denseModel.uAdv : uRel;
      let t = (top.t0 + top.t1) / 2 + x / u;
      let c = conc(x, y, t);
      for (const dir of [1, -1]) {
        let tt = t, cc = c;
        for (let i = 0; i < 400; i++) {
          const n = conc(x, y, tt + dir * 30);
          if (n <= cc) break;
          tt += dir * 30; cc = n;
        }
        if (cc > c) { c = cc; t = tt; }
      }
      return c;
    }

    // 風下距離 x での「中心線の最大濃度」と「その濃度から LOC までの横幅」
    function halfWidth(x, locMg) {
      const cm = maxAt(x, 0);
      if (cm <= locMg) return 0;
      const s = M.sigmas(x, met.stab, met.terrain);
      const wg = s.sy * Math.sqrt(2 * Math.log(cm / locMg));
      return model === "dense" ? Math.max(wg, denseModel.halfWidth(x, cm, locMg)) : wg;
    }

    // 脅威ゾーン：中心線の最大濃度 = LOC となる距離を二分探索し、横幅を求める（TD §4.5.2）
    function zone(locMg) {
      const xs = [];
      for (let x = 10; x <= M.MAX_DIST * 1.2; x *= 1.08) xs.push(x);
      let last = null;
      for (const x of xs) { if (maxAt(x, 0) >= locMg) last = x; }
      if (last === null) return { length: 0, pts: [] };
      let lo = last, hi = last * 1.08;
      for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (maxAt(m, 0) >= locMg) lo = m; else hi = m; }
      const L = Math.min(lo, M.MAX_DIST);
      const n = 36, pts = [];
      for (let i = 1; i <= n; i++) {
        const x = L * Math.pow(i / n, 1.6);
        pts.push([x, halfWidth(x, locMg)]);
      }
      pts[pts.length - 1][1] = 0;
      const maxW = Math.max(...pts.map(p => p[1]));
      return { length: L, truncated: lo > M.MAX_DIST, pts, maxHalfWidth: maxW, short: L < M.MIN_ZONE };
    }

    // 風向の信頼線の角度 α = arctan(2σy / (300·U3))、σy は 5 分間に流れる距離 300·U3 での値（TD §4.5.3）
    const u3 = M.windAt(3, met.u, met.zRef, met.stab);
    const sAlpha = M.sigmas(300 * u3, met.stab, met.terrain);
    const alpha = Math.atan(2 * sAlpha.sy / (300 * u3));

    // 地点の時系列（屋外・屋内）と時間加重平均の最大値
    function receptor(x, y, building, tMax) {
      tMax = tMax || 8 * 3600;
      const dt = 30;
      const ach = M.airChangesPerHour(building, met);
      const k = ach / 3600;
      const out = [], ind = [];
      let ci = 0;
      for (let t = 0; t <= tMax; t += dt) {
        const co = conc(x, y, t);
        out.push(co);
        ind.push(ci);
        ci += (co - ci) * (1 - Math.exp(-k * dt));
      }
      const twa = arr => [10, 30, 60, 240, 480].map(mins => maxRunningAvg(arr, mins * 60 / dt));
      return { dt, ach, out, ind, peakOut: Math.max(...out), peakIn: Math.max(...ind), twaOut: twa(out), twaIn: twa(ind),
        arrival: firstAbove(out, Math.max(...out) * 0.01, dt) };
    }

    return { met, chem, src, dc, model, H, uRel, conc, maxAt, zone, alpha, receptor, denseModel };
  }

  function maxRunningAvg(arr, w) {
    w = Math.max(1, Math.round(w));
    let s = 0, best = 0;
    for (let i = 0; i < arr.length; i++) {
      s += arr[i];
      if (i >= w) s -= arr[i - w];
      best = Math.max(best, s / w);       // 窓に満たない間も窓幅で割る（0 を含む平均）
    }
    return best;
  }
  function firstAbove(arr, v, dt) {
    for (let i = 0; i < arr.length; i++) if (arr[i] > v && v > 0) return i * dt;
    return null;
  }

  /* ---------- 基準値（LOC）の選び方 ---------- */
  // ALOHA 既定：60 分 AEGL → ERPG → PAC（TEEL を含む）→ IDLH（NOAA "Toxic Levels of Concern"）
  const AEGL_T = [10, 30, 60, 240, 480];
  function defaultLocs(chem, family, minutes) {
    const out = [];
    for (const lv of [3, 2, 1]) out.push(pickLoc(chem, family, lv, minutes));
    return out;
  }
  function pickLoc(chem, family, lv, minutes) {
    const ti = AEGL_T.indexOf(minutes || 60);
    const cand = [];
    if (family === "AEGL" || family === "auto") cand.push(["AEGL-" + lv + "（" + label(minutes || 60) + "）", chem.aegl && chem.aegl[lv] ? chem.aegl[lv][ti < 0 ? 2 : ti] : null]);
    if (family === "ERPG" || family === "auto") cand.push(["ERPG-" + lv, chem.erpg ? chem.erpg[lv - 1] : null]);
    if (family === "PAC" || family === "auto") cand.push(["PAC-" + lv, chem.pac ? chem.pac[lv - 1] : null]);
    for (const [name, v] of cand) if (v != null) return { level: lv, name, ppm: v };
    return { level: lv, name: family === "auto" ? "設定なし" : family + "-" + lv + "：設定なし", ppm: null };
  }
  function label(m) { return m < 60 ? m + "分" : (m / 60) + "時間"; }

  root.CDDisp = { resolveMet, cloudDensity, denseCheck, buildSim, defaultLocs, pickLoc, AEGL_T, maxRunningAvg, label };
  if (typeof module !== "undefined") module.exports = root.CDDisp;
})(typeof window !== "undefined" ? window : globalThis);
