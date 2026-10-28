// S&P 500 (.INX:INDEXSP) desde Google Finance.
// Google Finance no tiene API oficial: su página pide los datos al servicio interno «batchexecute»,
// y aquí se hace la misma consulta. Solo se ejecuta al tocar «Actualizar / Consultar datos».
// Si Google cambia ese servicio, se usa el precio que viene escrito en la página del índice.

const PAIR = [".INX", "INDEXSP"];
const PAGE = "https://www.google.com/finance/quote/.INX:INDEXSP";
const BATCH = "https://www.google.com/finance/beta/_/FinHubUi/data/batchexecute";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const COOKIE = "CONSENT=PENDING+999; SOCS=CAESHAgBEhJnd3NfMjAyNTAxMjMtMF9SQzMaAmVuIAEaBgiAvLW8Bg";
const DAY = 86400000;

// ---------- red ----------
async function pagina() {
  const r = await fetch(PAGE + "?hl=en", { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", Cookie: COOKIE }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`Google Finance respondió ${r.status}`);
  return r.text();
}

async function rpc(id, args, bl, reqid) {
  const fReq = JSON.stringify([[[id, JSON.stringify(args), null, "generic"]]]);
  const qs = new URLSearchParams({ rpcids: id, "source-path": "/finance/quote/.INX:INDEXSP", "f.sid": "-1", hl: "en", _reqid: String(reqid), rt: "c" });
  if (bl) qs.set("bl", bl);
  const r = await fetch(`${BATCH}?${qs}`, {
    method: "POST",
    headers: { "User-Agent": UA, Accept: "*/*", "Accept-Language": "en-US,en;q=0.9", "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "X-Same-Domain": "1", Origin: "https://www.google.com", Referer: PAGE, Cookie: COOKIE },
    body: "f.req=" + encodeURIComponent(fReq),
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error(`Google Finance respondió ${r.status}`);
  return parseWrb(await r.text(), id);
}

// Respuesta «)]}'» + líneas con [["wrb.fr", id, "<json>", ...]]
function parseWrb(text, id) {
  if (!text.startsWith(")]}'")) return null;
  for (const line of text.slice(4).split("\n")) {
    const l = line.trim();
    if (!l || /^\d+$/.test(l)) continue;
    let arr; try { arr = JSON.parse(l); } catch { continue; }
    for (const it of arr) {
      if (Array.isArray(it) && it[0] === "wrb.fr" && it[1] === id && typeof it[2] === "string") {
        try { return JSON.parse(it[2]); } catch { return null; }
      }
    }
  }
  return null;
}

// ---------- lectura de las series ----------
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
// fecha de Google: [año, mes, día, hora?, min?, ..., [desfase_en_segundos]]
function fechaMs(a) {
  if (!Array.isArray(a) || !isNum(a[0]) || a[0] < 1900 || !isNum(a[1]) || !isNum(a[2])) return null;
  const off = a.find((x) => Array.isArray(x) && isNum(x[0]));
  return Date.UTC(a[0], a[1] - 1, a[2], a[3] || 0, a[4] || 0, a[5] || 0) - (off ? off[0] * 1000 : 0);
}
// Una barra puede ser [fecha[], [cierre, cambio, %...], volumen] o [apertura, cierre, máximo, mínimo, "ISO", volumen]
function barra(b) {
  if (!Array.isArray(b)) return null;
  if (Array.isArray(b[0]) && Array.isArray(b[1]) && isNum(b[1][0])) { const t = fechaMs(b[0]); return t ? { t, c: b[1][0] } : null; }
  if (isNum(b[0]) && isNum(b[1]) && isNum(b[2]) && isNum(b[3]) && typeof b[4] === "string") {
    const t = Date.parse(b[4]); return Number.isFinite(t) ? { t, o: b[0], c: b[1], h: b[2], l: b[3] } : null;
  }
  return null;
}
// Busca dentro de la respuesta la lista más larga de barras.
function barras(node, best = { list: [] }) {
  if (!Array.isArray(node)) return best;
  if (node.length >= 2) {
    const ok = node.map(barra);
    const n = ok.filter(Boolean).length;
    if (n >= 2 && n >= node.length * 0.8 && n > best.list.length) best.list = ok.filter(Boolean);
  }
  for (const x of node) barras(x, best);
  return best;
}
const serie = (data) => barras(data).list.sort((a, b) => a.t - b.t);

// precio actual: [precio, cambio, %, ...] y cierre anterior, cerca de [".INX","INDEXSP"]
function cotizacion(data) {
  let out = null;
  (function walk(n) {
    if (out || !Array.isArray(n)) return;
    const k = n.findIndex((x) => Array.isArray(x) && x[0] === PAIR[0] && x[1] === PAIR[1]);
    if (k >= 0) {
      const p = n.slice(k).find((x) => Array.isArray(x) && isNum(x[0]) && isNum(x[1]) && isNum(x[2]));
      if (p) { const prev = n.slice(n.indexOf(p) + 1).find(isNum); const cierreAnterior = prev ?? p[0] - p[1]; out = { precio: p[0], cambio: p[0] - cierreAnterior, pct: ((p[0] - cierreAnterior) / cierreAnterior) * 100, cierreAnterior }; return; }
    }
    n.forEach(walk);
  })(data);
  return out;
}
function cotizacionHtml(html) {
  const m = html.match(/data-last-price="([\d.]+)"/);
  const prev = html.match(/Previous close<\/div>[\s\S]{0,200}?>([\d,]+\.\d+)</);
  if (!m) return null;
  const precio = +m[1], cierreAnterior = prev ? +prev[1].replace(/,/g, "") : null;
  return { precio, cierreAnterior, cambio: cierreAnterior ? precio - cierreAnterior : null, pct: cierreAnterior ? ((precio - cierreAnterior) / cierreAnterior) * 100 : null };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const debug = req.url && req.url.includes("debug");
  const dbg = {};
  try {
    let html = "", bl = null;
    try { html = await pagina(); const m = html.match(/"cfb2h":"([^"]+)"/); bl = m ? m[1] : null; } catch (e) { dbg.pagina = e.message; }

    const pair = [[null, PAIR]];
    const calls = {
      q: rpc("gCvqoe", [pair, 1], bl, 1),
      d1: rpc("c2u4wc", [pair, 1, null, null, null, null, null, 1], bl, 2),   // hoy, cada 5 min, con apertura/máx/mín
      ...Object.fromEntries([2, 3, 4, 5, 6, 7, 8].map((w) => ["w" + w, rpc("c2u4wc", [pair, w], bl, 2 + w)])),
    };
    const keys = Object.keys(calls), got = await Promise.allSettled(Object.values(calls));
    const R = {}; keys.forEach((k, i) => { R[k] = got[i].status === "fulfilled" ? got[i].value : null; if (got[i].status !== "fulfilled") dbg[k] = got[i].reason && got[i].reason.message; });

    let quote = (R.q && cotizacion(R.q)) || (html && cotizacionHtml(html));
    const s1 = R.d1 ? serie(R.d1) : [];
    if (!quote && !s1.length) {
      return res.status(200).json({ ok: false, error: "Google Finance no entregó el S&P 500. Intenta de nuevo en un momento.", ...(debug ? { dbg, html: html.slice(0, 400) } : {}) });
    }
    quote = quote || { precio: s1[s1.length - 1].c, cierreAnterior: null, cambio: null, pct: null };
    const ohlc = s1.filter((b) => isNum(b.o));
    quote.apertura = ohlc.length ? ohlc[0].o : null;
    quote.maximo = ohlc.length ? Math.max(...ohlc.map((b) => b.h)) : (s1.length ? Math.max(...s1.map((b) => b.c)) : null);
    quote.minimo = ohlc.length ? Math.min(...ohlc.map((b) => b.l)) : (s1.length ? Math.min(...s1.map((b) => b.c)) : null);

    // Cada periodo: la serie de Google cuyo rango de fechas se parece más al pedido.
    const cand = ["w2", "w3", "w4", "w5", "w6", "w7", "w8"].map((k) => ({ k, s: R[k] ? serie(R[k]) : [] })).filter((x) => x.s.length >= 2);
    const span = (s) => (s[s.length - 1].t - s[0].t) / DAY;
    const pick = (dias, min, max) => {
      const ok = cand.filter((x) => span(x.s) >= min && span(x.s) <= max).sort((a, b) => Math.abs(span(a.s) - dias) - Math.abs(span(b.s) - dias));
      return ok.length ? ok[0].s : null;
    };
    const fmt = (s, extra) => s ? { t: s.map((b) => b.t), c: s.map((b) => Math.round(b.c * 100) / 100), ...extra } : { error: "Google Finance no entregó este periodo" };
    const series = {
      "1D": s1.length ? fmt(s1, { base: quote.cierreAnterior }) : fmt(pick(1, 0, 1.5), { base: quote.cierreAnterior }),
      "5D": fmt(pick(6, 2, 10)),
      "1M": fmt(pick(30, 18, 45)),
      "6M": fmt(pick(182, 120, 240)),
      "1Y": fmt(pick(365, 300, 430)),
      "5Y": fmt(pick(1826, 1400, 2300)),
    };
    if (debug) Object.assign(dbg, { bl, spans: cand.map((x) => [x.k, x.s.length, Math.round(span(x.s))]) });
    res.status(200).json({ ok: true, fuente: "Google Finance", quote, series, ...(debug ? { dbg } : {}) });
  } catch (e) {
    res.status(200).json({ ok: false, error: e && e.name === "TimeoutError" ? "Google Finance tardó demasiado en responder" : (e && e.message) || "No se pudo consultar el S&P 500" });
  }
};
module.exports._test = { parseWrb, serie, cotizacion, cotizacionHtml, fechaMs };
