/**
 * Destinatários de e-mail lidos do cadastro de usuários (Portaria 2.2).
 *
 * Recebe quem é usuário ATIVO do cliente com a opção do tipo ligada:
 *   alerta    → usuarios.recebe_alertas    ("Recebe alertas de excesso")
 *   relatorio → usuarios.recebe_relatorio  ("Recebe relatório periódico")
 * Porteiro (@porteiro.invalid) nunca recebe. E-mails saem com trim + lower e
 * sem repetição (o mesmo e-mail pode existir duas vezes num cliente, ex.: um
 * admin reativado e um so_email).
 *
 * supabase-js não lança: todo `error` vira exceção aqui.
 */

const COLUNA_POR_TIPO = Object.freeze({ alerta: 'recebe_alertas', relatorio: 'recebe_relatorio' });
const DOMINIO_PORTEIRO = '@porteiro.invalid';

const normalizar = (email) => String(email || '').trim().toLowerCase();
const podeReceber = (email) => email.length > 0 && !email.endsWith(DOMINIO_PORTEIRO);

function colunaDo(tipo) {
  const coluna = COLUNA_POR_TIPO[tipo];
  if (!coluna) throw new Error(`destinatarios: tipo inválido "${tipo}"`);
  return coluna;
}

/** Um item por e-mail normalizado, mantendo o primeiro nome visto. */
function unicosPorEmail(linhas) {
  const vistos = new Map();
  for (const linha of linhas || []) {
    const email = normalizar(linha.email);
    if (!podeReceber(email) || vistos.has(email)) continue;
    vistos.set(email, { nome: linha.nome || null, email });
  }
  return [...vistos.values()];
}

/** @param {{ from: Function }} db cliente supabase-js (service role) */
function criarDestinatarios(db) {
  /**
   * @param {string} clienteId
   * @param {'alerta'|'relatorio'} tipo
   * @returns {Promise<Array<{ nome: string|null, email: string }>>}
   */
  async function destinatariosComNome(clienteId, tipo) {
    const coluna = colunaDo(tipo);
    const { data, error } = await db
      .from('usuarios')
      .select('nome, email')
      .eq('cliente_id', clienteId)
      .eq('ativo', true)
      .eq(coluna, true);
    if (error) throw new Error(`destinatarios: ${error.message}`);
    return unicosPorEmail(data);
  }

  /**
   * E-mails do tipo. Sem ninguém marcado, ninguém recebe: não há mais lista
   * antiga de reserva (desmarcar todos não pode religar e-mails esquecidos).
   * @returns {Promise<string[]>}
   */
  async function destinatariosDoCliente(clienteId, tipo) {
    const lista = await destinatariosComNome(clienteId, tipo);
    return lista.map((d) => d.email);
  }

  /**
   * Quantos e-mails distintos recebem algo (alerta ou relatório), por cliente.
   * @param {string[]} clienteIds
   * @returns {Promise<Map<string, number>>}
   */
  async function contarDestinatarios(clienteIds) {
    const ids = [...new Set(clienteIds || [])];
    if (ids.length === 0) return new Map();
    const { data, error } = await db
      .from('usuarios')
      .select('cliente_id, email, recebe_alertas, recebe_relatorio')
      .in('cliente_id', ids)
      .eq('ativo', true);
    if (error) throw new Error(`destinatarios contagem: ${error.message}`);

    const porCliente = new Map(ids.map((id) => [id, new Set()]));
    for (const linha of data || []) {
      const email = normalizar(linha.email);
      if (!(linha.recebe_alertas || linha.recebe_relatorio) || !podeReceber(email)) continue;
      porCliente.get(linha.cliente_id)?.add(email);
    }
    return new Map([...porCliente].map(([id, set]) => [id, set.size]));
  }

  return { destinatariosDoCliente, destinatariosComNome, contarDestinatarios };
}

// Instância padrão, com o cliente service role do projeto (criado sob demanda
// para os testes poderem usar criarDestinatarios com mock).
let padrao = null;
const instancia = () => (padrao ||= criarDestinatarios(require('./supabase').supabase));

module.exports = {
  criarDestinatarios,
  destinatariosDoCliente: (...a) => instancia().destinatariosDoCliente(...a),
  destinatariosComNome: (...a) => instancia().destinatariosComNome(...a),
  contarDestinatarios: (...a) => instancia().contarDestinatarios(...a),
};
