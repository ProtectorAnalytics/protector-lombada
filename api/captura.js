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
const { checkRateLimit } = require('../lib/rate-limiter');
const { isValidToken, parseTimestamp } = require('../lib/validators');
const { blurPessoas } = require('../lib/face-blur');

// Desabilitar body parser do Vercel para lidar com multipart
module.exports.config = {
  api: { bodyParser: false },
};

// Log only errors to database (debug_log is auto-cleaned every 6h by pg_cron, retaining max 24h)
async function logError(message, data) {
  try {
    await supabase.from('debug_log').insert({
      content_type: 'captura-error',
      raw_body: message,
      parsed_json: typeof data === 'object' ? data : { value: data },
    });
  } catch (logErr) { console.error('Falha ao gravar log:', logErr.message); }
}

module.exports = async function handler(req, res) {
  const method = req.method;
  const url = req.url;
  const contentType = req.headers['content-type'] || '';

  // Apenas POST
  if (method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
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
      if (!isValidToken(token)) {
        return res.status(400).json({ error: 'Formato de token inválido' });
      }
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
      }

      if (!camera) {
        const logIp = dados.AlarmInfoPlate?.ipaddr || dados.AlarmInfoPlate?.ip || req.headers['x-forwarded-for'] || '';
        const logMac = dados.AlarmInfoPlate?.macaddr || dados.AlarmInfoPlate?.mac || '';
        await logError(`Câmera não encontrada | token: ${token || 'none'} | type: ${dataType}`, {
          token, dataType, url,
          serialno: serialno || 'none',
          ip: logIp || 'none',
          mac: logMac || 'none',
        });
        return res.status(401).json({ error: 'Câmera não identificada' });
      }
    }

    // Rate limiting por câmera
    const rateCheck = checkRateLimit(camera.id);
    if (!rateCheck.allowed) {
      res.setHeader('Retry-After', Math.ceil(rateCheck.resetIn / 1000));
      return res.status(429).json({ error: 'Muitas requisições. Tente novamente em breve.' });
    }

    const cliente = camera.clientes;
    if (!cliente || !cliente.ativo) {
      return res.status(403).json({ error: 'Cliente inativo' });
    }

    // Skip SerialData - it's raw sensor data, not plate recognition
    if (dados.SerialData) {
      return res.status(200).json({ ok: true, skipped: 'SerialData' });
    }

    // Skip heartbeat if it somehow arrives here
    if (dados.heartbeat) {
      return res.status(200).json({ ok: true, skipped: 'heartbeat' });
    }

    // Extrair MAC e IP da câmera (vem no AlarmInfoPlate ou headers)
    const alarm = dados.AlarmInfoPlate || {};
    const camIp = alarm.ipaddr || alarm.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    const camMac = alarm.macaddr || alarm.mac || '';

    // Normalizar formato AlarmInfoPlate (cameras LPR)
    let normalized = dados;
    if (dados.AlarmInfoPlate) {
      const plate = alarm.result?.PlateResult || {};
      // Speed: a câmera ALPHADIGI pode retornar velocidade em vários campos
      // dependendo do modelo/firmware. Tenta todos os locais conhecidos antes
      // de desistir e retornar 0.
      const tryNum = (v) => {
        if (v === null || v === undefined || v === '') return 0;
        const n = typeof v === 'number' ? v : parseFloat(v);
        return Number.isFinite(n) && n >= 0 ? n : 0;
      };
      const finalSpeed =
        tryNum(plate.radarSpeed?.Speed?.PerHour) ||
        tryNum(plate.radarSpeed?.speed?.perHour) ||
        tryNum(plate.radarSpeed?.PerHour) ||
        tryNum(plate.radarSpeed?.perHour) ||
        tryNum(plate.radarSpeed) ||
        tryNum(plate.speed) ||
        tryNum(plate.Speed) ||
        tryNum(plate.speedKmh) ||
        tryNum(plate.velocity) ||
        tryNum(alarm.speed) ||
        tryNum(alarm.Speed) ||
        tryNum(dados.speed) ||
        0;

      normalized = {
        placa: plate.license || '',
        velocidade: finalSpeed,
        imageBase64: plate.imageFile || '',
        pixels: plate.confidence || 0,
        tipo_veiculo: plate.type || '',
        cor_veiculo: String(plate.carColor || ''),
      };

      // Debug: se velocidade terminou em 0 mesmo com placa lida, logar
      // o payload completo para investigação posterior. debug_log tem
      // cleanup de 24h via pg_cron, sem poluir o banco.
      // Stripa campos base64 (imageFile/imageFragmentFile) para enxergar
      // speed/radarSpeed/triggerType reais sem o JSON ser truncado.
      if (finalSpeed === 0 && plate.license) {
        const plateKeys = Object.keys(plate).join(',');
        const { imageFile: _img, imageFragmentFile: _frag, ...plateLite } = plate;
        await logError(
          `vel=0 com placa ${plate.license} | camera ${camera.nome} | keys: ${plateKeys}`,
          {
            plate_json: JSON.stringify(plateLite).slice(0, 4000),
            alarm_keys: Object.keys(alarm).join(','),
            speed_raw: plate.speed,
            radarSpeed_raw: plate.radarSpeed,
            triggerType: plate.triggerType,
            direction: plate.direction,
          }
        );
      }
    }

    // Extrair campos
    const placa = (normalized.plate || normalized.placa || '').toUpperCase().trim();
    const velocidade = parseInt(normalized.speed || normalized.velocidade || '0', 10);
    const rawTimestamp = normalized.time || normalized.timestamp || null;
    const parsedTs = rawTimestamp ? parseTimestamp(rawTimestamp) : null;
    const timestamp = parsedTs ? parsedTs.toISOString() : new Date().toISOString();
    const pixels = parseInt(normalized.pixels || '0', 10);
    const tipoVeiculo = normalized.vehicleType || normalized.tipo_veiculo || '';
    const corVeiculo = normalized.vehicleColor || normalized.cor_veiculo || '';
    const imageBase64 = normalized.imageBase64 || normalized.image || normalized.foto || '';

    if (!placa) {
      await logError('Placa vazia após normalização', { placa });
      return res.status(400).json({ error: 'Placa não fornecida' });
    }

    // Foto: preservar a imagem original que chega da câmera (sem resize,
    // sem recompressão JPEG). Tamanho típico ALPHADIGI: 200KB-2MB.
    // Quando blur LGPD está ativo no cliente, o módulo de blur recompacta
    // internamente — inevitável, mas mantemos quality alta dentro dele.
    let fotoBuffer = null;
    let blurInfo = null;
    if (imageBase64) {
      const base64Clean = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const rawBuffer = Buffer.from(base64Clean, 'base64');
      if (rawBuffer.length > 100) {
        fotoBuffer = rawBuffer;

        // ── LGPD Fase 4: blur automático de pessoas (se ativado no cliente) ──
        if (cliente.blur_automatico === true) {
          try {
            const resultadoBlur = await blurPessoas(fotoBuffer);
            if (resultadoBlur?.buffer) {
              fotoBuffer = resultadoBlur.buffer;
              blurInfo = {
                pessoas_borradas: resultadoBlur.pessoas,
                detectadas: resultadoBlur.detectadas,
                erro: resultadoBlur.erro || null,
              };
            }
          } catch (blurErr) {
            // Nunca bloquear a captura por falha no blur
            await logError(`Blur falhou, usando original | camera: ${camera.nome}`, {
              err: blurErr.message, camera_id: camera.id, placa,
            });
          }
        }
      } else {
        await logError(`Imagem muito pequena (${rawBuffer.length} bytes) | camera: ${camera.nome}`, {
          camera_id: camera.id, placa, base64Len: imageBase64.length,
        });
      }
    } else {
      await logError(`Sem imagem no payload | camera: ${camera.nome}`, {
        camera_id: camera.id, placa, contentType,
        hasAlarmInfoPlate: !!dados.AlarmInfoPlate,
        hasImageFile: !!dados.AlarmInfoPlate?.result?.PlateResult?.imageFile,
        payloadKeys: Object.keys(normalized).join(','),
      });
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
        await logError(`Erro upload foto: ${uploadErr.message} | camera: ${camera.nome}`, {
          fotoPath, size: fotoBuffer.length, camera_id: camera.id, placa,
        });
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

    // Atualizar last_seen da camera (com IP/MAC se disponíveis)
    await updateCameraLastSeen(camera.id, captura.id, {
      ip_address: camIp || null,
      mac_address: camMac || null,
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
          cameraNome: camera.nome || '',
          camera,
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
            cameraNome: camera.nome || '',
          });
        }

        await markNotificado(captura.id);
      } catch (notifErr) {
        await logError(`Erro notificação: ${notifErr.message}`, { placa, velocidade });
        console.error('Erro na notificação:', notifErr.message);
      }
    }

    return res.status(200).json({ ok: true, id: captura.id });
  } catch (err) {
    await logError(`Erro geral: ${err.message}`, { stack: err.stack?.slice(0, 500) });
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

    const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB

    if (contentType.includes('application/json')) {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > MAX_BODY_SIZE) { req.destroy(); reject(new Error('Payload muito grande')); }
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('JSON inválido'));
        }
      });
      req.on('error', reject);
    } else if (contentType.includes('multipart/form-data')) {
      const fields = {};
      const busboy = Busboy({ headers: req.headers, limits: { fileSize: 10 * 1024 * 1024, fields: 20 } });

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
