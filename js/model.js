/* 化学物質拡散の計算エンジン（画面に依存しない純粋関数）
 *
 * 方針：NOAA/EPA ALOHA 5.4.4 の技術文書（Jones et al. 2013, NOAA TM NOS OR&R 43。以下 TD）と
 *       同じ枠組み・係数を使い、ALOHA が独自に持つ部分（DEGADIS 系の重いガス、Brighton の蒸発）は
 *       査読・公的な代替式（Britter & McQuaid 1988、EPA RMP 2009）に置き換える。
 * 単位：長さ m、時間 s、質量 kg、温度 K、圧力 Pa、濃度は内部で mg/m3（表示時に ppm へ換算）。
 * ブラウザでは window.CDModel、Node（tests/）では module.exports で使う。
 */
(function (root) {
  "use strict";

  const R = 8.314462618;      // J/(mol·K)
  const G = 9.80665;          // m/s2
  const P_ATM = 101325;       // Pa
  const M_AIR = 28.966;       // g/mol
  const MAX_DUR = 3600;       // 放出は最長 60 分（TD §3.1）
  const MAX_DIST = 10000;     // 10 km より先は計算しない（ALOHA User's Manual）
  const MIN_ZONE = 50;        // 50 m 未満の脅威ゾーンは近傍の濃度むらで信頼できない（NOAA "ALOHA's Limitations"）

  const STAB = ["A", "B", "C", "D", "E", "F"];

  /* ---------- 単位換算 ---------- */

  function molarVolumeL(Tk, P) { return 22.414 * (Tk / 273.15) * (P_ATM / (P || P_ATM)); }
  function ppmToMg(ppm, mw, Tk, P) { return ppm * mw / molarVolumeL(Tk, P); }
  function mgToPpm(mg, mw, Tk, P) { return mg * molarVolumeL(Tk, P) / mw; }

  /* ---------- 気象（TD §4.2.1） ---------- */

  // 太陽高度の正弦。TD p.37–38 の式（赤緯は簡易式、時角は経度から）。
  function sinSolarAltitude(latDeg, lonDeg, date) {
    const rad = Math.PI / 180;
    const start = Date.UTC(date.getUTCFullYear(), 0, 0);
    const J = Math.floor((date.getTime() - start) / 86400000);
    const Z = date.getUTCHours() + date.getUTCMinutes() / 60;
    const delta = 23.45 * rad * Math.sin(rad * 0.986 * (J - 80));
    const hs = rad * 15 * (12 - (Z + lonDeg / 15));
    const lat = latDeg * rad;
    return Math.sin(lat) * Math.sin(delta) + Math.cos(lat) * Math.cos(delta) * Math.cos(hs);
  }

  // 地表の日射量 Fs [W/m2]（Raphael 1962、TD p.37）。cloud は雲量（10 分率 0–10）。
  function solarFlux(sinPhi, cloud) {
    return sinPhi > 0.1 ? 1111 * (1 - 0.0071 * cloud * cloud) * (sinPhi - 0.1) : 0;
  }

  // 日射の区分：強 > 851、中 526–851、弱 176–526 W/m2（TD p.37）。全天曇り（雲量 10）は中立。
  // 夜は「日没 1 時間前〜日の出 1 時間後」。ここでは太陽高度の正弦 ≤ 0.1（およそ高度 6° 未満）を夜とみなす。
  function insolationClass(sinPhi, cloud) {
    if (cloud >= 10) return "overcast";
    if (sinPhi <= 0.1) return "night";
    const F = solarFlux(sinPhi, cloud);
    return F > 851 ? "strong" : F > 526 ? "moderate" : "slight";
  }

  // パスキル安定度（TD Table 10, Turner 1994）。風速は地上 10 m。
  // 2 つの区分が当てはまる欄（A–B など）は ALOHA と同じく安定側（後の文字）を採る。
  function pasquillClass(u10, insol, cloud) {
    if (insol === "overcast") return "D";
    const i = u10 < 2 ? 0 : u10 < 3 ? 1 : u10 < 5 ? 2 : u10 < 6 ? 3 : 4;
    const table = {
      strong:   ["A", "B", "B", "C", "C"],
      moderate: ["B", "B", "C", "D", "D"],
      slight:   ["B", "C", "C", "D", "D"],
      nightCloudy: ["E", "E", "D", "D", "D"],   // 雲量 > 50%
      nightClear:  ["F", "F", "E", "D", "D"],   // 雲量 < 50%
    };
    if (insol === "night") return table[cloud > 5 ? "nightCloudy" : "nightClear"][i];
    return table[insol][i];
  }

  // 風速の高さ補正：べき乗則 U2 = U1 (z2/z1)^n。指数は TD p.41 に示された z0 = 15 cm の典型値。
  const POWER_N = { A: 0.108, B: 0.112, C: 0.120, D: 0.142, E: 0.203, F: 0.253 };
  function windAt(z, uRef, zRef, stab) {
    return uRef * Math.pow(Math.max(z, 0.5) / zRef, POWER_N[stab]);
  }

  // 地表面粗度 z0 [m]（TD p.40）
  const Z0 = { open: 0.03, urban: 1.0 };

  /* ---------- 拡散幅（TD §4.3, Table 13） ---------- */
  // σy = sy1·x/√(1+sy2·x) は粗度によらず田園の係数（TD p.44）。
  // σz は z0 < 20 cm で田園、それ以上で都市の係数。σx = sx1·x^sx2（Beals 1971）。
  const SIG = {
    sx1: { A: 0.02, B: 0.02, C: 0.02, D: 0.04, E: 0.17, F: 0.17 },
    sx2: { A: 1.22, B: 1.22, C: 1.22, D: 1.14, E: 0.97, F: 0.97 },
    sy1: { A: 0.22, B: 0.16, C: 0.11, D: 0.08, E: 0.06, F: 0.04 },
    rural: { A: [0.20, 0, 0], B: [0.12, 0, 0], C: [0.08, 0.0002, -0.5], D: [0.06, 0.0015, -0.5], E: [0.03, 0.0003, -1], F: [0.016, 0.0003, -1] },
    urban: { A: [0.24, 0.001, 0.5], B: [0.24, 0.001, 0.5], C: [0.20, 0, 0], D: [0.14, 0.0003, -0.5], E: [0.08, 0.0015, -0.5], F: [0.08, 0.0015, -0.5] },
  };
  function sigmas(x, stab, terrain) {
    x = Math.max(x, 1);
    const sy = SIG.sy1[stab] * x / Math.sqrt(1 + 0.0001 * x);
    const [a, b, c] = SIG[terrain === "urban" ? "urban" : "rural"][stab];
    const sz = a * x * Math.pow(1 + b * x, c);
    const sx = SIG.sx1[stab] * Math.pow(x, SIG.sx2[stab]);
    return { sx, sy, sz };
  }

  /* ---------- ガウスプルーム（TD §4.3） ---------- */

  // 定常濃度 chi（地表面反射、任意で混合層上端の反射 J = 5）。Q kg/s → mg/m3。
  function chi(Q, u, y, z, H, sy, sz, lid) {
    const gy = Math.exp(-0.5 * (y / sy) ** 2) / (Math.sqrt(2 * Math.PI) * sy);
    let gz;
    if (lid && sz >= 2 * lid) {
      gz = 1 / lid;                       // σz ≥ 2hi では混合層内で鉛直一様
    } else {
      const e = d => Math.exp(-0.5 * (d / sz) ** 2);
      let s = e(z - H) + e(z + H);
      if (lid) for (let n = 1; n <= 5; n++) s += e(z - 2 * n * lid - H) + e(z + 2 * n * lid - H) + e(z - 2 * n * lid + H) + e(z + 2 * n * lid + H);
      gz = s / (Math.sqrt(2 * Math.PI) * sz);
    }
    return Q * 1e6 / u * gy * gz;
  }

  // 有限時間放出の時間係数（Palazzi et al. 1982、TD p.42）。区間 [t0, t1] の放出が時刻 t に与える割合。
  function palazzi(x, t, u, t0, t1, sx) {
    if (t <= t0) return 0;
    const s = Math.SQRT2 * sx;
    const tr = t1 - t0, tt = t - t0;
    const a = tt <= tr ? erf(x / s) : erf((x - u * (tt - tr)) / s);
    return Math.max(0, 0.5 * (a - erf((x - u * tt) / s)));
  }

  function erf(x) {
    // Abramowitz & Stegun 7.1.26（誤差 < 1.5e-7）
    const s = x < 0 ? -1 : 1; x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }

  /* ---------- 物性 ---------- */

  // 蒸気圧：NIST WebBook の Antoine 式 log10(P/bar) = A − B/(T + C)。範囲外は最寄りの式で外挿。
  // 温度範囲が重なるときは上側の式（貯蔵温度側）を使う
  function pickAntoine(chem, T) {
    const set = chem.antoine;
    if (!set || !set.length) return null;
    let best = null, dist = Infinity;
    for (const a of set) {
      const d = T < a.tmin ? a.tmin - T : T > a.tmax ? T - a.tmax : 0;
      if (d < dist || (d === dist && best && a.tmax > best.tmax)) { dist = d; best = a; }
    }
    return best;
  }
  function vaporPressure(chem, T) {
    const a = pickAntoine(chem, T);
    return a ? Math.pow(10, a.A - a.B / (T + a.C)) * 1e5 : NaN;
  }

  // 蒸発熱 [J/kg]：Antoine 式を Clausius–Clapeyron の式で微分した値 L = R·T²·ln10·B/(T + C)² / M
  function heatOfVaporization(chem, T) {
    const a = pickAntoine(chem, T);
    return R * T * T * Math.LN10 * a.B / ((T + a.C) ** 2) / (chem.mw / 1000);
  }

  // 標準沸点：蒸気圧 = 1 atm となる温度
  function boilingPoint(chem) {
    if (chem.tb) return chem.tb;
    let lo = 50, hi = 600;
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (vaporPressure(chem, m) > P_ATM) hi = m; else lo = m; }
    return (lo + hi) / 2;
  }

  /* ---------- 発生源（TD 3 章） ---------- */
  // 出力：{ kind, segments: [{t0, t1, Q}], total, airborne, T0（放出直後の雲の温度）, aerosolFrac, notes[] }

  // ① 直接放出：放出率と継続時間を利用者が指定（TD §3.2）。継続時間 1 分以下は「瞬時」= 1 分の放出。
  function sourceDirect(p) {
    const dur = Math.max(60, Math.min(p.duration, MAX_DUR));
    const notes = [];
    if (p.duration > MAX_DUR) notes.push("放出時間は 60 分で打ち切って計算しています（ALOHA と同じ扱い）。");
    if (p.duration < 60) notes.push("1 分未満の放出は ALOHA と同じく「1 分間の放出」として扱います。");
    const rate = p.mass ? p.mass / dur : p.rate;
    return { kind: "direct", segments: [{ t0: 0, t1: dur, Q: rate }], total: rate * dur, airborne: rate * dur, T0: p.Tamb, aerosolFrac: 0, notes };
  }

  // ② 加圧液化ガス（アンモニア・塩素など）の容器・配管からの漏えい
  //  均質非平衡モデル（Henry & Fauske 1971; Fauske 1985。TD §3.4.5 p.27）
  //    G = Lc/(vg − vl) · (N·cp·T)^(−1/2)
  //    N = Lc²·vl / (2·ΔP·Cd²·(vg − vl)²·T·cp) + l/le   （le = 0.1 m、穴は l = 0、短管・配管破断は l = 0.1 m）
  //  ALOHA は雨落ち（液だまり）を作らず、沸点まで断熱フラッシュした残りを微細ミストとして雲に含める（TD p.28）。
  //  ここでも既定はそれに合わせ、比較のため「フラッシュ率の 2 倍だけ空中に残る」経験則（CCPS 1999）も選べる。
  function sourceLiquefied(p) {
    const c = p.chem, T = p.Tstore, Tb = boilingPoint(c);
    const notes = [];
    if (T <= Tb + 0.5) {
      notes.push("貯蔵温度が沸点以下のため、加圧液化ガスではなく液体の漏えい（液だまり蒸発）として計算しました。");
      const r = sourcePool(p);
      r.notes = notes.concat(r.notes);
      return r;
    }
    const Psat = vaporPressure(c, T);
    const A = Math.PI * (p.holeD / 2) ** 2;
    const vl = 1 / c.rhoL, cp = c.cpL, Cd = 0.61;
    const vg = R * T / (Psat * c.mw / 1000);
    const vfg = vg - vl;
    const Lc = heatOfVaporization(c, T);
    const dP = Math.max(Psat - P_ATM, 1) + c.rhoL * G * (p.liquidHead || 0);
    const l = p.path === "pipe" ? 0.1 : 0;
    const N = Lc * Lc * vl / (2 * dP * Cd * Cd * vfg * vfg * T * cp) + l / 0.1;
    const Gm = Lc / vfg / Math.sqrt(N * cp * T);
    const Qm = Gm * A;
    notes.push(`${p.path === "pipe" ? "配管破断（短管）" : "容器の穴"}：均質非平衡二相流モデルで流出率 ${Qm.toFixed(1)} kg/s（貯蔵圧 ${(Psat / 1e5).toFixed(1)} bar abs）。`);

    const Lb = heatOfVaporization(c, Tb);
    const Fv = Math.min(1, 1 - Math.exp(-cp * (T - Tb) / Lb));
    const fAir = p.airborneRule === "2x" ? Math.min(1, 2 * Fv) : 1;
    const durFull = p.mass / Qm;
    const dur = Math.min(Math.max(durFull, 60), MAX_DUR);
    if (durFull > MAX_DUR) notes.push(`全量の流出に約 ${Math.round(durFull / 60)} 分かかります。計算は最初の 60 分で打ち切っています。`);
    const segs = [{ t0: 0, t1: dur, Q: Math.min(Qm, p.mass / dur) * fAir }];
    let pool = null;
    if (fAir < 1) {
      const rain = Math.min(Qm * dur, p.mass) * (1 - fAir);
      pool = poolEvaporation({ chem: c, mass: rain, Tliq: Tb, u: p.u10, area: p.dikeArea });
      const tPool = Math.max(dur, rain / pool.rate);
      segs.push({ t0: 0, t1: Math.min(tPool, MAX_DUR), Q: rain / tPool });
      notes.push(`フラッシュ率 ${(Fv * 100).toFixed(0)}%。空中に残る割合を 2 倍則で ${(fAir * 100).toFixed(0)}% とし、残りは沸点の液だまりからの蒸発（EPA RMP 式）として加算。`);
    } else {
      notes.push(`フラッシュ率 ${(Fv * 100).toFixed(0)}%。残り ${((1 - Fv) * 100).toFixed(0)}% は微細ミストとして雲に含まれる（液だまりを作らない ALOHA と同じ安全側の扱い）。`);
    }
    // 雲の初期密度：沸点の蒸気＋ミスト（ミストは液密度で体積はほぼ無視できるので質量だけ加わる）
    const mistFrac = fAir === 1 ? 1 - Fv : Math.max(0, fAir - Fv) / fAir;
    return {
      kind: "liquefied", segments: mergeSegments(segs), total: Math.min(Qm * dur, p.mass),
      airborne: segs.reduce((s, x) => s + x.Q * (x.t1 - x.t0), 0),
      outflow: Qm, flash: Fv, airFrac: fAir, T0: Tb, aerosolFrac: mistFrac, Psat, duration: dur, pool, notes,
    };
  }

  // ③ 圧縮ガス容器からの漏えい：チョーク流／非チョーク流（LEAKR、TD §3.4.6 p.28–30）。
  //  容器内は等温として放出率の指数減衰を 5 段階の一定放出率で近似（ALOHA も最大 5 段階に平均化）。
  function sourceGasTank(p) {
    const c = p.chem, T = p.Tstore, P0 = p.pressure;
    const g = c.gamma || 1.3, M = c.mw / 1000, Cd = 0.61;
    const A = Math.PI * (p.holeD / 2) ** 2;
    const rho = P0 * M / (R * T);
    const Rc = Math.pow(2 / (g + 1), g / (g - 1));
    const Rp = P_ATM / P0;
    const choked = Rp <= Rc;
    const Q0 = choked
      ? Cd * A * Math.sqrt(rho * P0 * g * Math.pow(2 / (g + 1), (g + 1) / (g - 1)))
      : Cd * A * Math.sqrt(2 * rho * P0 * g / (g - 1) * (Math.pow(Rp, 2 / g) - Math.pow(Rp, (g + 1) / g)));
    const m0 = rho * p.volume;
    const tau = m0 / Q0;
    const tEnd = Math.min(Math.max(3 * tau, 60), MAX_DUR);
    const segs = [];
    for (let i = 0; i < 5; i++) {
      const a = tEnd * i / 5, b = tEnd * (i + 1) / 5;
      segs.push({ t0: a, t1: b, Q: m0 * (Math.exp(-a / tau) - Math.exp(-b / tau)) / (b - a) });
    }
    const Tg = T * Math.pow(P0 / P_ATM, (1 - g) / g);
    return {
      kind: "gas", segments: segs, total: m0, airborne: m0 * (1 - Math.exp(-tEnd / tau)), outflow: Q0,
      T0: Math.max(Tg, 150), aerosolFrac: 0,
      notes: [`初期放出率 ${Q0.toFixed(2)} kg/s（${choked ? "チョーク流＝音速での噴出" : "非チョーク流"}）、容器内の気体 ${m0.toFixed(0)} kg。圧力低下とともに放出率が下がります。`],
    };
  }

  // ④ 液だまりからの蒸発：EPA RMP Offsite Consequence Analysis Guidance (2009) 付録 D の式 D-1
  //    QR [lb/min] = 0.284 · U^0.78 · MW^(2/3) · A[ft2] · VP[mmHg] / (82.05 · T)
  //  防液堤がなければ厚さ 1 cm まで広がると仮定（同ガイダンス）。
  //  ※ALOHA は Brighton (1985) の物質移動式と熱収支を使う。こちらは規制当局の簡易式で、置き換えを明記する。
  function poolEvaporation(p) {
    const c = p.chem;
    const T = p.Tliq;
    const vp = Math.min(vaporPressure(c, T), P_ATM) / 133.322;
    const vol = p.mass / c.rhoL;
    const area = p.area && p.area > 0 ? Math.min(p.area, vol / 0.001) : vol / 0.01;
    const lbmin = 0.284 * Math.pow(Math.max(p.u, 0.5), 0.78) * Math.pow(c.mw, 2 / 3) * (area * 10.7639) * vp / (82.05 * T);
    return { rate: lbmin * 0.453592 / 60, area, vp };
  }

  function sourcePool(p) {
    const c = p.chem;
    const Tliq = Math.min(p.Tstore, boilingPoint(c));
    const ev = poolEvaporation({ chem: c, mass: p.mass, Tliq, u: p.u10, area: p.dikeArea });
    const durFull = p.mass / ev.rate;
    const dur = Math.min(Math.max(durFull, 60), MAX_DUR);
    const notes = [`液だまり面積 ${ev.area.toFixed(0)} m²${p.dikeArea ? "（防液堤内）" : "（厚さ 1 cm まで広がると仮定）"}、液温 ${(Tliq - 273.15).toFixed(1)} ℃ の蒸気圧 ${ev.vp.toFixed(0)} mmHg、蒸発率 ${ev.rate.toFixed(2)} kg/s。`];
    if (durFull > MAX_DUR) notes.push(`蒸発は約 ${Math.round(durFull / 60)} 分続きます。計算は 60 分で打ち切っています。`);
    return { kind: "pool", segments: [{ t0: 0, t1: dur, Q: Math.min(ev.rate, p.mass / dur) }], total: p.mass, airborne: Math.min(ev.rate * dur, p.mass), T0: Tliq, aerosolFrac: 0, pool: ev, notes };
  }

  function mergeSegments(segs) {
    const ts = [...new Set(segs.flatMap(s => [s.t0, s.t1]))].sort((a, b) => a - b);
    const out = [];
    for (let i = 0; i < ts.length - 1; i++) {
      const a = ts[i], b = ts[i + 1], mid = (a + b) / 2;
      const q = segs.filter(s => s.t0 <= mid && s.t1 >= mid).reduce((s, x) => s + x.Q, 0);
      if (q > 0) out.push({ t0: a, t1: b, Q: q });
    }
    return out;
  }

  /* ---------- 屋内濃度（TD §4.6、Wilson 1987 の 1 室モデル） ---------- */
  // dCi/dt = (Co − Ci)/τE、τE = √(Vs²/(Qs² + Qw²))
  //  Qs = Ae·fs·√|ΔT|、fs = ((1 + R/2)/3)·√(g·Hs/Ti)、Qw = Ae·Csh·(1 − R)^(1/3)·U_H
  //  Ae = 0.00059 × 床面積 160 m²、Hs = 2.5 m（平屋）/ 5 m（2 階建て）、Ti = 20 ℃、R = 0.5、Csh = 0.24（遮へいあり）/ 0.32（なし）
  function airChangesPerHour(b, met) {
    if (b.type === "ach") return b.ach;
    if (b.type === "office") return 0.5;
    const floor = 160, Ae = 0.00059 * floor, Rr = 0.5, Ti = 293.15;
    const Hs = b.type === "double" ? 5 : 2.5;
    const Csh = b.sheltered ? 0.24 : 0.32;
    const fs = ((1 + Rr / 2) / 3) * Math.sqrt(G * Hs / Ti);
    const Qs = Ae * fs * Math.sqrt(Math.abs(Ti - met.Tamb));
    const UH = windAt(Hs, met.u, met.zRef, met.stab);
    const Qw = Ae * Csh * Math.pow(1 - Rr, 1 / 3) * UH;
    const tau = (floor * Hs) / Math.sqrt(Qs * Qs + Qw * Qw);
    return 3600 / tau;
  }

  /* ---------- 爆風圧（TNT 換算） ---------- */
  // 蒸気雲爆発の TNT 換算量 W = η·m·ΔHc / E_TNT（E_TNT = 4,680 kJ/kg、η は爆発効率。EPA RMP の最悪ケースは 10%）
  // 入射過圧と換算距離 Z = R / W^(1/3) の関係は Kinney & Graham (1985) の式：
  //   ps/pa = 808·[1 + (Z/4.5)²] / √{[1 + (Z/0.048)²]·[1 + (Z/0.32)²]·[1 + (Z/1.35)²]}
  // ALOHA は BST 法を使う（TD §5）。こちらは公開の簡易法による置き換え。
  const E_TNT = 4.68e6;
  function tntMass(massFuel, hcMJ, eta) { return eta * massFuel * hcMJ * 1e6 / E_TNT; }
  function kinneyGraham(Z) {
    return 808 * (1 + (Z / 4.5) ** 2) / Math.sqrt((1 + (Z / 0.048) ** 2) * (1 + (Z / 0.32) ** 2) * (1 + (Z / 1.35) ** 2));
  }
  // 過圧 [kPa] が p となる距離 [m]。Kinney & Graham は空中爆発の式なので、地表での爆発は地面の反射で
  // 換算量を 2 倍にする（ALOHA の BST 法の反射係数 2 と同じ）。この扱いで 1 psi の換算距離は 16.9 m/kg^(1/3) となり、
  // EPA RMP ガイダンスの 1 psi 距離の式 D = 17·(0.1·W·ΔHc/ΔHc,TNT)^(1/3) とほぼ一致する。
  function blastDistance(Wtnt, pKPa, reflect = 2) {
    const target = pKPa * 1000 / P_ATM;
    let lo = 0.05, hi = 500;
    for (let i = 0; i < 80; i++) { const m = Math.sqrt(lo * hi); if (kinneyGraham(m) > target) lo = m; else hi = m; }
    return lo * Math.cbrt(Wtnt * reflect);
  }
  const PSI = 6.894757;   // kPa

  root.CDModel = Object.assign(root.CDModel || {}, {
    tntMass, kinneyGraham, blastDistance, PSI, E_TNT,
    R, G, P_ATM, M_AIR, STAB, MAX_DUR, MAX_DIST, MIN_ZONE, Z0, POWER_N, SIG,
    molarVolumeL, ppmToMg, mgToPpm,
    sinSolarAltitude, solarFlux, insolationClass, pasquillClass, windAt, sigmas,
    chi, palazzi, erf,
    vaporPressure, heatOfVaporization, boilingPoint,
    sourceDirect, sourceLiquefied, sourceGasTank, sourcePool, poolEvaporation, mergeSegments,
    airChangesPerHour,
  });
  if (typeof module !== "undefined") module.exports = root.CDModel;
})(typeof window !== "undefined" ? window : globalThis);
