const Busboy = require('busboy');
const {
  findCameraByToken,
  saveCaptura,
  uploadPhoto,
  findVeiculo,
  getPassagensByPlaca,
  markNotificado,
} = require('../lib/supabase');
const { gerarPDF } = require('../lib/pdf-generator');
const { enviarAlerta } = require('../lib/email-sender');

// Desabilitar body parser do Vercel para lidar com multipart
module.exports.config = {
  api: { bodyParser: false },
};

module.exports = async function handler(req, res) {
  // Apenas POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // Autenticação por token
  const token = req.query.token;
  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  try {
    const camera = await findCameraByToken(token);
    if (!camera) {
      return res.status(401).json({ error: 'Token inválido ou câmera inativa' });
    }

    const cliente = camera.clientes;
    if (!cliente || !cliente.ativo) {
      return res.status(403).json({ error: 'Cliente inativo' });
    }

    // Parsear body (JSON ou multipart)
    const dados = await parseBody(req);

    // Extrair campos
    const placa = (dados.plate || dados.placa || '').toUpperCase().trim();
    const velocidade = parseInt(dados.speed || dados.velocidade || '0', 10);
    const timestamp = dados.time || dados.timestamp || new Date().toISOString();
    const pixels = parseInt(dados.pixels || '0', 10);
    const tipoVeiculo = dados.vehicleType || dados.tipo_veiculo || '';
    const corVeiculo = dados.vehicleColor || dados.cor_veiculo || '';
    const imageBase64 = dados.imageBase64 || dados.image || dados.foto || '';

    if (!placa) {
      return res.status(400).json({ error: 'Placa não fornecida' });
    }

    // Decodificar foto
    let fotoBuffer = null;
    if (imageBase64) {
      // Remover prefixo data:image/jpeg;base64, se presente
      const base64Clean = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      fotoBuffer = Buffer.from(base64Clean, 'base64');
    }

    // Upload da foto ao Storage
    let fotoPath = null;
    if (fotoBuffer) {
      const ts = new Date(timestamp);
      const dateStr = ts.toISOString().replace(/[:.]/g, '-').slice(0, 19);
      fotoPath = `${cliente.id}/${camera.id}/${dateStr}_${placa}.jpg`;
      await uploadPhoto(fotoPath, fotoBuffer);
    }

    // Salvar captura no banco
    const captura = await saveCaptura({
      camera_id: camera.id,
      cliente_id: cliente.id,
      placa,
      velocidade,
      pixels,
      tipo_veiculo: tipoVeiculo,
      cor_veiculo: corVeiculo,
      foto_path: fotoPath,
      timestamp,
      notificado: false,
    });

    // Verificar se precisa notificar
    if (velocidade > cliente.limite_velocidade) {
      try {
        // Buscar dados do veículo
        const veiculo = await findVeiculo(cliente.id, placa);

        // Buscar histórico de passagens
        const historico = await getPassagensByPlaca(cliente.id, placa, 30);

        // Gerar PDF
        const pdfBuffer = await gerarPDF({
          cliente,
          captura,
          veiculo,
          fotoBuffer,
          historico,
        });

        // Enviar e-mail
        if (cliente.emails_notificacao && cliente.emails_notificacao.length > 0) {
          await enviarAlerta({
            destinatarios: cliente.emails_notificacao,
            placa,
            velocidade,
            timestamp,
            nomeCondominio: cliente.nome,
            localVia: cliente.local_via,
            limite: cliente.limite_velocidade,
            pdfBuffer,
          });
        }

        // Marcar como notificado
        await markNotificado(captura.id);
      } catch (notifErr) {
        // Log do erro mas não falha a captura
        console.error('Erro na notificação:', notifErr.message);
      }
    }

    return res.status(200).json({ ok: true, id: captura.id });
  } catch (err) {
    console.error('Erro no endpoint /api/captura:', err.message);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * Parseia o body da request (JSON ou multipart/form-data)
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';

    if (contentType.includes('application/json')) {
      // JSON body
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('JSON inválido'));
        }
      });
      req.on('error', reject);
    } else if (contentType.includes('multipart/form-data')) {
      // Multipart form-data (via busboy)
      const fields = {};
      const busboy = Busboy({ headers: req.headers });

      busboy.on('field', (name, val) => {
        fields[name] = val;
      });

      busboy.on('file', (name, file, info) => {
        const chunks = [];
        file.on('data', (chunk) => chunks.push(chunk));
        file.on('end', () => {
          // Converter arquivo para base64 e armazenar no campo imageBase64
          fields.imageBase64 = Buffer.concat(chunks).toString('base64');
        });
      });

      busboy.on('finish', () => resolve(fields));
      busboy.on('error', reject);

      req.pipe(busboy);
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      // URL encoded
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        const params = new URLSearchParams(body);
        const fields = {};
        for (const [key, val] of params) {
          fields[key] = val;
        }
        resolve(fields);
      });
      req.on('error', reject);
    } else {
      // Tenta parsear como JSON como fallback
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve({});
        }
      });
      req.on('error', reject);
    }
  });
}
