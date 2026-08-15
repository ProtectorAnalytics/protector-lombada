const Busboy = require('busboy');
const { waitUntil } = require('@vercel/functions');
const {
  findCameraByToken,
  findCameraBySerial,
  findCapturaRecentePorVehicleId,
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

    // Heartbeat da câmera ALPHADIGI (intervalo 10s; updateCameraLastSeen throttle 1×/min)
    if (dados.heartbeat) {
      const hb = dados.heartbeat;
      // Só atualiza ip_address/mac se o payload trouxer — heartbeat normalmente NÃO traz
      // (vimos no PCAP: {countid, timeStamp, outageTs, startTs, serialno} só).
      // Fallback p/ x-forwarded-for produzia IP NAT do roteador (ex: 170.81.101.161)
      // sobrescrevendo o IP LAN real da câmera. Bug corrigido aqui.
      const hbIp = hb.ipaddr || hb.ip || undefined;
      const hbMac = hb.macaddr || hb.mac || undefined;
      await updateCameraLastSeen(camera.id, null, {
        ip_address: hbIp,
        mac_address: hbMac,
        // Telemetria passiva (apenas heartbeat — não pega em todo POST de captura)
        endpoint_configurado: (req.headers.host || '').toLowerCase() || undefined,
        host_camera_reportado: hb.host || undefined,
        uptime_start_ts: hb.startTs || undefined,
        ultimo_outage_reportado: hb.outageTs || undefined,
        heartbeat_countid: Number.isFinite(+hb.countid) ? +hb.countid : undefined,
      });
      return res.status(200).json({ ok: true, type: 'heartbeat' });
    }

    // Extrair MAC e IP da câmera (vem no AlarmInfoPlate ou headers)
    const alarm = dados.AlarmInfoPlate || {};
    const camIp = alarm.ipaddr || alarm.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    const camMac = alarm.macaddr || alarm.mac || '';

    // Normalizar formato AlarmInfoPlate (cameras LPR)
    let normalized = dados;
    // Declarada aqui (e não dentro do bloco) porque precisa chegar até o
    // saveCaptura — é ela que distingue "zero porque o radar errou" de
    // "zero porque o veículo estava abaixo de 10 km/h".
    let velocidadeInvalida = false;
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
      let finalSpeed =
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

      // Sanity-cap: o radar ALPHADIGI ocasionalmente reporta velocidades
      // fisicamente impossíveis em via interna de condomínio (observado:
      // 180 e 351 km/h em rajada na mesma placa, provável reflexo / veículo
      // grande manobrando). Acima do teto plausível do cliente a leitura é
      // inválida → zeramos (vira "SEM RADAR") para não disparar multa falsa.
      // Fallback 80 garante proteção mesmo antes da migration da coluna.
      //
      // O zero é preservado para o dashboard seguir exibindo "SEM RADAR" sem
      // mudança de UI, mas a captura vai marcada com velocidade_invalida —
      // senão o relatório semanal leria este zero como "veículo abaixo de
      // 10 km/h" e contaria uma leitura espúria de 351 km/h como conformidade.
      const tetoPlausivel = Number(cliente.velocidade_maxima_plausivel) || 80;
      if (finalSpeed > tetoPlausivel) {
        velocidadeInvalida = true;
        await logError(
          `vel-absurda ${finalSpeed}km/h > teto ${tetoPlausivel} | placa ${plate.license} | camera ${camera.nome}`,
          {
            velocidade_bruta: finalSpeed,
            teto: tetoPlausivel,
            triggerType: plate.triggerType,
            direction: plate.direction,
            radarSpeed_raw: plate.radarSpeed,
          }
        );
        finalSpeed = 0;
      }

      normalized = {
        placa: plate.license || '',
        velocidade: finalSpeed,
        imageBase64: plate.imageFile || '',
        pixels: plate.confidence || 0,
        tipo_veiculo: plate.type || '',
        cor_veiculo: String(plate.carColor || ''),
        // Identificador do evento na câmera: igual em todas as retransmissões
        // do mesmo evento. Base do dedupe abaixo.
        vehicle_id: Number.isFinite(+plate.vehicleId) ? +plate.vehicleId : null,
      };

      // Debug: se velocidade terminou em 0 mesmo com placa lida, logar
      // o payload completo para investigação posterior. debug_log tem
      // cleanup de 24h via pg_cron, sem poluir o banco.
      // Stripa campos base64 (imageFile/imageFragmentFile) para enxergar
      // speed/radarSpeed/triggerType reais sem o JSON ser truncado.
      if (finalSpeed === 0 && plate.license && !velocidadeInvalida) {
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

    // ── Dedupe de retransmissão ──────────────────────────────────────────────
    // A câmera reenvia o mesmo evento quando não recebe resposta dentro do seu
    // timeout de 10s. O vehicleId é igual em todos os reenvios, então basta
    // consultar se já gravamos este evento há pouco. Ver
    // sql/migration-vehicle-id-dedupe.sql para por que a janela é curta.
    const vehicleId = Number.isFinite(+normalized.vehicle_id) ? +normalized.vehicle_id : null;
    if (vehicleId !== null) {
      const jaGravada = await findCapturaRecentePorVehicleId(camera.id, vehicleId);
      if (jaGravada) {
        // 200 explícito: a câmera precisa entender como recebido, senão
        // continua retransmitindo até estourar o tempo total.
        return res.status(200).json({ ok: true, id: jaGravada.id, duplicado: true });
      }
    }

    // Foto: preservar a imagem original que chega da câmera (sem resize,
    // sem recompressão JPEG). Tamanho típico ALPHADIGI: 200KB-2MB.
    let fotoBuffer = null;
    if (imageBase64) {
      const base64Clean = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const rawBuffer = Buffer.from(base64Clean, 'base64');
      if (rawBuffer.length > 100) {
        fotoBuffer = rawBuffer;
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

    // O caminho do arquivo é determinístico, então dá pra gravá-lo na captura
    // antes do upload acontecer — o upload em si vai para depois da resposta.
    let fotoPath = null;
    if (fotoBuffer && fotoBuffer.length > 100) {
      const ts = new Date(timestamp);
      const dateStr = ts.toISOString().replace(/[:.]/g, '-').slice(0, 19);
      fotoPath = `${cliente.id}/${camera.id}/${dateStr}_${placa}.jpg`;
    }

    // Salvar captura no banco. Continua ANTES da resposta: é o insert que dá o
    // id devolvido à câmera e é ele que faz o dedupe acima enxergar o evento
    // quando a próxima retransmissão chegar.
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
      velocidade_invalida: velocidadeInvalida,
      vehicle_id: vehicleId,
    });

    // ── ACK ──────────────────────────────────────────────────────────────────
    // Responder AQUI, e não no fim. A câmera desiste em 10s (Comunicação,
    // campo 5) e retransmite o evento inteiro, foto e tudo. Upload ao Storage,
    // telemetria, PDF e e-mail levam segundos e não interessam à câmera: ela só
    // precisa saber que recebemos. Todo o resto vai para depois da resposta.
    res.status(200).json({ ok: true, id: captura.id });

    // ── Pós-resposta ─────────────────────────────────────────────────────────
    // waitUntil mantém a função viva depois do ACK (Fluid compute). O trabalho
    // aqui nunca pode lançar: a resposta já foi enviada e uma exceção solta
    // viraria unhandled rejection.
    waitUntil(
      processarAposResposta({
        req, camera, cliente, captura, alarm, camIp, camMac,
        placa, velocidade, timestamp, fotoBuffer, fotoPath,
      }).catch(async (err) => {
        await logError(`Pós-resposta falhou: ${err.message} | camera: ${camera.nome}`, {
          captura_id: captura.id, placa, stack: err.stack?.slice(0, 500),
        });
      })
    );

    return;
  } catch (err) {
    await logError(`Erro geral: ${err.message}`, { stack: err.stack?.slice(0, 500) });
    console.error('Erro no endpoint /api/captura:', err.message);
    // Depois do ACK a resposta já saiu; responder de novo lançaria
    // ERR_HTTP_HEADERS_SENT e mascararia o erro real.
    if (res.headersSent) return;
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * Trabalho que roda DEPOIS da resposta à câmera, via waitUntil.
 *
 * Nada aqui interessa à câmera — ela só precisa do ACK. Manter estas etapas no
 * caminho síncrono era o que estourava o timeout de 10s dela e disparava a
 * retransmissão do evento inteiro.
 *
 * Cada etapa é isolada: falha de uma não impede as seguintes, e a captura já
 * está gravada de qualquer forma.
 */
async function processarAposResposta({
  req, camera, cliente, captura, alarm, camIp, camMac,
  placa, velocidade, timestamp, fotoBuffer, fotoPath,
}) {
  // 1. Upload da foto. O caminho já foi gravado na captura, então em caso de
  //    falha é preciso limpá-lo — senão a captura aponta para um arquivo que
  //    não existe e o dashboard mostra imagem quebrada.
  if (fotoBuffer && fotoPath) {
    try {
      await uploadPhoto(fotoPath, fotoBuffer);
    } catch (uploadErr) {
      await logError(`Erro upload foto: ${uploadErr.message} | camera: ${camera.nome}`, {
        fotoPath, size: fotoBuffer.length, camera_id: camera.id, placa,
      });
      try {
        await supabase.from('capturas').update({ foto_path: null }).eq('id', captura.id);
      } catch { /* não-crítico: melhor path órfão que perder a captura */ }
    }
  }

  // 2. Telemetria da câmera. O AlarmInfoPlate é mais rico que o heartbeat —
  //    aproveitamos para preencher modelo/firmware/host quando vierem.
  //    Nomes variam na família Dahua-like, então tentamos os conhecidos.
  const camFirmware = alarm.softwareVersion || alarm.sw_version || alarm.firmware || alarm.fwVersion || undefined;
  const camModelo = alarm.deviceType || alarm.model || alarm.modelName || alarm.product || undefined;
  const camHost = alarm.host || alarm.deviceName || alarm.cameraName || undefined;
  try {
    await updateCameraLastSeen(camera.id, captura.id, {
      ip_address: camIp || undefined,
      mac_address: camMac || undefined,
      endpoint_configurado: (req.headers.host || '').toLowerCase() || undefined,
      host_camera_reportado: camHost,
      firmware_versao: camFirmware,
    });
    if (camModelo) {
      await supabase.from('cameras').update({ modelo: camModelo }).eq('id', camera.id).is('modelo', null);
    }
  } catch { /* não-crítico */ }

  // 3. Notificação de excesso de velocidade (PDF + e-mail).
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
}

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
