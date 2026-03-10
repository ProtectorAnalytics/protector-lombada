const Busboy = require('busboy');

module.exports.config = {
  api: { bodyParser: false },
};

module.exports = async function handler(req, res) {
  const log = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    query: req.query,
    headers: {},
    contentType: req.headers['content-type'] || 'none',
    fields: {},
    files: [],
    rawBody: null,
  };

  // Copiar headers relevantes (sem cookies/auth sensíveis)
  for (const [key, val] of Object.entries(req.headers)) {
    if (!['cookie', 'authorization'].includes(key.toLowerCase())) {
      log.headers[key] = val;
    }
  }

  if (req.method !== 'POST') {
    log.note = 'Método não é POST, retornando info básica';
    console.log('=== DEBUG CAPTURA ===');
    console.log(JSON.stringify(log, null, 2));
    return res.status(200).json(log);
  }

  try {
    const contentType = req.headers['content-type'] || '';

    if (contentType.includes('multipart/form-data')) {
      // Parse multipart
      await new Promise((resolve, reject) => {
        const busboy = Busboy({ headers: req.headers });

        busboy.on('field', (name, val) => {
          // Limitar valor a 500 chars para não explodir o log
          log.fields[name] = val.length > 500 ? val.substring(0, 500) + '...[truncado]' : val;
        });

        busboy.on('file', (name, file, info) => {
          const chunks = [];
          file.on('data', (chunk) => chunks.push(chunk));
          file.on('end', () => {
            const buf = Buffer.concat(chunks);
            log.files.push({
              fieldName: name,
              filename: info.filename,
              mimeType: info.mimeType,
              encoding: info.encoding,
              sizeBytes: buf.length,
              first100bytes: buf.toString('hex').substring(0, 200),
            });
          });
        });

        busboy.on('finish', resolve);
        busboy.on('error', reject);
        req.pipe(busboy);
      });
    } else {
      // Capturar body raw
      await new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > 10000) body = body.substring(0, 10000) + '...[truncado]';
        });
        req.on('end', () => {
          log.rawBody = body;
          // Tentar parsear como JSON
          try {
            log.parsedJson = JSON.parse(body);
          } catch {}
          resolve();
        });
        req.on('error', reject);
      });
    }

    console.log('=== DEBUG CAPTURA ===');
    console.log(JSON.stringify(log, null, 2));
    console.log('=== FIM DEBUG ===');

    return res.status(200).json({
      ok: true,
      message: 'Dados recebidos e logados com sucesso',
      summary: {
        fields: Object.keys(log.fields),
        files: log.files.map(f => ({ name: f.fieldName, filename: f.filename, size: f.sizeBytes, mime: f.mimeType })),
        contentType: log.contentType,
      },
      fullLog: log,
    });
  } catch (err) {
    console.error('Erro no debug-captura:', err);
    return res.status(200).json({ ok: true, error: err.message, partialLog: log });
  }
};
