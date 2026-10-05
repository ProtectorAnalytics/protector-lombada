/**
 * Valida a config da APIPLACAS editada no admin. Só campos editáveis passam;
 * saldo, avisos enviados e id são do sistema.
 */
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function numero(v) {
  if (typeof v === 'string') v = v.replace(',', '.');
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

const REGRAS = {
  preco_consulta: (v) => { const n = numero(v); return n >= 0 && n <= 10 ? n : undefined; },
  teto_mensal: (v) => { const n = numero(v); return n >= 0 && n <= 100000 ? Math.round(n * 100) / 100 : undefined; },
  aviso_percentual: (v) => { const n = numero(v); return Number.isInteger(n) && n >= 1 && n <= 100 ? n : undefined; },
  saldo_minimo: (v) => { const n = numero(v); return Number.isInteger(n) && n >= 0 ? n : undefined; },
  ativo: (v) => (typeof v === 'boolean' ? v : undefined),
  emails_aviso: (v) => {
    if (!Array.isArray(v)) return undefined;
    const lista = [...new Set(v.map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
    return lista.length >= 1 && lista.length <= 10 && lista.every((e) => RE_EMAIL.test(e)) ? lista : undefined;
  },
};

function validarConfig(body) {
  const src = body || {};
  const config = {};
  const erros = [];
  for (const [campo, regra] of Object.entries(REGRAS)) {
    if (!(campo in src)) continue;
    const v = regra(src[campo]);
    if (v === undefined || Number.isNaN(v)) erros.push(campo);
    else config[campo] = v;
  }
  return { config, erros };
}

module.exports = { validarConfig };
