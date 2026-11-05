/* 化学災害 産業保健ポータル：画面の切り替えと各ページ */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const APP_VERSION = "1.3.0";
  const PKEY = "cd-learn-v1";
  const M = window.CDModel, D = window.CDDisp;

  const fmt = v => v == null ? "—" : v >= 100 ? Math.round(v).toLocaleString() : v >= 10 ? +v.toFixed(1) : v >= 1 ? +v.toFixed(2) : +v.toPrecision(2);
  const srcRef = ids => (ids || []).map(id => CD.SOURCES[id] ? `<a class="src-ref" href="#/sources" title="${esc(CD.SOURCES[id].t)}">[${esc(srcNo(id))}]</a>` : "").join("");
  const SRC_IDS = Object.keys(CD.SOURCES);
  const srcNo = id => SRC_IDS.indexOf(id) + 1;

  function prog() { try { return JSON.parse(localStorage.getItem(PKEY)) || {}; } catch (e) { return {}; } }
  function saveProg(p) { try { localStorage.setItem(PKEY, JSON.stringify(p)); } catch (e) { /* 記録できなくても学習はできる */ } }

  const NAV = [["#/", "ホーム"], ["#/learn", "学ぶ"], ["#/case", "ケース演習"], ["#/sim", "拡散シミュレーター"], ["#/blast", "爆風圧"], ["#/chem", "物質・基準値"], ["#/glossary", "用語集"], ["#/method", "計算方法"]];

  function route() {
    const h = location.hash || "#/";
    const [, p1, p2] = h.split("/");
    const key = "#/" + (p1 || "");
    document.querySelectorAll(".nav a").forEach(a => a.setAttribute("aria-current", a.getAttribute("href") === key ? "page" : "false"));
    const v = $("#view");
    window.scrollTo(0, 0);
    switch (p1 || "") {
      case "": return home(v);
      case "learn": return p2 ? lesson(v, p2) : learnList(v);
      case "case": return caseView(v);
      case "sim": return window.CDSim.render(v, p2);
      case "blast": return blast(v);
      case "chem": return p2 ? chemDetail(v, decodeURIComponent(p2)) : chemList(v);
      case "glossary": return glossary(v);
      case "method": return method(v);
      case "sources": return sources(v);
      default: v.innerHTML = `<p>ページが見つかりません。<a href="#/">ホームへ</a></p>`;
    }
  }

  /* ---------- ホーム ---------- */
  function home(v) {
    const p = prog();
    const done = CD.LESSONS.filter(l => p[l.id] && p[l.id].done).length;
    v.innerHTML = `
    <div class="narrow">
      <h2 class="page">化学工場の爆発・漏えい時の産業保健</h2>
      <p class="lead">発災直後の 120 分を支える「判断」と「支援」の型を学び、拡散の推計で確かめるためのポータルです。
      産業医・保健師・衛生管理者・救護班・自衛防災組織の方を想定しています。</p>
      <div class="note crit"><b>いま事故が起きているなら：</b>まず 119 番・社内通報。産業医はホットゾーンに入らず、風上のコールドゾーンへ。
        物質がわからなければ「未知・最悪」として扱い、濃度不明なら空気呼吸器（SCBA）なしで立ち入らせない。
        <div class="seg" style="margin-top:8px"><a class="btn sm" href="#/sim">拡散の推計</a><a class="btn sm ghost" href="#/chem">基準値を引く</a><a class="btn sm ghost" href="#/learn/first120">初動の型</a></div></div>
      <div class="cards" style="margin-top:16px">
        <a class="tile" href="#/learn"><span class="tag">E-LEARNING</span><b>学ぶ（8 モジュール）</b><span>化学災害の基礎、基準値の使い分け、最初の 120 分、ゾーニングと除染、医療連携、リハブ、平時の備え、拡散予測の読み方。修了 ${done}/${CD.LESSONS.length}</span></a>
        <a class="tile" href="#/case"><span class="tag">CASE</span><b>ケース演習</b><span>夏の夜、ソーダ工場の爆発で液化塩素が漏えい（架空）。電話での初動支援から搬送まで、Phase I〜IV の判断を選んで振り返る。</span></a>
        <a class="tile" href="#/sim"><span class="tag">SIMULATOR</span><b>拡散シミュレーター</b><span>ALOHA と同じ枠組みで、脅威ゾーンと地点ごとの屋内外の濃度を推計。重いガスにも対応。練習用のケース 3 つ（塩素・フッ化水素・二酸化硫黄）を読み込める。</span></a>
        <a class="tile" href="#/blast"><span class="tag">BLAST</span><b>爆風圧の目安</b><span>蒸気雲爆発・爆発物の TNT 換算で、窓ガラス破損・重傷・建物倒壊の範囲を推計。</span></a>
        <a class="tile" href="#/chem"><span class="tag">DATA</span><b>物質・基準値</b><span>15 物質の AEGL・PAC・ERPG・IDLH・許容濃度。PubChem から現行値を取得して差分を確認。他の物質も検索可。</span></a>
        <a class="tile" href="#/glossary"><span class="tag">GLOSSARY</span><b>用語集</b><span>AEGL・IDLH・ICS・MARCH・リハブ・大気安定度など ${CD.GLOSSARY.length} 語。</span></a>
      </div>
      <h3>この教材のもとになった研修</h3>
      <p class="small">令和7年度 産業医科大学 産業医学実践研修「災害時の化学物質等のばく露から労働者を守る」（2026年2月8日）。
      講師：上野晋（産業医科大学 職業性中毒学）、中原浩彦（NAOSHコンサルティング）、真鍋憲幸（三菱ケミカル）、長谷川有史（福島県立医科大学）、立石清一郎（産業医科大学 災害産業保健センター）。</p>
      <p class="small muted">本アプリは教育・研修目的です。実際の対応は現場の指揮命令系統、消防など公的機関の指示、専門家の判断に従ってください。</p>
    </div>`;
  }

  /* ---------- 学ぶ ---------- */
  function learnList(v) {
    const p = prog();
    v.innerHTML = `<div class="narrow"><h2 class="page">学ぶ</h2>
      <p class="lead">各モジュールの最後に確認問題があります。全問に答えると修了になります（記録はこの端末にだけ保存）。</p>
      ${CD.LESSONS.map(l => {
        const q = p[l.id] || {}; const ans = Object.keys(q.quiz || {}).length;
        return `<a class="tile" style="margin-bottom:10px" href="#/learn/${l.id}"><span class="tag">MODULE ${l.no}　約 ${l.min} 分</span>
          <b>${esc(l.title)} ${q.done ? '<span class="pill good">修了</span>' : ""}</b><span>${esc(l.by)}</span>
          <div class="progress" style="margin-top:8px"><i style="width:${Math.round(100 * ans / l.quiz.length)}%"></i></div></a>`;
      }).join("")}
      <div class="seg"><button type="button" class="btn sm ghost" id="resetProg">学習記録を消す</button></div></div>`;
    $("#resetProg").onclick = () => { if (confirm("この端末の学習記録を消しますか？")) { saveProg({}); learnList(v); } };
  }

  function lesson(v, id) {
    const l = CD.LESSONS.find(x => x.id === id);
    if (!l) { v.innerHTML = "<p>モジュールが見つかりません。</p>"; return; }
    const i = CD.LESSONS.indexOf(l), prev = CD.LESSONS[i - 1], next = CD.LESSONS[i + 1];
    const p = prog(); const rec = p[l.id] || { quiz: {} };
    v.innerHTML = `<div class="narrow lesson-body">
      <p class="small"><a href="#/learn">学ぶ</a> ／ モジュール ${l.no}</p>
      <h2 class="page">${esc(l.title)}</h2><p class="small muted">${esc(l.by)}　約 ${l.min} 分</p>
      <div class="card"><div class="card-b">${l.body}</div></div>
      <h3>確認問題</h3><div id="quiz"></div>
      <p class="xs muted">出典：${l.src.map(s => esc(CD.SOURCES[s] ? CD.SOURCES[s].t : s)).join("　／　")}</p>
      <div class="seg" style="justify-content:space-between;margin-top:14px">
        ${prev ? `<a class="btn sm ghost" href="#/learn/${prev.id}">← ${esc(prev.title.split("：")[0])}</a>` : "<span></span>"}
        ${next ? `<a class="btn sm" href="#/learn/${next.id}">${esc(next.title.split("：")[0])} →</a>` : `<a class="btn sm" href="#/case">ケース演習へ →</a>`}</div></div>`;
    const qz = $("#quiz");
    qz.innerHTML = l.quiz.map((q, k) => `<div class="quiz" data-k="${k}"><div class="q">問 ${k + 1}　${esc(q.q)}</div>
      <div class="opts">${q.opts.map((o, j) => `<button type="button" data-j="${j}">${esc(o)}</button>`).join("")}</div>
      <div class="exp"></div></div>`).join("");
    const show = (box, k, j) => {
      const q = l.quiz[k];
      box.classList.add("done");
      box.querySelectorAll("button").forEach((b, jj) => { b.disabled = true; if (jj === q.a) b.classList.add("ok"); else if (jj === j) b.classList.add("ng"); });
      box.querySelector(".exp").innerHTML = `${j === q.a ? '<b style="color:var(--good)">正解</b>' : '<b style="color:var(--crit)">不正解</b>'}　${esc(q.exp)}`;
    };
    qz.querySelectorAll(".quiz").forEach(box => {
      const k = +box.dataset.k;
      if (rec.quiz[k] !== undefined) show(box, k, rec.quiz[k]);
      box.onclick = e => {
        const b = e.target.closest("button"); if (!b || b.disabled) return;
        const j = +b.dataset.j; show(box, k, j);
        const pp = prog(); pp[l.id] = pp[l.id] || { quiz: {} }; pp[l.id].quiz[k] = j;
        pp[l.id].done = Object.keys(pp[l.id].quiz).length >= l.quiz.length; saveProg(pp);
      };
    });
  }

  /* ---------- ケース演習 ---------- */
  function caseView(v) {
    const C = CD.CASE;
    v.innerHTML = `<div class="narrow"><h2 class="page">ケース演習</h2><p class="lead">${esc(C.title)}。実践研修のケース演習の形式にならって作った架空の事例です。選んで、振り返り、シミュレーターで確かめます。</p>
      <div class="card"><div class="card-h">事例の背景と初期情報</div><div class="card-b">${C.setting}
        <div class="note crit" style="margin-top:12px"><b>産業医の絶対ルール</b>：現場（ホットゾーン）に行かない。コールドゾーン（安全域）で医療情報のハブとなり、指揮官の判断を医学的に支える。</div></div></div>
      ${C.phases.map(ph => `<div class="card"><div class="card-h">${esc(ph.title)}</div><div class="card-b">
        <p><b>状況：</b>${esc(ph.situation)}</p>
        <p class="small muted">思考ガイド：${ph.guide.map(esc).join("／")}</p>
        ${ph.tasks.map((t, k) => t.kind === "choice" ? `
          <div class="quiz" data-ph="${ph.id}" data-k="${k}"><div class="q">${esc(t.q)}</div>
          <div class="opts">${t.opts.map((o, j) => `<button type="button" data-j="${j}">${esc(o)}</button>`).join("")}</div>
          <div class="exp">${esc(t.exp)}${t.sim ? `<div style="margin-top:6px"><a class="btn sm ghost" href="#/sim/tohama">シミュレーターで確かめる</a></div>` : ""}</div></div>` : `
          <div class="quiz"><div class="q">${esc(t.q)}</div>
          <textarea class="inp" rows="3" placeholder="自分の考えをメモ（保存されません）"></textarea>
          <details class="more"><summary>解答例を見る</summary><div class="small">${t.ans}</div></details></div>`).join("")}
      </div></div>`).join("")}
      <div class="card"><div class="card-h">Take Home Message：最初の 120 分は「基準値による判断」と「コールドゾーンからの支援」で乗り切る</div><div class="card-b">
        ${C.takeHome.map(([h, b], i) => `<p><b>0${i + 1}　${esc(h)}</b><br><span class="small">${esc(b)}</span></p>`).join("")}</div></div></div>`;
    v.querySelectorAll(".quiz[data-ph]").forEach(box => {
      box.onclick = e => {
        const b = e.target.closest("button"); if (!b || b.disabled) return;
        const ph = C.phases.find(p => p.id === box.dataset.ph), t = ph.tasks[+box.dataset.k], j = +b.dataset.j;
        box.classList.add("done");
        box.querySelectorAll(".opts button").forEach((bb, jj) => { bb.disabled = true; if (jj === t.a) bb.classList.add("ok"); else if (jj === j) bb.classList.add("ng"); });
      };
    });
  }

  /* ---------- 物質・基準値 ---------- */
  function chemList(v) {
    v.innerHTML = `<h2 class="page">物質・基準値</h2>
    <p class="lead small">緊急時の基準値（ppm）。AEGL・PAC・IDLH・ERPG は PubChem（EPA・DOE・NIOSH・Haz-Map 由来）から ${CD.FETCHED} に取得した値です。
      物質名をクリックすると健康影響・応急処置と、PubChem の現行値との照合ができます。</p>
    <div class="card"><div class="card-b"><div class="tbl-wrap"><table class="tbl">
      <tr><th>物質</th><th class="r">AEGL-1<br>60分</th><th class="r">AEGL-2<br>60分</th><th class="r">AEGL-3<br>60分</th><th class="r">PAC-1</th><th class="r">PAC-2</th><th class="r">PAC-3</th><th class="r">IDLH</th><th class="r">許容濃度<br>（産衛）</th><th class="r">管理濃度</th></tr>
      ${CD.CHEMICALS.map(c => `<tr class="click" onclick="location.hash='#/chem/${c.id}'"><td><a href="#/chem/${c.id}">${esc(c.ja)}</a><br><span class="xs muted">${esc(c.en)}・CAS ${c.cas}・UN ${c.un}</span></td>
        ${[1, 2, 3].map(lv => `<td class="r">${c.aegl[lv][2] == null ? "NR" : fmt(c.aegl[lv][2])}</td>`).join("")}
        ${c.pac.map(x => `<td class="r">${fmt(x)}</td>`).join("")}<td class="r">${fmt(c.idlh)}</td>
        <td class="r">${c.jsoh != null ? fmt(c.jsoh) + (c.jsohCeiling ? "*" : "") : `<span class="xs">${esc(c.jsohNote || "—")}</span>`}</td><td class="r">${fmt(c.kanri)}</td></tr>`).join("")}
    </table></div><p class="hint">* は最大許容濃度。NR はデータ不足で設定なし。許容濃度は日本産業衛生学会（2025年度）、管理濃度は厚生労働省告示。平時の許容濃度・管理濃度は避難の判断には使いません。</p></div></div>
    <div class="card"><div class="card-h">ほかの物質を PubChem で調べる</div><div class="card-b">
      <div class="row2" style="grid-template-columns:1fr auto"><input class="inp" id="q" placeholder="英語名または CAS 番号（例：bromine、7726-95-6）"><button type="button" class="btn" id="go">検索</button></div>
      <p class="hint">PubChem は英語名・CAS 番号で検索します。取得した値はこの端末にだけ保存されます。</p>
      <div id="res"></div></div></div>`;
    const go = async () => {
      const q = $("#q").value.trim(); if (!q) return;
      $("#res").innerHTML = `<p class="small muted">PubChem に問い合わせています…</p>`;
      try {
        const r = await window.CDLive.lookup(q);
        if (!r) { $("#res").innerHTML = `<p class="small">見つかりませんでした。英語名か CAS 番号で試してください。</p>`; return; }
        $("#res").innerHTML = liveHtml(r, null) + `<div class="seg" style="margin-top:8px"><button type="button" class="btn sm" id="useSim">この物質をシミュレーターで使う（直接放出）</button></div>`;
        $("#useSim").onclick = () => {
          const pac = r.pac ? r.pac.v : [null, null, null];
          window.CDSim.setCustom({ ja: r.title, en: r.title, cas: r.cas, mw: r.mw, pac, idlh: r.idlh ? r.idlh.v : null });
          location.hash = "#/sim";
        };
      } catch (e) { $("#res").innerHTML = `<p class="small" style="color:var(--crit)">取得できませんでした（${esc(e.message)}）。通信状態を確かめてください。</p>`; }
    };
    $("#go").onclick = go; $("#q").onkeydown = e => { if (e.key === "Enter") go(); };
  }

  // PubChem の取得結果（r）を、組み込みの値（c）と比べて表示する
  function liveHtml(r, c) {
    const d = (a, b) => c && a != null && b != null && Math.abs(a - b) / Math.max(Math.abs(b), 1e-9) > 0.005 ? "diff" : "";
    const T = ["10分", "30分", "60分", "4時間", "8時間"];
    let h = `<h4>${esc(r.title)} <span class="xs muted">CID ${r.cid}${r.cas ? "・CAS " + esc(r.cas) : ""}・分子量 ${fmt(r.mw)}・取得 ${new Date(r.fetched).toLocaleString("ja-JP")}</span></h4>`;
    if (r.failed && r.failed.length) h += `<p class="small" style="color:var(--warn)">取得できなかった項目：${r.failed.map(esc).join("、")}。時間をおいて再度お試しください。</p>`;
    if (r.aegl) {
      h += `<div class="tbl-wrap"><table class="tbl"><tr><th>AEGL（${esc(r.aegl.status || "状態不明")}）</th>${T.map(t => `<th class="r">${t}</th>`).join("")}</tr>
      ${[1, 2, 3].map(lv => `<tr><th>AEGL-${lv}</th>${r.aegl[lv].map((x, k) => `<td class="r ${d(x, c && c.aegl[lv][k])}">${x == null ? "NR" : fmt(x)}</td>`).join("")}</tr>`).join("")}</table></div>`;
      if (r.aegl.notes.length) h += `<p class="hint">${r.aegl.notes.map(esc).join("　")}</p>`;
    } else if (!(r.failed || []).some(f => f.startsWith("AEGL"))) h += `<p class="small">AEGL：PubChem に収載なし</p>`;
    h += `<div class="tbl-wrap"><table class="tbl"><tr><th></th><th class="r">1</th><th class="r">2</th><th class="r">3</th><th>収載元</th></tr>
      <tr><th>PAC</th>${[0, 1, 2].map(k => `<td class="r ${d(r.pac && r.pac.v[k], c && c.pac[k])}">${r.pac ? fmt(r.pac.v[k]) : "—"}</td>`).join("")}<td class="xs">${r.pac && r.pac.ref ? esc(r.pac.ref.source) : "収載なし"}</td></tr>
      <tr><th>ERPG</th>${[0, 1, 2].map(k => `<td class="r ${d(r.erpg && r.erpg.v[k], c && c.erpg[k])}">${r.erpg ? fmt(r.erpg.v[k]) : "—"}</td>`).join("")}<td class="xs">${r.erpg && r.erpg.ref ? esc(r.erpg.ref.source) : "収載なし"}</td></tr>
      <tr><th>IDLH</th><td class="r ${d(r.idlh && r.idlh.v, c && c.idlh)}" colspan="3">${r.idlh ? fmt(r.idlh.v) + " ppm" : "—"}</td><td class="xs">${r.idlh ? esc(r.idlh.text) : "収載なし"}</td></tr></table></div>`;
    if (c) h += `<p class="hint">黄色の欄は本アプリに組み込んだ値（${CD.FETCHED} 取得）と違う値です。違いがあれば、収載元（EPA・DOE・NIOSH）の原典で確認してください。</p>`;
    return h;
  }

  function chemDetail(v, id) {
    const c = CD.CHEMICALS.find(x => x.id === id);
    if (!c) { v.innerHTML = "<p>物質が見つかりません。</p>"; return; }
    const T = ["10分", "30分", "60分", "4時間", "8時間"];
    const Tb = M.boilingPoint(c) - 273.15;
    v.innerHTML = `<div class="narrow"><p class="small"><a href="#/chem">物質・基準値</a></p>
      <h2 class="page">${esc(c.ja)} <span class="small muted">${esc(c.en)}</span></h2>
      <p class="small">CAS ${c.cas}／UN ${c.un}／ERG ガイド ${c.erg}／分子量 ${c.mw}／沸点 ${Tb.toFixed(1)} ℃／空気との分子量比 ${(c.mw / M.M_AIR).toFixed(2)}${c.lel ? `／爆発下限 ${c.lel}%` : ""}</p>
      <div class="card"><div class="card-h">健康影響と応急処置</div><div class="card-b small">
        <p>${esc(c.tox)}</p><p><b>重症化のサイン：</b>${esc(c.signs)}</p><p><b>応急処置：</b>${esc(c.first)}</p>${c.note ? `<p class="muted">${esc(c.note)}</p>` : ""}
        <p class="hint">詳しくは日本中毒情報センター、CHEMM、ATSDR の物質別情報を参照してください。</p></div></div>
      <div class="card"><div class="card-h">緊急時の基準値（ppm）</div><div class="card-b">
        <div class="tbl-wrap"><table class="tbl"><tr><th>AEGL（${esc(c.aegl.status)}）</th>${T.map(t => `<th class="r">${t}</th>`).join("")}</tr>
        ${[1, 2, 3].map(lv => `<tr><th>AEGL-${lv}</th>${c.aegl[lv].map(x => `<td class="r">${x == null ? "NR" : fmt(x)}</td>`).join("")}</tr>`).join("")}</table></div>
        ${c.aegl.remark ? `<p class="hint">${esc(c.aegl.remark)}</p>` : ""}
        <div class="tbl-wrap"><table class="tbl"><tr><th></th><th class="r">1</th><th class="r">2</th><th class="r">3</th></tr>
          <tr><th>PAC</th>${c.pac.map(x => `<td class="r">${fmt(x)}</td>`).join("")}</tr>
          <tr><th>ERPG（1 時間）</th>${c.erpg.map(x => `<td class="r">${x == null ? "設定なし" : fmt(x)}</td>`).join("")}</tr>
          <tr><th>IDLH</th><td class="r" colspan="3">${fmt(c.idlh)}</td></tr></table></div>
        <h4>平時の基準（避難の判断には使わない）</h4>
        <ul class="list small"><li>許容濃度（日本産業衛生学会 2025年度）：${c.jsoh != null ? fmt(c.jsoh) + " ppm" + (c.jsohCeiling ? "（最大許容濃度）" : "") + (c.jsohMax ? `、最大許容濃度 ${c.jsohMax} ppm` : "") : esc(c.jsohNote || "—")}</li>
          <li>管理濃度：${c.kanri != null ? fmt(c.kanri) + " ppm" : "設定なし"}</li><li>特化則：${esc(c.tokka || "—")}${c.kijun ? `／${esc(c.kijun)}` : ""}</li><li>ACGIH TLV：${esc(c.tlv || "—")} ppm</li></ul>
        <p class="xs muted">出典：EPA AEGL、DOE PAC、AIHA ERPG（Haz-Map 経由）、NIOSH IDLH${c.id === "acrylonitrile" ? "（2016 年改定値）" : ""}、日本産業衛生学会、厚生労働省、ILO ICSC。</p>
      </div></div>
      <div class="card"><div class="card-h">PubChem の現行値と照合<span class="right"><button type="button" class="btn sm" id="live">最新値を取得</button></span></div><div class="card-b" id="liveRes">
        ${window.CDLive.cached(c.cid) ? liveHtml(window.CDLive.cached(c.cid), c) : `<p class="small muted">ボタンを押すと PubChem（EPA・DOE・NIOSH 由来）から現在の値を取得し、本アプリの値と比べます。</p>`}</div></div>
      <div class="seg"><a class="btn" href="#/sim" id="toSim">この物質で拡散を推計</a></div></div>`;
    $("#live").onclick = async () => {
      $("#liveRes").innerHTML = `<p class="small muted">取得しています…</p>`;
      try { const r = await window.CDLive.lookup(String(c.cid)); $("#liveRes").innerHTML = liveHtml(r, c); }
      catch (e) { $("#liveRes").innerHTML = `<p class="small" style="color:var(--crit)">取得できませんでした（${esc(e.message)}）。</p>`; }
    };
    $("#toSim").onclick = () => window.CDSim.useChem(c.id);
  }

  /* ---------- 爆風圧 ---------- */
  const BKEY = "cd-blast-v1";
  function blast(v) {
    let b; try { b = JSON.parse(localStorage.getItem(BKEY)); } catch (e) { b = null; }
    b = b || { mode: "vce", chemId: "ammonia", mass: 1000, eta: 10, tnt: 100 };
    const flam = CD.CHEMICALS.filter(c => c.hc);
    v.innerHTML = `<div class="narrow"><h2 class="page">爆風圧の目安</h2>
      <p class="lead small">爆発の爆風圧（入射過圧）が及ぶ範囲を TNT 換算法で推計します。範囲の区分は ALOHA の既定値（8.0・3.5・1.0 psi）に合わせています。</p>
      <div class="card"><div class="card-b">
        <div class="field"><div class="seg" id="bm"><button type="button" data-v="vce" aria-pressed="${b.mode === "vce"}">可燃性ガスの蒸気雲爆発</button><button type="button" data-v="tnt" aria-pressed="${b.mode === "tnt"}">TNT 換算量を直接入力</button></div></div>
        ${b.mode === "vce" ? `
        <div class="field"><label for="bchem">物質</label><select class="inp" id="bchem">${flam.map(c => `<option value="${c.id}" ${c.id === b.chemId ? "selected" : ""}>${c.ja}（燃焼熱 約 ${c.hc} MJ/kg、爆発下限 ${c.lel}%）</option>`).join("")}</select></div>
        <div class="row2"><div class="field"><label for="bmass">雲の中の可燃性ガスの量</label><div class="unit"><input class="inp" type="number" id="bmass" value="${b.mass}" min="1"><span>kg</span></div></div>
          <div class="field"><label for="beta">爆発効率</label><div class="unit"><input class="inp" type="number" id="beta" value="${b.eta}" min="1" max="100" step="1"><span>%</span></div></div></div>
        <p class="hint">爆発効率は燃焼熱のうち爆風になる割合。EPA RMP の最悪ケース評価は 10%、実際の事故の解析では数 % 程度とされることが多い。</p>` : `
        <div class="field"><label for="btnt">TNT 換算量</label><div class="unit"><input class="inp" type="number" id="btnt" value="${b.tnt}" min="0.1" step="any"><span>kg</span></div>
        <p class="hint">爆発物・反応暴走・容器破裂などで、エネルギーを TNT 量に換算したもの。</p></div>`}
        <div id="bres"></div></div></div>
      <div class="card"><div class="card-h">計算方法と注意</div><div class="card-b small"><ul class="list">
        <li>TNT 換算量 W = 爆発効率 × 可燃性ガスの量 × 燃焼熱 ÷ 4.68 MJ/kg（TNT の爆発エネルギー）。</li>
        <li>過圧と換算距離 R/W<sup>1/3</sup> の関係は Kinney & Graham (1985) の式。地表での爆発として地面の反射で W を 2 倍にしています（1 psi の距離が EPA RMP ガイダンスの式 D = 17·(0.1·W·ΔHc/ΔHc,TNT)<sup>1/3</sup> とほぼ一致）。</li>
        <li>ALOHA は蒸気雲爆発に BST 法（設備の混み具合と火炎速度で爆風を決める）を使います。TNT 換算法は開けた場所では過大、密集した設備では過小になりうる簡易法です。</li>
        <li>アンモニアは燃えにくく（爆発下限 15%）、屋外での蒸気雲爆発はまれです。冷凍設備の爆発の多くは容器・配管の破裂や火災によるものです。</li>
        <li>人への影響の目安：1 psi（6.9 kPa）で窓ガラスの破損と飛散による負傷、3.5 psi（24 kPa）で重傷の可能性、8 psi（55 kPa）で建物の倒壊・損壊（ALOHA。Baker ほか 1983 による）。鼓膜破裂・肺損傷はさらに高い過圧で起こるが、爆風による飛散物・倒壊による外傷が主な被害になる。</li></ul></div></div></div>`;
    const calc = () => {
      try { localStorage.setItem(BKEY, JSON.stringify(b)); } catch (e) { /* 保存できなくても計算はできる */ }
      let W;
      if (b.mode === "vce") { const c = CD.CHEMICALS.find(x => x.id === b.chemId) || flam[0]; W = M.tntMass(b.mass, c.hc, b.eta / 100); }
      else W = b.tnt;
      const rows = [[8, "z3", "建物の倒壊・損壊"], [3.5, "z2", "重傷の可能性が高い"], [1, "z1", "窓ガラスが割れ、飛散で負傷"]];
      $("#bres").innerHTML = `<p class="small">TNT 換算量 <b>${fmt(W)} kg</b></p><div class="kpis">${rows.map(([psi, z, t]) =>
        `<div class="kpi ${z}"><div class="k">${psi} psi（${(psi * M.PSI).toFixed(0)} kPa）：${t}</div><div class="v">${fmt(M.blastDistance(W, psi * M.PSI))} <small>m</small></div></div>`).join("")}</div>`;
    };
    $("#bm").onclick = e => { const x = e.target.closest("button"); if (x) { b.mode = x.dataset.v; blast(v); } };
    v.oninput = e => { const t = e.target; if (t.id === "bmass") b.mass = +t.value || 0; if (t.id === "beta") b.eta = +t.value || 0; if (t.id === "btnt") b.tnt = +t.value || 0; if (t.id === "bchem") b.chemId = t.value; calc(); };
    calc();
  }

  /* ---------- 用語集 ---------- */
  function glossary(v) {
    const cats = ["すべて", ...new Set(CD.GLOSSARY.map(g => g.cat))];
    let cat = "すべて", q = "";
    v.innerHTML = `<div class="narrow"><h2 class="page">用語集</h2>
      <input class="inp gl-search" id="gq" placeholder="用語を検索（例：AEGL、除染、安定度）">
      <div class="gl-cats seg" id="gc">${cats.map(c => `<button type="button" data-c="${c}" aria-pressed="${c === cat}">${c}</button>`).join("")}</div>
      <dl id="gl"></dl></div>`;
    const draw = () => {
      const k = q.toLowerCase();
      const list = CD.GLOSSARY.filter(g => (cat === "すべて" || g.cat === cat) && (!k || (g.t + (g.r || "") + g.d).toLowerCase().includes(k)));
      $("#gl").innerHTML = list.map(g => `<div class="gl-item"><dt>${esc(g.t)}${g.r ? `<small>${esc(g.r)}</small>` : ""} <span class="pill">${esc(g.cat)}</span></dt><dd>${esc(g.d)}${srcRef(g.src)}</dd></div>`).join("") || `<p class="muted">該当する用語はありません。</p>`;
    };
    $("#gq").oninput = e => { q = e.target.value; draw(); };
    $("#gc").onclick = e => { const b = e.target.closest("button"); if (!b) return; cat = b.dataset.c; $("#gc").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); draw(); };
    draw();
  }

  /* ---------- 計算方法 ---------- */
  function method(v) {
    const r = (ids) => srcRef(ids);
    v.innerHTML = `<div class="narrow lesson-body"><h2 class="page">計算方法と検証</h2>
    <p class="lead small">シミュレーターは NOAA/EPA の ALOHA 5.4.4 技術文書${r(["aloha_tech"])}に書かれた方法と係数をそのまま使い、ALOHA 独自の部分は査読論文・公的資料の方法に置き換えています。</p>
    <div class="tbl-wrap"><table class="tbl"><tr><th>項目</th><th>本アプリ</th><th>ALOHA との関係</th></tr>
    <tr><td>大気安定度</td><td>地表日射量 Fs = 1111(1 − 0.0071C²)(sin φ − 0.1)（Raphael 1962）で日射を強・中・弱に分け、Turner の表で A〜F。2 区分にまたがる欄は安定側。全天曇りは D${r(["raphael1962", "turner1970", "pasquill1961"])}</td><td>同じ（TD §4.2.1）</td></tr>
    <tr><td>風速の高さ補正</td><td>べき乗則、指数は安定度別（0.108〜0.253）</td><td>同じ（TD p.41 の典型値）</td></tr>
    <tr><td>拡散幅</td><td>Briggs (1973)。σy は常に田園の係数、σz は粗度 20 cm 未満で田園・以上で都市。σx = sx1·x^sx2（Beals 1971）${r(["briggs1973", "griffiths1994", "beals1971"])}</td><td>同じ（TD Table 13）</td></tr>
    <tr><td>有限時間の放出</td><td>Palazzi ら (1982) の式で 5 段階までの一定放出の重ね合わせ${r(["palazzi1982"])}</td><td>同じ（TD §4.3）</td></tr>
    <tr><td>重いガスの判定</td><td>摩擦リチャードソン数 Ri = H·ĝ/U*² ≥ 1</td><td>同じ（TD §4.4.1）</td></tr>
    <tr><td>重いガスの拡散</td><td>Britter & McQuaid (1988) の作業手引きの近似式（CCPS 1999 の表、非等温補正は EPA 1992）。最後の等値線から先は仮想点源のガウスに接続${r(["britter1988", "ccps1999", "zhang2016", "epa_tscreen", "hanna1993"])}</td><td>置き換え（ALOHA は DEGADIS 系）</td></tr>
    <tr><td>液化ガスの噴出</td><td>均質非平衡モデル（Henry & Fauske 1971、Fauske & Epstein 1988）、流出係数 0.61。フラッシュ後の残りは霧として雲に含める${r(["henry1971", "fauske1988"])}</td><td>同じ（TD §3.4.5）。容器内の温度変化は省略</td></tr>
    <tr><td>圧縮ガスの漏えい</td><td>チョーク流・非チョーク流の式。等温の指数減衰を 5 段階で近似${r(["crowl2011"])}</td><td>式は同じ（TD §3.4.6）。ALOHA は断熱で減衰</td></tr>
    <tr><td>液だまりの蒸発</td><td>EPA RMP ガイダンス付録 D の式 D-1。防液堤なしは厚さ 1 cm${r(["epa_rmp"])}</td><td>置き換え（ALOHA は Brighton 1985 と熱収支）</td></tr>
    <tr><td>脅威ゾーン</td><td>各地点の最大濃度（最大放出段の中央時刻＋到達時間から 30 秒刻みで探索）が LOC となる距離を二分探索し、横幅は σy√(2 ln(Cmax/LOC))</td><td>同じ（TD §4.5）</td></tr>
    <tr><td>風向の信頼線</td><td>α = arctan(2σy / 300U₃)、σy は 5 分間の流下距離での値</td><td>同じ（TD §4.5.3）</td></tr>
    <tr><td>屋内濃度</td><td>1 室モデル dCi/dt = (Co − Ci)/τ。換気回数は ALOHA の住宅モデル（煙突効果と風、床面積 160 m²）か、事務所 0.5 回/h、または入力値${r(["wilson1987"])}</td><td>同じ（TD §4.6）</td></tr>
    <tr><td>基準値（LOC）</td><td>60 分 AEGL → ERPG → PAC の順${r(["aloha_loc"])}</td><td>同じ</td></tr>
    <tr><td>爆風圧</td><td>TNT 換算＋Kinney & Graham (1985)、地表反射 2 倍${r(["kinney1985", "epa_rmp", "baker1983"])}</td><td>置き換え（ALOHA は BST 法）</td></tr></table></div>
    <h3>検証</h3><ul class="list small">
      <li>ガウスモデルの質量保存：風下 1 km の断面で濃度×風速を積分すると放出率に一致する（tests/model.test.js）。</li>
      <li>アンモニアの蒸発熱（沸点）を NIST の Antoine 式から求めると 23.3 kJ/mol（文献値 23.3 kJ/mol）。20 ℃の蒸気圧 8.5 bar（文献値 8.6 bar）。</li>
      <li>液化アンモニアの噴出で、穴（流路長 0）の均質非平衡モデルの流出率は Bernoulli 式と 1% 以内で一致する。</li>
      <li>爆風圧 1 psi の換算距離 16.9 m/kg<sup>1/3</sup>（EPA RMP の式は 17）。</li>
      <li>重いガスの係数表は CCPS の表を転載した 2 つの独立した資料で照合した（パフの表は 1 資料のみで、連続性の検査で確認）。</li>
      <li>研修スライドに記載のアンモニア・硫化水素・塩素・ホスゲンの AEGL は PubChem・EPA の物質別ページと一致した。</li></ul>
    <h3>ALOHA との違いと使い分け</h3>
    <p class="small">本アプリは ALOHA の代わりではなく、考え方を学び、初動の目安を素早く得るための道具です。重いガスと液だまりの蒸発の方法が違うため、同じ条件でも ALOHA と数値は一致しません。防災計画や行政への報告などの正式な評価には ALOHA 等の検証済みのソフトウェアを使ってください。ALOHA は NOAA のサイトから無償で入手できます${r(["aloha_home"])}。</p>
    <p class="xs muted">TD = ALOHA 5.4.4 Technical Documentation（NOAA TM NOS OR&R 43, 2013）。版 ${APP_VERSION}。</p></div>`;
  }

  function sources(v) {
    v.innerHTML = `<div class="narrow"><h2 class="page">出典</h2><ol class="list src-list">${SRC_IDS.map(id => { const s = CD.SOURCES[id];
      return `<li id="s-${id}">${esc(s.t)}${s.url ? ` <a href="${esc(s.url)}" target="_blank" rel="noopener">リンク</a>` : ""}${s.verified === false ? ' <span class="pill warn">書誌の一部未確認</span>' : ""}</li>`; }).join("")}</ol></div>`;
  }

  function init() {
    $("#nav").innerHTML = NAV.map(([h, l]) => `<a href="${h}">${l}</a>`).join("");
    $("#ver").textContent = APP_VERSION;
    window.addEventListener("hashchange", route);
    route();
    if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  document.addEventListener("DOMContentLoaded", init);
})();
