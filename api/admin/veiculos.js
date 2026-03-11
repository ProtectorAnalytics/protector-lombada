const { autenticar, verificarAcessoCliente, registrarAuditoria, supabase } = require('../../lib/auth-middleware');
const { isValidPlaca, normalizePlaca, sanitize } = require('../../lib/validators');

module.exports = async function handler(req, res) {
  try {
    const { method } = req;

    // GET: listar veículos
    if (method === 'GET') {
      const { profile } = await autenticar(req, ['super_admin', 'admin_cliente', 'operador']);
      const clienteId = req.query.cliente_id || profile.cliente_id;

      if (!clienteId) return res.status(400).json({ error: 'cliente_id obrigatório' });
      if (!verificarAcessoCliente(profile, clienteId)) {
        return res.status(403).json({ error: 'Sem acesso a este cliente' });
      }

      const query = supabase
        .from('veiculos')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('criado_em', { ascending: false });

      // Filtro opcional por placa
      if (req.query.placa) {
        query.ilike('placa', `%${req.query.placa}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json(data);
    }

    // POST: cadastrar veículo
    if (method === 'POST') {
      const { profile } = await autenticar(req, ['super_admin', 'admin_cliente', 'operador']);
      const body = typeof req.body === 'object' ? req.body : JSON.parse(await readBody(req));

      const { cliente_id, placa, nome_morador, unidade, marca, cor } = body;
      const targetCliente = cliente_id || profile.cliente_id;

      if (!targetCliente || !placa) {
        return res.status(400).json({ error: 'Campos obrigatórios: cliente_id, placa' });
      }

      if (!isValidPlaca(placa)) {
        return res.status(400).json({ error: 'Placa inválida. Use formato ABC1234 ou ABC1D23' });
      }

      if (!verificarAcessoCliente(profile, targetCliente)) {
        return res.status(403).json({ error: 'Sem acesso a este cliente' });
      }

      const { data, error } = await supabase
        .from('veiculos')
        .insert({
          cliente_id: targetCliente,
          placa: placa.toUpperCase().trim(),
          nome_morador: nome_morador || null,
          unidade: unidade || null,
          marca: marca || null,
          cor: cor || null,
          ativo: true,
        })
        .select()
        .single();

      if (error) throw error;

      await registrarAuditoria({
        usuarioId: profile.id,
        acao: 'criar',
        tabela: 'veiculos',
        registroId: data.id,
        detalhes: { placa: placa.toUpperCase(), nome_morador },
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
      });

      return res.status(201).json(data);
    }

    // PUT: atualizar veículo
    if (method === 'PUT') {
      const { profile } = await autenticar(req, ['super_admin', 'admin_cliente', 'operador']);
      const body = typeof req.body === 'object' ? req.body : JSON.parse(await readBody(req));
      const { id, ...campos } = body;

      if (!id) return res.status(400).json({ error: 'ID do veículo obrigatório' });

      delete campos.cliente_id;
      delete campos.criado_em;
      if (campos.placa) campos.placa = campos.placa.toUpperCase().trim();

      // Verificar acesso
      const { data: existing } = await supabase
        .from('veiculos')
        .select('cliente_id')
        .eq('id', id)
        .single();

      if (!existing) return res.status(404).json({ error: 'Veículo não encontrado' });
      if (!verificarAcessoCliente(profile, existing.cliente_id)) {
        return res.status(403).json({ error: 'Sem acesso a este cliente' });
      }

      const { data, error } = await supabase
        .from('veiculos')
        .update(campos)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      await registrarAuditoria({
        usuarioId: profile.id,
        acao: 'atualizar',
        tabela: 'veiculos',
        registroId: id,
        detalhes: campos,
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
      });

      return res.status(200).json(data);
    }

    // DELETE: desativar veículo
    if (method === 'DELETE') {
      const { profile } = await autenticar(req, ['super_admin', 'admin_cliente', 'operador']);
      const veiculoId = req.query.id;
      if (!veiculoId) return res.status(400).json({ error: 'ID do veículo obrigatório' });

      // Verificar acesso
      const { data: existing } = await supabase
        .from('veiculos')
        .select('cliente_id, placa')
        .eq('id', veiculoId)
        .single();

      if (!existing) return res.status(404).json({ error: 'Veículo não encontrado' });
      if (!verificarAcessoCliente(profile, existing.cliente_id)) {
        return res.status(403).json({ error: 'Sem acesso a este cliente' });
      }

      const { error } = await supabase
        .from('veiculos')
        .update({ ativo: false })
        .eq('id', veiculoId);

      if (error) throw error;

      await registrarAuditoria({
        usuarioId: profile.id,
        acao: 'desativar',
        tabela: 'veiculos',
        registroId: veiculoId,
        detalhes: { placa: existing.placa },
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
      });

      return res.status(200).json({ ok: true, message: 'Veículo desativado' });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.error });
    console.error('Erro em /api/admin/veiculos:', err.message);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
