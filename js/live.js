/* PubChem（PUG REST / PUG-View）から緊急時の基準値の現行値を取得する
 * PubChem は CORS を許可しているため、ブラウザから直接取得できる。取得した値は端末の localStorage にだけ保存する。
 * 収載元：AEGL＝EPA、PAC＝DOE PAC Database、IDLH＝NIOSH ほか、ERPG＝Haz-Map（AIHA 値）
 */
(function () {
  "use strict";
  const BASE = "https://pubchem.ncbi.nlm.nih.gov/rest";
  const HEAD = {
    aegl: "Acute Exposure Guideline Levels (AEGLs)",
    pac: "Protective Action Criteria (PAC)",
    erpg: "Emergency Response Planning Guidelines",
    idlh: "Immediately Dangerous to Life or Health (IDLH)",
  };
  const KEY = "cd-live-v1";

  // PubChem の利用条件（毎秒 5 件まで）を守るため、要求は 1 件ずつ 250 ms 間隔で送り、503 は待って再試行する
  let queue = Promise.resolve();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function getJSON(url) {
    const job = queue.then(async () => {
      for (let i = 0; i < 4; i++) {
        let r;
        try { r = await fetch(url); } catch (e) { if (i === 3) throw e; await sleep(1000 * (i + 1)); continue; }
        await sleep(250);
        if (r.status === 404) return null;
        if (r.status === 503 && i < 3) { await sleep(1500 * (i + 1)); continue; }
        if (!r.ok) throw new Error("PubChem " + r.status);
        return r.json();
      }
    });
    queue = job.catch(() => {});
    return job;
  }

  async function cidOf(query) {
    const q = encodeURIComponent(String(query).trim());
    const j = await getJSON(`${BASE}/pug/compound/name/${q}/cids/JSON`);
    return j && j.IdentifierList ? j.IdentifierList.CID[0] : null;
  }

  async function props(cid) {
    const j = await getJSON(`${BASE}/pug/compound/cid/${cid}/property/Title,MolecularWeight,IUPACName/JSON`);
    const p = j && j.PropertyTable.Properties[0];
    const syn = await getJSON(`${BASE}/pug/compound/cid/${cid}/synonyms/JSON`).catch(() => null);
    const list = syn ? syn.InformationList.Information[0].Synonym || [] : [];
    const cas = list.find(s => /^\d{2,7}-\d{2}-\d$/.test(s)) || "";
    return { cid, title: p ? p.Title : "", mw: p ? +p.MolecularWeight : null, cas };
  }

  function walk(sec, out, refs) {
    for (const s of sec.Section || []) {
      for (const inf of s.Information || []) {
        const v = inf.Value || {};
        const str = (v.StringWithMarkup || []).map(x => x.String).join(" | ") || (v.Number ? v.Number.join(" ") + " " + (v.Unit || "") : "");
        out.push({ name: inf.Name || "", str, ref: refs[inf.ReferenceNumber] });
      }
      walk(s, out, refs);
    }
  }

  async function section(cid, key) {
    const j = await getJSON(`${BASE}/pug_view/data/compound/${cid}/JSON?heading=${encodeURIComponent(HEAD[key])}`);
    if (!j) return [];
    const refs = {};
    for (const r of j.Record.Reference || []) refs[r.ReferenceNumber] = { source: r.SourceName, name: r.Name, url: r.URL };
    const out = [];
    walk(j.Record, out, refs);
    return out;
  }

  const numOf = s => { if (!s || /^\s*NR\b/i.test(s)) return null; const m = String(s).replace(/,/g, "").match(/[\d.]+/); return m ? +m[0] : null; };

  function parseAegl(items) {
    const T = ["10 min", "30 min", "60 min", "4 hr", "8 hr"];
    const res = { 1: [], 2: [], 3: [], status: "", notes: [] , ref: null };
    for (const t of T) {
      const it = items.find(i => i.name === t);
      const parts = it ? it.str.split("|").map(x => x.trim()) : [];
      for (let lv = 1; lv <= 3; lv++) res[lv].push(numOf(parts[lv - 1]));
      if (it && !res.ref) res.ref = it.ref;
    }
    for (const i of items) {
      const m = i.str.match(/AEGLs Status:\s*(\w+)/);
      if (m) res.status = m[1];
      if (/\*|NR/.test(i.str) && !T.includes(i.name) && i.str.length < 200) res.notes.push(i.str);
    }
    return res[1].every(v => v == null) && res[2].every(v => v == null) ? null : res;
  }
  function parsePac(items) {
    const v = [1, 2, 3].map(lv => { const it = items.find(i => i.name === "PAC-" + lv); return it ? numOf(it.str) : null; });
    const ref = (items.find(i => /^PAC-/.test(i.name)) || {}).ref;
    return v.some(x => x != null) ? { v, ref } : null;
  }
  function parseErpg(items) {
    const it = items.find(i => /ERPG-1:/.test(i.str));
    if (!it) return null;
    const v = [1, 2, 3].map(lv => { const m = it.str.match(new RegExp("ERPG-" + lv + ":\\s*([^-|]+?)\\s*-")); return m ? numOf(m[1]) : null; });
    return { v, ref: it.ref };
  }
  function parseIdlh(items) {
    const cand = items.map(i => ({ ...i, n: /ppm/.test(i.str) ? numOf(i.str.replace(/^Ca\s*\[/, "")) : null })).filter(i => i.n != null && /NIOSH|ppm\s*$|^\s*Ca|\[ppm\]/.test(i.str));
    const niosh = cand.find(i => /NIOSH/.test(i.str)) || cand[0];
    return niosh ? { v: niosh.n, text: niosh.str.slice(0, 120), ref: niosh.ref } : null;
  }

  async function lookup(query) {
    const cid = /^\d+$/.test(query) ? +query : await cidOf(query);
    if (!cid) return null;
    const failed = [];
    const safe = (key, f) => f.catch(er => { failed.push(key.toUpperCase() + "（" + er.message + "）"); return null; });
    const [p, a, pc, e, i] = await Promise.all([props(cid), safe("aegl", section(cid, "aegl")), safe("pac", section(cid, "pac")), safe("erpg", section(cid, "erpg")), safe("idlh", section(cid, "idlh"))]);
    const res = { ...p, aegl: a && parseAegl(a), pac: pc && parsePac(pc), erpg: e && parseErpg(e), idlh: i && parseIdlh(i), failed, fetched: new Date().toISOString() };
    if (failed.length) return res;   // 一部失敗した結果は保存しない
    try { const all = JSON.parse(localStorage.getItem(KEY) || "{}"); all[cid] = res; localStorage.setItem(KEY, JSON.stringify(all)); } catch (er) { /* 保存できなくても表示はできる */ }
    return res;
  }
  function cached(cid) { try { return (JSON.parse(localStorage.getItem(KEY) || "{}"))[cid] || null; } catch (e) { return null; } }

  window.CDLive = { lookup, cached, parseAegl, parsePac, parseErpg, parseIdlh };
})();
