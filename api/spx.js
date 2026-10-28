// S&P 500 (^GSPC): cotización del día y las 6 temporalidades del gráfico en una sola consulta,
// para que cambiar de 1D a 5Y no haga más llamadas. Solo se ejecuta al tocar «Actualizar / Consultar datos».

const RANGOS = {
  "1D": ["1d", "5m"],
  "5D": ["5d", "15m"],
  "1M": ["1mo", "60m"],
  "6M": ["6mo", "1d"],
  "1Y": ["1y", "1d"],
  "5Y": ["5y", "1wk"],
};
const HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];
const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";

async function chart(range, interval) {
  let last;
  for (const h of HOSTS) {
    try {
      const url = `${h}/v8/finance/chart/%5EGSPC?range=${range}&interval=${interval}&includePrePost=false`;
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
      if (r.status === 429) { last = new Error("Yahoo limitó las consultas; intenta en un minuto"); continue; }
      if (!r.ok) { last = new Error(`Yahoo respondió ${r.status}`); continue; }
      const j = await r.json();
      const res = j && j.chart && j.chart.result && j.chart.result[0];
      if (!res) { last = new Error("Yahoo no devolvió datos"); continue; }
      return res;
    } catch (e) {
      last = e && e.name === "TimeoutError" ? new Error("Yahoo tardó demasiado en responder") : e;
    }
  }
  throw last || new Error("No se pudo consultar el S&P 500");
}

function serie(res) {
  const ts = res.timestamp || [];
  const q = (res.indicators && res.indicators.quote && res.indicators.quote[0]) || {};
  const t = [], c = [];
  ts.forEach((s, i) => { const v = q.close && q.close[i]; if (v != null) { t.push(s * 1000); c.push(Math.round(v * 100) / 100); } });
  return { t, c, q, ts };
}

function cotizacion(res1d) {
  const m = res1d.meta || {};
  const s = serie(res1d);
  const opens = (s.q.open || []).filter((v) => v != null);
  const highs = (s.q.high || []).filter((v) => v != null);
  const lows = (s.q.low || []).filter((v) => v != null);
  const price = m.regularMarketPrice ?? s.c[s.c.length - 1];
  const prev = m.chartPreviousClose ?? m.previousClose;
  return {
    precio: price,
    cierreAnterior: prev,
    cambio: prev != null && price != null ? price - prev : null,
    pct: prev ? ((price - prev) / prev) * 100 : null,
    apertura: opens.length ? opens[0] : null,
    minimo: m.regularMarketDayLow ?? (lows.length ? Math.min(...lows) : null),
    maximo: m.regularMarketDayHigh ?? (highs.length ? Math.max(...highs) : null),
    hora: (m.regularMarketTime || 0) * 1000,
  };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const keys = Object.keys(RANGOS);
  const out = await Promise.allSettled(keys.map((k) => chart(...RANGOS[k])));
  const first = out[0];
  if (first.status !== "fulfilled") {
    return res.status(200).json({ ok: false, error: (first.reason && first.reason.message) || "No se pudo consultar el S&P 500" });
  }
  const series = {};
  keys.forEach((k, i) => {
    if (out[i].status === "fulfilled") { const s = serie(out[i].value); series[k] = { t: s.t, c: s.c }; }
    else series[k] = { error: (out[i].reason && out[i].reason.message) || "Sin datos" };
  });
  const quote = cotizacion(first.value);
  if (series["1D"] && !series["1D"].error) series["1D"].base = quote.cierreAnterior;
  res.status(200).json({ ok: true, quote, series });
};
module.exports._test = { serie, cotizacion };
