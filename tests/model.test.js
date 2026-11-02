/* 計算エンジンの検査：node tests/model.test.js（失敗があれば終了コード 1） */
global.window = global;
require("../data/chemicals.js");
const M = require("../js/model.js");
require("../js/dense.js");
const D = require("../js/dispersion.js");
let fail = 0;
const ok = (cond, msg) => { console.log((cond ? "OK   " : "FAIL ") + msg); if (!cond) fail++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.abs(b);
const C = id => CD.CHEMICALS.find(c => c.id === id);
const nh3 = C("ammonia");

// 物性：NIST Antoine から求めた蒸気圧・蒸発熱が文献値と合う
ok(near(M.vaporPressure(nh3, 293.15) / 1e5, 8.57, 0.03), "アンモニア 20℃ の蒸気圧 ≒ 8.57 bar");
ok(near(M.heatOfVaporization(nh3, 239.8) * nh3.mw / 1e6, 23.33, 0.02), "アンモニアの蒸発熱（沸点）≒ 23.3 kJ/mol");
ok(near(M.vaporPressure(C("chlorine"), 293.15) / 1e5, 6.8, 0.04), "塩素 20℃ の蒸気圧 ≒ 6.8 bar");
ok(near(M.boilingPoint({ antoine: C("sulfur_dioxide").antoine, mw: 64 }), 263.1, 0.005), "二酸化硫黄の沸点 ≒ −10 ℃");

// 拡散幅：ALOHA TD Table 13（田園 D、x = 1000 m）
const s = M.sigmas(1000, "D", "rural");
ok(near(s.sy, 0.08 * 1000 / Math.sqrt(1.1), 1e-9) && near(s.sz, 0.06 * 1000 * Math.pow(2.5, -0.5), 1e-9), "Briggs 田園 D の σy・σz");
ok(near(M.sigmas(1000, "D", "urban").sy, s.sy, 1e-9), "σy は粗度によらず田園の係数（TD p.44）");

// 質量保存：断面で濃度×風速を積分すると放出率
let tot = 0; const u = 3, dy = 1, dz = 0.5;
for (let y = -600; y <= 600; y += dy) for (let z = dz / 2; z <= 400; z += dz) tot += M.chi(1, u, y, z, 0, s.sy, s.sz) * dy * dz;
ok(near(tot * u / 1e6, 1, 0.01), "ガウスプルームの質量保存（1 kg/s）");

// Palazzi：十分長い放出では定常値、放出前は 0
ok(near(M.palazzi(500, 1800, 3, 0, 3600, 50), 1, 1e-3) && M.palazzi(500, 0, 3, 0, 3600, 50) === 0, "有限時間放出の時間係数");

// 安定度表（TD Table 10）
ok(M.pasquillClass(1.5, "strong", 0) === "A" && M.pasquillClass(2.5, "strong", 0) === "B" && M.pasquillClass(4, "moderate", 0) === "C" && M.pasquillClass(1.5, "night", 2) === "F" && M.pasquillClass(4, "night", 8) === "D", "パスキル安定度の判定");

// 液化アンモニア：穴（l = 0）の均質非平衡モデル ≒ Bernoulli
const src = M.sourceLiquefied({ chem: nh3, Tstore: 278.15, holeD: 0.05, path: "hole", mass: 20000, u10: 3, Tamb: 278.15 });
const bern = 0.61 * Math.PI * 0.025 ** 2 * Math.sqrt(2 * nh3.rhoL * (M.vaporPressure(nh3, 278.15) - M.P_ATM));
ok(near(src.outflow, bern, 0.01), "均質非平衡モデル（穴）と Bernoulli 式の一致");
ok(near(src.flash, 1 - Math.exp(-4600 * (278.15 - 239.82) / (23330 / 0.017031)), 0.03), "フラッシュ率 ≒ 12%");

// 爆風圧：1 psi の換算距離（EPA RMP は 17 m/kg^(1/3)）
ok(near(M.blastDistance(1, M.PSI), 17, 0.02), "爆風圧 1 psi の換算距離 ≒ 17 m/kg^(1/3)");

// 屋内換気回数（ALOHA 住宅モデル）が常識的な範囲
const met = { u: 3, zRef: 10, stab: "D", Tamb: 278.15 };
const ach = M.airChangesPerHour({ type: "single", sheltered: false }, met);
ok(ach > 0.3 && ach < 1.5, `平屋住宅の換気回数 ${ach.toFixed(2)} 回/h`);

// 一連の計算：研修ケースのゾーンが単調（レベル 3 < 2 < 1）
const m = { u: 3, zRef: 10, dirFrom: 315, Tamb: 278.15, cloud: 5, terrain: "open", lat: 33.88, lon: 130.7, date: new Date("2026-02-08T04:10:00Z") };
const src2 = M.sourceLiquefied({ chem: nh3, Tstore: 278.15, holeD: 0.05, path: "pipe", mass: 20000, u10: 3, Tamb: 278.15 });
for (const model of ["gauss", "auto"]) {
  const sim = D.buildSim({ chem: nh3, met: m, source: src2, model });
  const L = D.defaultLocs(nh3, "auto", 60).map(l => sim.zone(M.ppmToMg(l.ppm, nh3.mw, 278.15)).length);
  ok(L[0] > 0 && L[0] < L[1] && L[1] < L[2], `${model}：ゾーン長 ${L.map(x => Math.round(x)).join(" < ")} m（モデル ${sim.model}）`);
  const r = sim.receptor(1000, 0, { type: "single", sheltered: false });
  ok(r.peakIn < r.peakOut, `${model}：屋内の最大濃度は屋外より低い`);
}
// 重いガス：塩素の液化ガス漏えいは重いガスと判定される
const cl = C("chlorine");
const sc = M.sourceLiquefied({ chem: cl, Tstore: 293.15, holeD: 0.02, path: "hole", mass: 1000, u10: 2, Tamb: 293.15 });
const simc = D.buildSim({ chem: cl, met: Object.assign({}, m, { u: 2, Tamb: 293.15 }), source: sc, model: "auto" });
ok(simc.model === "dense", `塩素の液化ガス漏えいは重いガス（Ri = ${simc.dc.Ri.toFixed(0)}）`);

console.log(fail ? `\n${fail} 件の失敗` : "\nすべて合格");
process.exit(fail ? 1 : 0);
