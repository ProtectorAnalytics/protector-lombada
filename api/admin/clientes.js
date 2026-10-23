const { autenticar, verificarAcessoCliente, registrarAuditoria, supabase } = require('../../lib/auth-middleware');
const { contarDestinatarios } = require('../../lib/destinatarios');
const { isValidVelocidade, isValidCNPJ, isValidTelefone, isValidCEP, sanitize } = require('../../lib/validators');

/** Acrescenta destinatarios_email (e-mails distintos que recebem algo) a cada cliente. */
async function comContagemDestinatarios(clientes) {
  const contagem = await contarDestinatarios(clientes.map((c) => c.id));
  return clientes.map((c) => ({ ...c, destinatarios_email: contagem.get(c.id) || 0 }));
}

/**
 * Apaga o que pertence ao cliente, parando no primeiro erro (supabase-js não
 * lança). so_email (sem login) vem antes dos demais usuários: a FK de
 * usuarios.cliente_id é ON DELETE SET NULL, e so_email sem cliente viola o
 * check da 2.2.
 */
async function excluirDadosDoCliente(clienteId) {
  const etapas = [
    () => supabase.from('veiculos').delete().eq('cliente_id', clienteId),
    () => supabase.from('usuarios').delete().eq('cliente_id', clienteId).eq('role', 'so_email'),
    () => supabase.from('cameras').delete().eq('cliente_id', clienteId),
    () => supabase.from('usuarios').delete().eq('cliente_id', clienteId),
  ];
  for (const etapa of etapas) {
    const { error } = await etapa();
    if (error) throw error;
  }
}

module.exports = async function handler(req, res) {
  try {
    const { method } = req;

    // GET: listar clientes
    if (method === 'GET') {
      const { profile } = await autenticar(req, ['super_admin', 'admin_cliente', 'operador']);

      if (profile.role === 'super_admin') {
        const { data, error } = await supabase
          .from('clientes')
          .select('*, cameras(count)')
          .order('criado_em', { ascending: false });
        if (error) throw error;
        return res.status(200).json(await comContagemDestinatarios(data || []));
      } else {
        const { data, error } = await supabase
          .from('clientes')
          .select('*, cameras(count)')
          .eq('id', profile.cliente_id)
          .single();
        if (error) throw error;
        const [comContagem] = await comContagemDestinatarios([data]);
        return res.status(200).json(comContagem);
      }
    }

    // POST: criar cliente (super_admin)
    if (method === 'POST') {
      const { profile } = await autenticar(req, ['super_admin']);
      const body = typeof req.body === 'object' ? req.body : JSON.parse(await readBody(req));

      const { nome, local_via, cidade_uf, cep, endereco, limite_velocidade, cnpj, telefone, contato_nome,
              pdf_titulo, pdf_subtitulo, pdf_rodape, pdf_logo_url, notif_auto_ativa, notif_emails,
              velocidade_maxima_plausivel } = body;

      if (!nome || !local_via || !cidade_uf) {
        return res.status(400).json({ error: 'Campos obrigatórios: nome, local_via, cidade_uf' });
      }

      if (limite_velocidade && !isValidVelocidade(limite_velocidade)) {
        return res.status(400).json({ error: 'Limite de velocidade inválido (deve ser entre 1 e 200 km/h)' });
      }

      if (velocidade_maxima_plausivel !== undefined &&
          (!Number.isInteger(velocidade_maxima_plausivel) || velocidade_maxima_plausivel < 30 || velocidade_maxima_plausivel > 200)) {
        return res.status(400).json({ error: 'Teto de radar plausível inválido (deve ser entre 30 e 200 km/h)' });
      }

      if (cnpj && !isValidCNPJ(cnpj)) {
        return res.status(400).json({ error: 'CNPJ inválido (deve ter 14 dígitos)' });
      }

      if (telefone && !isValidTelefone(telefone)) {
        return res.status(400).json({ error: 'Telefone inválido (deve ter 10 ou 11 dígitos)' });
      }

      if (cep && !isValidCEP(cep)) {
        return res.status(400).json({ error: 'CEP inválido (deve ter 8 dígitos)' });
      }

      const { data, error } = await supabase
        .from('clientes')
        .insert({
          nome,
          local_via,
          cidade_uf,
          cep: cep || null,
          endereco: endereco || null,
          limite_velocidade: limite_velocidade || 30,
          velocidade_maxima_plausivel: velocidade_maxima_plausivel || 80,
          cnpj: cnpj || null,
          telefone: telefone || null,
          contato_nome: contato_nome || null,
          pdf_titulo: pdf_titulo || 'NOTIFICAÇÃO ORIENTATIVA',
          pdf_subtitulo: pdf_subtitulo || 'Transitar em velocidade superior à máxima permitida',
          pdf_rodape: pdf_rodape || null,
          pdf_logo_url: pdf_logo_url || null,
          notif_auto_ativa: notif_auto_ativa || false,
          notif_emails: notif_emails || [],
          ativo: true,
        })
        .select()
        .single();

      if (error) throw error;

      await registrarAuditoria({
        usuarioId: profile.id,
        acao: 'criar',
        tabela: 'clientes',
        registroId: data.id,
        detalhes: { nome },
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
      });

      return res.status(201).json(data);
    }

    // PUT: atualizar cliente
    if (method === 'PUT') {
      const { profile } = await autenticar(req, ['super_admin', 'admin_cliente']);
      const body = typeof req.body === 'object' ? req.body : JSON.parse(await readBody(req));
      const { id, ...campos } = body;

      if (!id) return res.status(400).json({ error: 'ID do cliente obrigatório' });

      if (!verificarAcessoCliente(profile, id)) {
        return res.status(403).json({ error: 'Sem acesso a este cliente' });
      }

      // Whitelist: aceitar apenas campos permitidos
      const CAMPOS_PERMITIDOS = [
        'nome', 'local_via', 'cidade_uf', 'cep', 'endereco',
        'limite_velocidade', 'velocidade_maxima_plausivel', 'cnpj', 'telefone', 'contato_nome',
        'pdf_titulo', 'pdf_subtitulo', 'pdf_rodape', 'pdf_logo_url', 'pdf_corpo_texto',
        'notif_auto_ativa', 'ativo',
        'relatorio_ativo', 'relatorio_dia_semana', 'relatorio_hora', 'relatorio_corpo_texto',
        'relatorio_anexar_pdf',
      ];
      const camposFiltrados = {};
      for (const key of CAMPOS_PERMITIDOS) {
        if (campos[key] !== undefined) camposFiltrados[key] = campos[key];
      }

      // Agendamento do relatório: valores fora da faixa quebrariam o CHECK do
      // banco com erro opaco — validamos aqui para devolver mensagem útil.
      if (camposFiltrados.relatorio_dia_semana !== undefined) {
        const dia = parseInt(camposFiltrados.relatorio_dia_semana, 10);
        if (!Number.isInteger(dia) || dia < 0 || dia > 6) {
          return res.status(400).json({ error: 'Dia da semana inválido (0=domingo a 6=sábado)' });
        }
        camposFiltrados.relatorio_dia_semana = dia;
      }
      if (camposFiltrados.relatorio_hora !== undefined) {
        const hora = parseInt(camposFiltrados.relatorio_hora, 10);
        if (!Number.isInteger(hora) || hora < 0 || hora > 23) {
          return res.status(400).json({ error: 'Hora inválida (0 a 23)' });
        }
        camposFiltrados.relatorio_hora = hora;
      }

      if (camposFiltrados.velocidade_maxima_plausivel !== undefined &&
          (!Number.isInteger(camposFiltrados.velocidade_maxima_plausivel) ||
           camposFiltrados.velocidade_maxima_plausivel < 30 || camposFiltrados.velocidade_maxima_plausivel > 200)) {
        return res.status(400).json({ error: 'Teto de radar plausível inválido (deve ser entre 30 e 200 km/h)' });
      }

      if (Object.keys(camposFiltrados).length === 0) {
        return res.status(400).json({ error: 'Nenhum campo válido para atualizar' });
      }

      const { data, error } = await supabase
        .from('clientes')
        .update(camposFiltrados)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      await registrarAuditoria({
        usuarioId: profile.id,
        acao: 'atualizar',
        tabela: 'clientes',
        registroId: id,
        detalhes: campos,
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
      });

      return res.status(200).json(data);
    }

    // DELETE: desativar ou excluir cliente
    if (method === 'DELETE') {
      const { profile } = await autenticar(req, ['super_admin']);
      const clienteId = req.query.id;
      const permanent = req.query.permanent === 'true';
      if (!clienteId) return res.status(400).json({ error: 'ID do cliente obrigatório' });

      if (permanent) {
        // Exclusão permanente: remove veículos, contatos, câmeras, usuários e o
        // cliente, nesta ordem; qualquer erro para tudo antes de apagar o cliente.
        const { data: cliente, error: leituraErr } = await supabase
          .from('clientes').select('nome').eq('id', clienteId).maybeSingle();
        if (leituraErr) throw leituraErr;
        await excluirDadosDoCliente(clienteId);
        const { error } = await supabase.from('clientes').delete().eq('id', clienteId);
        if (error) throw error;

        await registrarAuditoria({
          usuarioId: profile.id,
          acao: 'excluir',
          tabela: 'clientes',
          registroId: clienteId,
          detalhes: { nome: cliente?.nome || clienteId },
          ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
        });
        return res.status(200).json({ ok: true, message: 'Cliente excluído permanentemente' });
      }

      const { data, error } = await supabase
        .from('clientes')
        .update({ ativo: false })
        .eq('id', clienteId)
        .select()
        .single();

      if (error) throw error;

      // Desativar câmeras do cliente
      const { error: camErr } = await supabase.from('cameras').update({ ativa: false }).eq('cliente_id', clienteId);
      if (camErr) throw camErr;

      await registrarAuditoria({
        usuarioId: profile.id,
        acao: 'desativar',
        tabela: 'clientes',
        registroId: clienteId,
        detalhes: { nome: data.nome },
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
      });

      return res.status(200).json({ ok: true, message: 'Cliente desativado' });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.error });
    console.error('Erro em /api/admin/clientes:', err.message);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) { req.destroy(); reject(new Error('Payload muito grande')); }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
