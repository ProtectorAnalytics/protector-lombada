const { autenticar, verificarAcessoCliente, registrarAuditoria, supabase } = require('../../lib/auth-middleware');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  try {
    const { method } = req;

    // GET: listar câmeras
    if (method === 'GET') {
      const { profile } = await autenticar(req, ['super_admin', 'admin_cliente', 'operador']);
      const clienteId = req.query.cliente_id || profile.cliente_id;

      if (!clienteId) return res.status(400).json({ error: 'cliente_id obrigatório' });
      if (!verificarAcessoCliente(profile, clienteId)) {
        return res.status(403).json({ error: 'Sem acesso a este cliente' });
      }

      const { data, error } = await supabase
        .from('cameras')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('criado_em', { ascending: false });

      if (error) throw error;
      return res.status(200).json(data);
    }

    // POST: criar câmera
    if (method === 'POST') {
      const { profile } = await autenticar(req, ['super_admin']);
      const body = typeof req.body === 'object' ? req.body : JSON.parse(await readBody(req));

      const { cliente_id, nome, serial_number, nome_exibicao } = body;
      if (!cliente_id || !nome) {
        return res.status(400).json({ error: 'Campos obrigatórios: cliente_id, nome' });
      }

      // Se tiver serial_number, verificar se já existe
      if (serial_number) {
        const { data: existing } = await supabase
          .from('cameras')
          .select('id')
          .eq('serial_number', serial_number)
          .eq('ativa', true)
          .single();
        if (existing) {
          return res.status(409).json({ error: `Serial ${serial_number} já cadastrado em outra câmera` });
        }
      }

      const token = crypto.randomBytes(16).toString('hex');

      const insertData = { cliente_id, nome, token, ativa: true };
      if (serial_number) insertData.serial_number = serial_number.trim();
      if (nome_exibicao) insertData.nome_exibicao = nome_exibicao.trim();

      const { data, error } = await supabase
        .from('cameras')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      await registrarAuditoria({
        usuarioId: profile.id,
        acao: 'criar',
        tabela: 'cameras',
        registroId: data.id,
        detalhes: { nome, cliente_id, serial_number: serial_number || null },
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
      });

      return res.status(201).json(data);
    }

    // PUT: atualizar câmera
    if (method === 'PUT') {
      const { profile } = await autenticar(req, ['super_admin']);
      const body = typeof req.body === 'object' ? req.body : JSON.parse(await readBody(req));
      const { id, ...campos } = body;

      if (!id) return res.status(400).json({ error: 'ID da câmera obrigatório' });

      delete campos.token; // token não pode ser alterado
      delete campos.criado_em;

      const { data, error } = await supabase
        .from('cameras')
        .update(campos)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      await registrarAuditoria({
        usuarioId: profile.id,
        acao: 'atualizar',
        tabela: 'cameras',
        registroId: id,
        detalhes: campos,
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
      });

      return res.status(200).json(data);
    }

    // DELETE: desativar câmera
    if (method === 'DELETE') {
      const { profile } = await autenticar(req, ['super_admin']);
      const cameraId = req.query.id;
      if (!cameraId) return res.status(400).json({ error: 'ID da câmera obrigatório' });

      const { data, error } = await supabase
        .from('cameras')
        .update({ ativa: false })
        .eq('id', cameraId)
        .select()
        .single();

      if (error) throw error;

      await registrarAuditoria({
        usuarioId: profile.id,
        acao: 'desativar',
        tabela: 'cameras',
        registroId: cameraId,
        detalhes: { nome: data.nome },
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
      });

      return res.status(200).json({ ok: true, message: 'Câmera desativada' });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.error });
    console.error('Erro em /api/admin/cameras:', err.message);
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
