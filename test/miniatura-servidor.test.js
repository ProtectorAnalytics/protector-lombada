/**
 * Miniatura no servidor: geração com sharp (tamanho e tempo num JPEG
 * 1920×1080) e o pós-resposta da captura com o Storage stubado (offline,
 * sem banco): falha da miniatura não derruba nada; original que falhou não
 * gera miniatura.
 * Uso: node test/miniatura-servidor.test.js
 */
const assert = require('node:assert');
const path = require('node:path');
const sharp = require('sharp');

const estado = { uploads: [], falharOriginal: false, falharMini: false, logs: [], updates: [], lastSeen: 0 };

function stub(rel, exports) {
  const id = require.resolve(path.join('..', rel));
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

const supabaseFake = {
  from(tabela) {
    return {
      insert: async (linha) => { if (tabela === 'debug_log') estado.logs.push(linha.raw_body); return { error: null }; },
      update(patch) {
        const q = { eq: () => { estado.updates.push({ tabela, patch }); return q; }, is: () => q, then: (ok) => Promise.resolve({ error: null }).then(ok) };
        return q;
      },
    };
  },
};

stub('lib/supabase', {
  supabase: supabaseFake,
  uploadPhoto: async (p, buf) => {
    const mini = p.endsWith('.mini.jpg');
    if ((mini && estado.falharMini) || (!mini && estado.falharOriginal)) throw new Error('Erro no upload da foto: storage fora');
    estado.uploads.push({ path: p, bytes: buf.length });
    return p;
  },
  findCameraByToken: async () => null,
  findCameraBySerial: async () => null,
  findCapturaRecentePorVehicleId: async () => null,
  saveCaptura: async () => ({}),
  findVeiculo: async () => null,
  getPassagensByPlaca: async () => [],
  updateCameraLastSeen: async () => { estado.lastSeen++; },
  markNotificado: async () => {},
});
stub('lib/pdf-generator', { gerarPDF: async () => Buffer.alloc(0) });
stub('lib/email-sender', { enviarAlerta: async () => {}, getDestinatarios: async () => [] });
stub('lib/veiculos-base-repo', { criarRepoSupabase: () => ({ contarPassagens: async () => 0 }) });

const { processarAposResposta } = require('../api/captura');
const { gerarMiniatura, salvarMiniatura } = require('../lib/miniatura');

let passou = 0;
const casos = [];
function caso(nome, fn) { casos.push(async () => { await fn(); passou++; console.log(`ok - ${nome}`); }); }

// JPEG 1920×1080 a partir de uma foto real do repositório (rua, carros,
// árvores), ampliada e com grão leve — perto das fotos da câmera (~500 KB).
async function jpegDeTeste() {
  const base = path.join(__dirname, '..', 'site', 'images', 'criancas-brincando.jpg');
  const w = 1920; const h = 1080;
  const grao = Buffer.alloc(w * h);
  let s = 12345;
  for (let i = 0; i < grao.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; grao[i] = 118 + ((s >> 16) % 20); }
  const ruido = await sharp(grao, { raw: { width: w, height: h, channels: 1 } }).toColourspace('srgb').png().toBuffer();
  return sharp(base).resize(w, h, { fit: 'cover' })
    .composite([{ input: ruido, blend: 'overlay' }])
    .jpeg({ quality: 90 }).toBuffer();
}

function argsBase(fotoBuffer) {
  return {
    req: { headers: { host: 'lombada.test' } },
    camera: { id: 'cam1', nome: 'Radar 1' },
    cliente: { id: 'cli1', nome: 'Cond', limite_velocidade: 60 },
    captura: { id: 'cap1' },
    alarm: {},
    camIp: null, camMac: null,
    placa: 'ABC1D23', velocidade: 30, timestamp: '2026-10-05T12:00:00.000Z',
    fotoBuffer,
    fotoPath: 'cli1/cam1/2026-10-05T12-00-00_ABC1D23.jpg',
  };
}
function zerar() { Object.assign(estado, { uploads: [], falharOriginal: false, falharMini: false, logs: [], updates: [], lastSeen: 0 }); }

let jpeg;

caso('miniatura de 1920×1080 sai com 640 px de largura, JPEG, ≤ 30 KB', async () => {
  jpeg = await jpegDeTeste();
  await gerarMiniatura(jpeg); // aquece o sharp (primeira carga do libvips)
  const t0 = process.hrtime.bigint();
  const mini = await gerarMiniatura(jpeg);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const meta = await sharp(mini).metadata();
  assert.strictEqual(meta.format, 'jpeg');
  assert.strictEqual(meta.width, 640);
  assert.strictEqual(meta.height, 360);
  assert.ok(mini.length <= 30 * 1024, `miniatura com ${mini.length} bytes`);
  console.log(`   original ${jpeg.length} B → miniatura ${mini.length} B em ${ms.toFixed(1)} ms`);
  assert.ok(ms <= 150, `levou ${ms} ms`);
});
caso('foto menor que 640 px não é ampliada', async () => {
  const pequena = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#888' } }).jpeg().toBuffer();
  const meta = await sharp(await gerarMiniatura(pequena)).metadata();
  assert.strictEqual(meta.width, 200);
});
caso('salvarMiniatura grava ao lado do original com o caminho derivado', async () => {
  const gravados = [];
  const r = await salvarMiniatura({
    fotoPath: 'a/b/x.jpg', fotoBuffer: jpeg,
    upload: async (p, b) => { gravados.push({ p, n: b.length }); },
  });
  assert.strictEqual(gravados.length, 1);
  assert.strictEqual(gravados[0].p, 'a/b/x.mini.jpg');
  assert.strictEqual(r.path, 'a/b/x.mini.jpg');
  assert.ok(r.bytes > 0 && Number.isFinite(r.ms));
});
caso('salvarMiniatura sem caminho válido não grava nada', async () => {
  let chamou = false;
  await assert.rejects(salvarMiniatura({ fotoPath: null, fotoBuffer: jpeg, upload: async () => { chamou = true; } }));
  assert.strictEqual(chamou, false);
});

caso('pós-resposta: grava o original e depois a miniatura', async () => {
  zerar();
  await processarAposResposta(argsBase(jpeg));
  assert.deepStrictEqual(estado.uploads.map((u) => u.path), [
    'cli1/cam1/2026-10-05T12-00-00_ABC1D23.jpg',
    'cli1/cam1/2026-10-05T12-00-00_ABC1D23.mini.jpg',
  ]);
  assert.ok(estado.uploads[1].bytes < estado.uploads[0].bytes / 5);
  assert.strictEqual(estado.lastSeen, 1);
});
caso('pós-resposta: falha da miniatura só vira log; o resto segue', async () => {
  zerar();
  estado.falharMini = true;
  await processarAposResposta(argsBase(jpeg)); // não lança
  assert.deepStrictEqual(estado.uploads.map((u) => u.path), ['cli1/cam1/2026-10-05T12-00-00_ABC1D23.jpg']);
  assert.ok(estado.logs.some((l) => /miniatura/i.test(l)));
  assert.ok(!estado.updates.some((u) => u.tabela === 'capturas'), 'foto_path da captura não pode ser apagado');
  assert.strictEqual(estado.lastSeen, 1);
});
caso('pós-resposta: foto corrompida (sharp falha) só vira log', async () => {
  zerar();
  await processarAposResposta(argsBase(Buffer.from('não é jpeg'.repeat(20))));
  assert.strictEqual(estado.uploads.length, 1);
  assert.ok(estado.logs.some((l) => /miniatura/i.test(l)));
  assert.strictEqual(estado.lastSeen, 1);
});
caso('pós-resposta: original que falhou não gera miniatura', async () => {
  zerar();
  estado.falharOriginal = true;
  await processarAposResposta(argsBase(jpeg));
  assert.strictEqual(estado.uploads.length, 0);
  assert.ok(estado.updates.some((u) => u.tabela === 'capturas' && u.patch.foto_path === null));
  assert.ok(!estado.logs.some((l) => /miniatura/i.test(l)));
  assert.strictEqual(estado.lastSeen, 1);
});
caso('pós-resposta: captura sem foto não tenta miniatura', async () => {
  zerar();
  await processarAposResposta({ ...argsBase(null), fotoPath: null });
  assert.strictEqual(estado.uploads.length, 0);
  assert.strictEqual(estado.logs.length, 0);
});

(async () => {
  for (const c of casos) await c();
  console.log(`\n${passou} casos ok`);
})().catch((e) => { console.error(e); process.exit(1); });
