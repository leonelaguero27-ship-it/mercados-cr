// Tipos de cambio de ventanilla (compra/venta) desde el cuadro 1015 del BCCR.
// La página https://sdd.bccr.fi.cr/es/IndicadoresEconomicos/Inicio/Personalizado/2039?Cuadro=1015
// carga sus datos desde esta API pública: primero pide una llave CSRF y luego el cuadro.
// Solo se ejecuta cuando el usuario toca «Actualizar / Consultar datos».

const API = "https://apim.bccr.fi.cr/SDDE/api/";
const CSRF = API + "Bccr.GE.SDDE.IndicadoresSitioExterno.ServiciosUsuario.API/Token/GenereCSRF";
const CUADRO = API + "Bccr.GE.SDDE.IndicadoresSitioExterno.GrupoVariables.API/CuadroPersonalizadoGrupoVariables/ObtenerDatosCuadroPersonalizado";
const GRUPO = 1015;
const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";

const ENTIDADES = [
  { id: "bn", nombre: "Banco Nacional", re: /nacional/i },
  { id: "bp", nombre: "Banco Popular", re: /popular/i },
  { id: "bac", nombre: "BAC Credomatic", re: /\bbac\b/i },
  { id: "ari", nombre: "Ari Casa de Cambio", re: /\bari\b/i },
  { id: "mm", nombre: "MultiMoney", re: /multi\s*money/i },
  { id: "improsa", nombre: "Banco Improsa", re: /improsa/i },
];

function headers(token) {
  const h = {
    "User-Agent": UA,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "es-CR,es;q=0.9",
    Origin: "https://sdd.bccr.fi.cr",
    Referer: "https://sdd.bccr.fi.cr/es/IndicadoresEconomicos/Inicio/",
  };
  if (token) h["Token_CSRF"] = token;
  return h;
}

// «505,00», «505.00», «1.505,25» → número
function num(text) {
  let s = String(text ?? "").replace(/[\s ₡]/g, "");
  if (!s || !/\d/.test(s)) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (!/^\d+\.\d{1,4}$/.test(s)) s = s.replace(/\./g, "");
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

function hoyCR() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Costa_Rica" }).format(new Date());
}

// Convierte la respuesta del cuadro en filas de texto y saca las 4 entidades.
function extraer(indicadores) {
  const filas = indicadores
    .filter(Array.isArray)
    .map((r) => r.map((c) => String((c && (c.valorEspanol ?? c.valor)) ?? "").trim()))
    .filter((r) => r.some(Boolean));
  const hi = filas.findIndex((r) => /compra/i.test(r.join(" ")) && /venta/i.test(r.join(" ")));
  if (hi < 0) throw new Error("El cuadro del BCCR no trae columnas de compra y venta");
  const head = filas[hi].map((c) => c.toLowerCase());
  const iC = head.findIndex((c) => c.includes("compra"));
  const iV = head.findIndex((c) => c.includes("venta"));
  const iF = head.findIndex((c) => c.includes("actualiza") || c.includes("fecha"));
  const cuerpo = filas.slice(hi + 1);
  const nombreDe = (r) => r.find((c, i) => i !== iC && i !== iV && i !== iF && c && num(c) === null) || "";

  const out = ENTIDADES.map((e) => {
    const r = cuerpo.find((row) => e.re.test(nombreDe(row)));
    if (!r) return { ...e, re: undefined, ok: false, error: "No aparece en el cuadro del BCCR" };
    const compra = num(r[iC]), venta = num(r[iV]);
    if (!(compra > 100 && venta > 100)) return { ...e, re: undefined, ok: false, error: "Sin dato de compra/venta hoy" };
    return { ...e, re: undefined, ok: true, compra, venta, fuente: nombreDe(r), actualizado: iF >= 0 ? r[iF] : "" };
  });
  return { entidades: out, todas: cuerpo.map(nombreDe).filter(Boolean) };
}

async function obtener() {
  const t = await fetch(CSRF, { headers: headers(), signal: AbortSignal.timeout(12000) });
  if (!t.ok) throw new Error(`El BCCR no respondió (llave ${t.status})`);
  const token = (await t.text()).trim().replace(/^"|"$/g, "");
  if (token.length < 20) throw new Error("El BCCR no entregó la llave de consulta");
  const url = `${CUADRO}?idGrupoVariable=${GRUPO}&fechaAConsultar=${hoyCR()}`;
  const r = await fetch(url, { headers: headers(token), signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`El BCCR no respondió (cuadro ${r.status})`);
  const p = await r.json();
  const ind = p && p.datos && p.datos.indicadores;
  if (!p || !p.estado || !Array.isArray(ind) || !ind.length) throw new Error("El BCCR devolvió el cuadro vacío");
  return extraer(ind);
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    res.status(200).json({ ok: true, ...(await obtener()) });
  } catch (e) {
    const msg = e && e.name === "TimeoutError" ? "El BCCR tardó demasiado en responder" : (e && e.message) || "Error al consultar el BCCR";
    res.status(200).json({ ok: false, error: msg });
  }
};
module.exports._test = { num, extraer };
