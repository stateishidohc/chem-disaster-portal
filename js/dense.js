/* 重いガスの拡散：Britter & McQuaid (1988) Workbook on the Dispersion of Dense Gases（HSE CRR 17/1988）
 *
 * ALOHA は DEGADIS 系の重いガスモデルを使うが、その再実装は困難なため、HSE の作業手引き（ノモグラム）の
 * 近似式で置き換える。近似式の係数は CCPS (1999) Guidelines for Consequence Analysis of Chemical Releases
 * の表（Zhang et al. 2016 の Table 1、GasDispersion.jl が独立に転記）で照合した。
 * 現地実験との比較（Hanna, Chang & Strimaitis 1993）で、中心線濃度の偏りが ±30% 程度と評価されている。
 *
 *  連続放出（プルーム）：α = log10[(g0'^2·q0/u^5)^(1/5)]、β = log10[x/(q0/u)^(1/2)]
 *  瞬時放出（パフ）    ：α = log10[(g0'·V0^(1/3)/u^2)^(1/2)]、β = log10[x/V0^(1/3)]
 *  g0' = g(ρ0 − ρa)/ρa、u は地上 10 m の風速、q0 = 質量放出率/ρ0、V0 = 放出量/ρ0
 *  非等温の補正（EPA-454/R-92-024 式 5.4-13）：実濃度 c = c'/(c' + (1 − c')·T0/Ta)
 *  最後の等値線（C/C0 = 0.002）より遠方は、濃度が一致する仮想点源からのガウスプルームにつなぐ（パフは C ∝ x^-2 で外挿）
 *  近傍（x' = x/Dc ≤ 30）は C/C0 = 306/(306 + x'^2)（GasDispersion.jl）で、0.1 の等値線へ両対数で直線補間。
 *  プルーム幅：Lh = Dc + 8·lb + 2.5·lb^(1/3)·x^(2/3)、lb = g0'·q0/u^3（同手引き。CCPS 1999 による）
 */
(function (root) {
  "use strict";
  const M = root.CDModel || (typeof require !== "undefined" ? require("./model.js") : null);

  // [α の上限, 傾き, 切片]：β = 傾き·α + 切片
  const PLUME = [
    [0.10,  [[-0.55, 0, 1.75], [-0.14, 0.24, 1.88], [1.0, -0.50, 1.78]]],
    [0.05,  [[-0.68, 0, 1.92], [-0.29, 0.36, 2.16], [-0.18, 0, 2.06], [1.0, -0.56, 1.96]]],
    [0.02,  [[-0.69, 0, 2.08], [-0.31, 0.45, 2.39], [-0.16, 0, 2.25], [1.0, -0.54, 2.16]]],
    [0.01,  [[-0.70, 0, 2.25], [-0.29, 0.49, 2.59], [-0.20, 0, 2.45], [1.0, -0.52, 2.35]]],
    [0.005, [[-0.67, 0, 2.40], [-0.28, 0.59, 2.80], [-0.15, 0, 2.63], [1.0, -0.49, 2.56]]],
    [0.002, [[-0.69, 0, 2.60], [-0.25, 0.39, 2.87], [-0.13, 0, 2.77], [1.0, -0.50, 2.71]]],
  ];
  const PUFF = [
    [0.10,  [[-0.44, 0, 0.70], [0.43, 0.26, 0.81], [1.0, 0, 0.93]]],
    [0.05,  [[-0.56, 0, 0.85], [0.31, 0.26, 1.00], [1.0, -0.12, 1.12]]],
    [0.02,  [[-0.66, 0, 0.95], [0.32, 0.36, 1.19], [1.0, -0.26, 1.38]]],
    [0.01,  [[-0.71, 0, 1.15], [0.37, 0.34, 1.39], [1.0, -0.38, 1.66]]],
    [0.005, [[-0.52, 0, 1.48], [0.24, 0.26, 1.62], [1.0, -0.30, 1.75]]],
    [0.002, [[0.27, 0, 1.83], [1.0, -0.32, 1.92]]],
    [0.001, [[-0.10, 0, 2.075], [1.0, -0.27, 2.05]]],
  ];

  function betaOf(segs, a) {
    for (const [ub, m, b] of segs) if (a <= ub) return m * a + b;
    const [, m, b] = segs[segs.length - 1];
    return m * a + b;
  }

  // 等値線の列 [(log10 x', log10 C/C0)] を作る（x' は無次元距離）
  function contours(table, alpha) {
    const a = Math.min(alpha, 1.0);
    return table.map(([r, segs]) => [betaOf(segs, a), Math.log10(r)]);
  }

  // 無次元距離 xd（= x/Dc または x/V0^(1/3)）での C/C0（等温のチャート値）
  function chartRatio(kind, alpha, xd) {
    if (xd <= 0) return 1;
    const lx = Math.log10(xd);
    const cs = contours(kind === "puff" ? PUFF : PLUME, alpha);
    const near = kind === "puff" ? (x => 3.24 / (3.24 + x * x)) : (x => 306 / (306 + x * x));
    const xNear = kind === "puff" ? 1 : 30;
    if (lx <= cs[0][0]) {
      if (xd <= xNear) return Math.min(1, near(xd));
      // 近傍の式の終点から 0.1 の等値線まで両対数で直線補間
      const l0 = Math.log10(xNear), c0 = Math.log10(near(xNear));
      const f = (lx - l0) / (cs[0][0] - l0);
      return Math.pow(10, c0 + f * (cs[0][1] - c0));
    }
    for (let i = 0; i < cs.length - 1; i++) {
      if (lx <= cs[i + 1][0]) {
        const f = (lx - cs[i][0]) / (cs[i + 1][0] - cs[i][0]);
        return Math.pow(10, cs[i][1] + f * (cs[i + 1][1] - cs[i][1]));
      }
    }
    // 最後の等値線より遠方：C ∝ x^-2 で外挿（α が大きい領域では EPA の外挿式 5.4-10 と一致する）
    const [lb, lr] = cs[cs.length - 1];
    return Math.pow(10, lr - 2 * (lx - lb));
  }

  // 非等温補正：チャート値 c' から実際の体積分率へ
  function nonIso(cp, T0, Ta) { return cp / (cp + (1 - cp) * T0 / Ta); }

  /* 一つの放出段（一定放出率 Q、継続時間 Rd）に対する重いガスの中心線最大濃度（体積分率） */
  function stepModel(Q, Rd, chem, rho0, T0, met, totalMass) {
    const u = met.u10;
    const rhoA = M.P_ATM * M.M_AIR / 1000 / (M.R * met.Tamb);
    const cases = [];
    // ケース 1：放出時の密度・温度のまま（非等温補正あり）
    cases.push({ rho: rho0, T: T0 });
    // ケース 2：熱の授受がすべて発生源で済んだとみなす（雲は気温で、純蒸気の密度）
    cases.push({ rho: M.P_ATM * chem.mw / 1000 / (M.R * met.Tamb), T: met.Tamb });
    const built = cases.map(cs => {
      const g0 = M.G * Math.max(cs.rho - rhoA, 1e-6) / rhoA;
      const q0 = Q / cs.rho;
      const Dc = Math.sqrt(q0 / u);
      const aP = Math.log10(Math.pow(g0 * g0 * q0 / Math.pow(u, 5), 0.2));
      const lb = g0 * q0 / (u * u * u);
      const V0 = (totalMass || Q * Rd) / cs.rho;
      const aF = Math.log10(Math.sqrt(g0 * Math.cbrt(V0) / (u * u)));
      return { ...cs, g0, q0, Dc, aP, lb, V0, aF };
    }).filter(b => b.rho > rhoA && (b.aP >= -0.99 || b.aF >= -0.70));
    // ↑ 空気より軽いケースや、Britter & McQuaid の重いガスの判定（連続：α ≥ 1.2·log10 0.15 ≒ −0.99、瞬時：α ≥ log10 0.2 ≒ −0.70）を満たさない
    //   ケースは受動拡散（ガウス）に任せる
    // 最後の等値線（C/C0 = 0.002）より遠方は、そこで濃度が一致する仮想点源からの受動拡散（ガウス）につなぐ
    const fracPerMg = M.molarVolumeL(met.Tamb) / chem.mw / 1e6;
    const gaussFrac = xx => { const s = M.sigmas(xx, met.stab, met.terrain); return M.chi(Q, u, 0, 0, 0, s.sy, s.sz) * fracPerMg; };
    for (const b of built) {
      const bl = PLUME[PLUME.length - 1][1];
      b.xLast = Math.pow(10, betaOf(bl, Math.min(b.aP, 1))) * b.Dc;
      b.rLast = nonIso(PLUME[PLUME.length - 1][0], b.T, met.Tamb);
      let lo = 1, hi = 1e6;
      for (let i = 0; i < 60; i++) { const m = Math.sqrt(lo * hi); if (gaussFrac(m) > b.rLast) lo = m; else hi = m; }
      b.xVirt = lo;
    }
    // パフも同様に、最後の等値線（0.001）より遠方は仮想点源からのガウスパフ（地表反射、σx は Beals）の最大濃度につなぐ
    const Mtot = totalMass || Q * Rd;
    const puffFrac = xx => { const s = M.sigmas(xx, met.stab, met.terrain); return 2 * Mtot * 1e6 / (Math.pow(2 * Math.PI, 1.5) * s.sx * s.sy * s.sz) * fracPerMg; };
    for (const b of built) {
      const bl = PUFF[PUFF.length - 1][1];
      b.xLastF = Math.pow(10, betaOf(bl, Math.min(b.aF, 1))) * Math.cbrt(b.V0);
      b.rLastF = nonIso(PUFF[PUFF.length - 1][0], b.T, met.Tamb);
      let lo = 1, hi = 1e6;
      for (let i = 0; i < 60; i++) { const m = Math.sqrt(lo * hi); if (puffFrac(m) > b.rLastF) lo = m; else hi = m; }
      b.xVirtF = lo;
    }
    function puffRatio(b, x) {
      if (x <= b.xLastF) return nonIso(chartRatio("puff", b.aF, x / Math.cbrt(b.V0)), b.T, met.Tamb);
      return puffFrac(x - b.xLastF + b.xVirtF);
    }
    function plumeRatio(b, x) {
      if (x <= b.xLast) return nonIso(chartRatio("plume", b.aP, x / b.Dc), b.T, met.Tamb);
      return gaussFrac(x - b.xLast + b.xVirt);
    }
    function ratioAt(x) {
      let best = 0, bestCase = null;
      for (const b of built) {
        const plume = plumeRatio(b, x);
        const puff = puffRatio(b, x);
        const k = u * Rd / Math.max(x, 1);
        // u·Rd/x ≥ 2.5 は連続、≤ 0.6 は瞬時（Britter & McQuaid）。その間は両対数で補間する。
        // （Crowl & Louvar は両方を計算して高い方を採るが、境界で濃度が不連続に跳ぶため、ここでは連続につなぐ）
        let r;
        if (k >= 2.5) r = plume;
        else if (k <= 0.6) r = puff;
        else { const w = Math.log(2.5 / k) / Math.log(2.5 / 0.6); r = Math.exp((1 - w) * Math.log(Math.max(plume, 1e-30)) + w * Math.log(Math.max(puff, 1e-30))); }
        if (r > best) { best = r; bestCase = b; }
      }
      return { r: best, c: bestCase };
    }
    return { built, ratioAt };
  }

  function build({ chem, src, met, dc, segs }) {
    const Ta = met.Tamb;
    const rho0 = dc.rho, T0 = src.T0;
    const steps = segs.map(s => ({ s, m: stepModel(s.Q, s.t1 - s.t0, chem, rho0, T0, met, segs.length === 1 ? src.airborne : null) }));
    const u = met.u10;
    const toMg = frac => frac * 1e6 * chem.mw / M.molarVolumeL(Ta) ;   // 体積分率 → mg/m3（気温で換算）

    // 中心線の最大濃度（各段の最大の和は過大なので、各段の最大値の最大をとる）
    function centerMax(x) {
      let best = 0;
      for (const st of steps) best = Math.max(best, st.m.ratioAt(x).r);
      return best;
    }
    // 受容点の時間変化：各段の中心線濃度 × Palazzi 型の時間係数（最大を 1 に規格化）× 横方向の形
    function conc(x, y, t) {
      if (x <= 0) return 0;
      const s = M.sigmas(x, met.stab, met.terrain);
      let c = 0;
      for (const st of steps) {
        const g = st.s;
        const { r, c: cs } = st.m.ratioAt(x);
        if (r <= 0) continue;
        const peak = M.palazzi(x, (g.t0 + g.t1) / 2 + x / u, u, g.t0, g.t1, s.sx) || 1;
        const f = M.palazzi(x, t, u, g.t0, g.t1, s.sx) / peak;
        const sy = sigmaYeff(x, cs, s.sy);
        c += toMg(r) * f * Math.exp(-0.5 * (y / sy) ** 2);
      }
      return c;
    }
    // プルーム半幅 Lh を、同じ面積のガウス分布の σ に置き換える（σ = 2·Lh/√(2π)）。受動拡散の σy より小さくはしない。
    function sigmaYeff(x, cs, syPassive) {
      if (!cs) return syPassive;
      const Lh = cs.Dc + 8 * cs.lb + 2.5 * Math.cbrt(cs.lb) * Math.pow(x, 2 / 3);
      return Math.max(2 * Lh / Math.sqrt(2 * Math.PI), syPassive);
    }
    function halfWidth(x, cmMg, locMg) {
      const s = M.sigmas(x, met.stab, met.terrain);
      let cs = null, best = 0;
      for (const st of steps) { const q = st.m.ratioAt(x); if (q.r > best) { best = q.r; cs = q.c; } }
      return sigmaYeff(x, cs, s.sy) * Math.sqrt(2 * Math.log(cmMg / locMg));
    }
    const top = steps.reduce((a, b) => (b.s.Q > a.s.Q ? b : a), steps[0]);
    return {
      uAdv: u, conc, centerMax, halfWidth,
      info: top.m.built.map(b => ({ rho: b.rho, T: b.T, g0: b.g0, q0: b.q0, Dc: b.Dc, alphaPlume: b.aP, alphaPuff: b.aF })),
    };
  }

  root.CDDense = { build, chartRatio, PLUME, PUFF, nonIso };
  if (typeof module !== "undefined") module.exports = root.CDDense;
})(typeof window !== "undefined" ? window : globalThis);
