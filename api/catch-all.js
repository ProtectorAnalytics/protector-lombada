const Busboy = require('busboy');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

module.exports.config = {
  api: { bodyParser: false },
};

module.exports = async function handler(req, res) {
  const log = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    query: req.query,
    contentType: req.headers['content-type'] || 'none',
    fields: {},
    files: [],
    rawBody: null,
    parsedJson: null,
  };

  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true, note: 'Endpoint ativo. Aguardando POST.' });
  }

  try {
    const contentType = req.headers['content-type'] || '';

    if (contentType.includes('multipart/form-data')) {
      await new Promise((resolve, reject) => {
        const busboy = Busboy({ headers: req.headers });

        busboy.on('field', (name, val) => {
          log.fields[name] = val.length > 2000 ? val.substring(0, 2000) + '...[truncado]' : val;
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
            });
          });
        });

        busboy.on('finish', resolve);
        busboy.on('error', reject);
        req.pipe(busboy);
      });
    } else {
      await new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > 10000) body = body.substring(0, 10000) + '...[truncado]';
        });
        req.on('end', () => {
          log.rawBody = body;
          try {
            log.parsedJson = JSON.parse(body);
          } catch {}
          resolve();
        });
        req.on('error', reject);
      });
    }

    // Salvar no Supabase com o path original
    await supabase.from('debug_log').insert({
      content_type: log.contentType,
      fields: log.fields,
      files: log.files,
      raw_body: log.url + ' | ' + (log.rawBody || ''),
      parsed_json: log.parsedJson || { _url: log.url, _fields: Object.keys(log.fields), _files: log.files.length },
    });

    console.log('=== DEBUG CAPTURA ===');
    console.log('Content-Type:', log.contentType);
    console.log('Fields:', JSON.stringify(Object.keys(log.fields)));
    console.log('Files:', JSON.stringify(log.files.map(f => f.fieldName + ':' + f.sizeBytes)));
    if (log.parsedJson) console.log('JSON keys:', JSON.stringify(Object.keys(log.parsedJson)));
    console.log('=== FIM ===');

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Erro debug-captura:', err);
    // Salvar erro também
    await supabase.from('debug_log').insert({
      content_type: 'ERROR',
      raw_body: err.message,
      parsed_json: { error: err.message, partialLog: log },
    }).catch(() => {});
    return res.status(200).json({ ok: true, error: err.message });
  }
};
