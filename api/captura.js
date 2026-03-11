const Busboy = require('busboy');
const {
  findCameraByToken,
  findCameraBySerial,
  saveCaptura,
  uploadPhoto,
  findVeiculo,
  getPassagensByPlaca,
  updateCameraLastSeen,
  markNotificado,
  supabase,
} = require('../lib/supabase');
const { gerarPDF } = require('../lib/pdf-generator');
const { enviarAlerta, getDestinatarios } = require('../lib/email-sender');

// Desabilitar body parser do Vercel para lidar com multipart
module.exports.config = {
  api: { bodyParser: false },
};

// Log debug to database for diagnostics
async function logDebug(level, message, data) {
  try {
    await supabase.from('debug_log').insert({
      content_type: level,
      raw_body: message,
      parsed_json: typeof data === 'object' ? data : { value: data },
    });
  } catch { /* ignore log errors */ }
}

module.exports = async function handler(req, res) {
  const method = req.method;
  const url = req.url;
  const contentType = req.headers['content-type'] || '';

  // Log every request that arrives
  await logDebug('captura-request', `${method} ${url} | content-type: ${contentType}`, {
    method,
    url,
    contentType,
    query: req.query,
    headers: {
      'content-type': contentType,
      'content-length': req.headers['content-length'] || 'unknown',
      'user-agent': req.headers['user-agent'] || 'unknown',
    },
  });

  // Apenas POST
  if (method !== 'POST') {
    return res.status(405).json({ error: 'Metodo nao permitido' });
  }

  try {
    // Parsear body FIRST (we need it to find camera by serial if no token)
    const dados = await parseBody(req);

    // Log the parsed data type
    const dataType = dados.AlarmInfoPlate ? 'AlarmInfoPlate'
      : dados.SerialData ? 'SerialData'
      : dados.heartbeat ? 'Heartbeat'
      : 'Unknown';

    // Try to find camera: first by token, then by serial from payload
    const token = req.query.token;
    let camera = null;

    if (token) {
      camera = await findCameraByToken(token);
    }

    // Fallback: identify camera by serial number from AlarmInfoPlate or SerialData
    if (!camera) {
      const serialno = dados.AlarmInfoPlate?.serialno
        || dados.AlarmInfoPlate?.result?.PlateResult?.serialno
        || dados.SerialData?.serialno
        || dados.heartbeat?.serialno
        || null;

      if (serialno) {
        camera = await findCameraBySerial(serialno);
        if (camera) {
          await logDebug('captura-auth', `Camera encontrada por serial: ${serialno}`, { serialno, cameraId: camera.id });
        }
      }

      if (!camera) {
        await logDebug('captura-error', `Camera nao encontrada | token: ${token || 'none'} | type: ${dataType}`, {
          token, dataType, url,
          serialno: serialno || 'none',
        });
        return res.status(401).json({ error: 'Camera nao identificada' });
      }
    }

    const cliente = camera.clientes;
    if (!cliente || !cliente.ativo) {
      return res.status(403).json({ error: 'Cliente inativo' });
    }

    // Log the parsed data (without image to save space)
    const logData = JSON.parse(JSON.stringify(dados));
    if (logData.AlarmInfoPlate?.result?.PlateResult?.imageFile) {
      logData.AlarmInfoPlate.result.PlateResult.imageFile = '[BASE64_IMAGE_REMOVED]';
    }
    if (logData.imageBase64) logData.imageBase64 = '[BASE64_IMAGE_REMOVED]';

    await logDebug('captura-parsed', `${dataType} | camera: ${camera.nome}`, logData);

    // Skip SerialData - it's raw sensor data, not plate recognition
    if (dados.SerialData) {
      return res.status(200).json({ ok: true, skipped: 'SerialData' });
    }

    // Skip heartbeat if it somehow arrives here
    if (dados.heartbeat) {
      return res.status(200).json({ ok: true, skipped: 'heartbeat' });
    }

    // Normalizar formato AlarmInfoPlate (cameras LPR)
    let normalized = dados;
    if (dados.AlarmInfoPlate) {
      const alarm = dados.AlarmInfoPlate;
      const plate = alarm.result?.PlateResult || {};
      normalized = {
        placa: plate.license || '',
        velocidade: plate.speed || 0,
        imageBase64: plate.imageFile || '',
        pixels: plate.confidence || 0,
        tipo_veiculo: plate.type || '',
        cor_veiculo: String(plate.carColor || ''),
      };

      await logDebug('captura-normalized', `AlarmInfoPlate -> placa: ${normalized.placa}, vel: ${normalized.velocidade}`, {
        placa: normalized.placa,
        velocidade: normalized.velocidade,
        pixels: normalized.pixels,
        hasImage: !!normalized.imageBase64,
      });
    }

    // Extrair campos
    const placa = (normalized.plate || normalized.placa || '').toUpperCase().trim();
    const velocidade = parseInt(normalized.speed || normalized.velocidade || '0', 10);
    const timestamp = normalized.time || normalized.timestamp || new Date().toISOString();
    const pixels = parseInt(normalized.pixels || '0', 10);
    const tipoVeiculo = normalized.vehicleType || normalized.tipo_veiculo || '';
    const corVeiculo = normalized.vehicleColor || normalized.cor_veiculo || '';
    const imageBase64 = normalized.imageBase64 || normalized.image || normalized.foto || '';

    if (!placa) {
      await logDebug('captura-error', 'Placa vazia apos normalizacao', { normalized: logData, placa });
      return res.status(400).json({ error: 'Placa nao fornecida' });
    }

    // Decodificar foto
    let fotoBuffer = null;
    if (imageBase64) {
      const base64Clean = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      fotoBuffer = Buffer.from(base64Clean, 'base64');
    }

    // Upload da foto ao Storage
    let fotoPath = null;
    if (fotoBuffer && fotoBuffer.length > 100) {
      const ts = new Date(timestamp);
      const dateStr = ts.toISOString().replace(/[:.]/g, '-').slice(0, 19);
      fotoPath = `${cliente.id}/${camera.id}/${dateStr}_${placa}.jpg`;
      try {
        await uploadPhoto(fotoPath, fotoBuffer);
      } catch (uploadErr) {
        await logDebug('captura-error', `Erro upload foto: ${uploadErr.message}`, { fotoPath, size: fotoBuffer.length });
        // Continue without photo
        fotoPath = null;
      }
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

    // Atualizar last_seen da camera
    await updateCameraLastSeen(camera.id, captura.id);

    await logDebug('captura-success', `Captura salva: ${placa} ${velocidade}km/h`, {
      capturaId: captura.id,
      placa,
      velocidade,
      fotoPath,
    });

    // Verificar se precisa notificar
    if (velocidade > cliente.limite_velocidade) {
      try {
        const veiculo = await findVeiculo(cliente.id, placa);
        const historico = await getPassagensByPlaca(cliente.id, placa, 30);

        const pdfBuffer = await gerarPDF({
          cliente,
          captura,
          veiculo,
          fotoBuffer,
          historico,
        });

        const destinatarios = await getDestinatarios(cliente.id, 'alerta');

        if (destinatarios.length > 0) {
          await enviarAlerta({
            destinatarios,
            placa,
            velocidade,
            timestamp,
            nomeCondominio: cliente.nome,
            localVia: cliente.local_via,
            limite: cliente.limite_velocidade,
            pdfBuffer,
          });
        }

        await markNotificado(captura.id);
      } catch (notifErr) {
        await logDebug('captura-error', `Erro notificacao: ${notifErr.message}`, { placa, velocidade });
        console.error('Erro na notificacao:', notifErr.message);
      }
    }

    return res.status(200).json({ ok: true, id: captura.id });
  } catch (err) {
    await logDebug('captura-error', `Erro geral: ${err.message}`, { stack: err.stack?.slice(0, 500) });
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
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('JSON invalido'));
        }
      });
      req.on('error', reject);
    } else if (contentType.includes('multipart/form-data')) {
      const fields = {};
      const busboy = Busboy({ headers: req.headers });

      busboy.on('field', (name, val) => {
        // Try to parse JSON fields (camera may send AlarmInfoPlate as a field)
        try {
          const parsed = JSON.parse(val);
          if (typeof parsed === 'object') {
            Object.assign(fields, parsed);
          } else {
            fields[name] = val;
          }
        } catch {
          fields[name] = val;
        }
      });

      busboy.on('file', (name, file, info) => {
        const chunks = [];
        file.on('data', (chunk) => chunks.push(chunk));
        file.on('end', () => {
          fields.imageBase64 = Buffer.concat(chunks).toString('base64');
          fields._fileInfo = { name: info.filename, mimeType: info.mimeType, size: Buffer.concat(chunks).length };
        });
      });

      busboy.on('finish', () => resolve(fields));
      busboy.on('error', reject);

      req.pipe(busboy);
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
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
