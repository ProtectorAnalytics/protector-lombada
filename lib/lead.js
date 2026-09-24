/**
 * Validação do formulário "Solicitar proposta" do site (POST /api/lead).
 * Função pura, sem I/O, para ser testada em test/lead.test.js.
 */

const LIMITES = { nome: 200, email: 200, condominio: 200, cidade: 120, mensagem: 2000 };
const OBRIGATORIOS = ['nome', 'email', 'condominio', 'cidade'];

function sanitize(str, max) {
  if (!str) return '';
  return String(str).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim().slice(0, max);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * @returns {{ lead: object, errors: string[] }} errors lista os campos inválidos
 */
function validateLead(body) {
  const src = body || {};
  const lead = Object.fromEntries(
    Object.entries(LIMITES).map(([campo, max]) => [campo, sanitize(src[campo], max)])
  );
  const errors = OBRIGATORIOS.filter((campo) => lead[campo].length < 2);
  if (!errors.includes('email') && !isValidEmail(lead.email)) errors.push('email');
  return { lead, errors };
}

module.exports = { validateLead };
