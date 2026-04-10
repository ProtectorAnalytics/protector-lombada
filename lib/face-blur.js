/**
 * BLUR AUTOMÁTICO DE PESSOAS (LGPD Fase 4)
 *
 * Módulo responsável por detectar pessoas, motocicletas e bicicletas em uma
 * foto JPEG e aplicar blur automático sobre essas regiões, preservando:
 *
 *   - O veículo-alvo da captura (placa e corpo)
 *   - A faixa superior de informações (data/hora/placa/velocidade)
 *
 * Stack: TensorFlow.js + COCO-SSD (MobileNet V2) + Sharp.
 *
 * Uso típico (chamado pelo api/captura.js):
 *
 *   const { blurPessoas } = require('./lib/face-blur');
 *   const resultado = await blurPessoas(jpegBuffer);
 *   // resultado.buffer  → novo buffer JPEG
 *   // resultado.pessoas → quantas pessoas foram borradas
 *   // resultado.erro    → string se deu erro (buffer original será devolvido)
 *
 * Design:
 *   - Modelo carregado uma vez e cacheado em memória entre invocations
 *     (Fluid Compute reusa instâncias)
 *   - Fallback graceful: qualquer erro retorna o buffer original sem bloquear
 *     a captura (a prioridade é nunca perder uma captura por falha no blur)
 *   - Usa @tensorflow/tfjs puro (sem tfjs-node) porque a Vercel tem restrição
 *     de binários nativos. Mais lento, mas funciona sem configuração extra.
 */

const sharp = require('sharp');

// Configuração (alinhada com a simulação validada)
const BLUR_CLASSES = ['person', 'motorcycle', 'bicycle'];
const SCORE_THRESHOLD = 0.15;
const MAX_DETECTIONS = 30;
const UPSCALE_FACTOR = 2;
const RESERVED_TOP_PX = 25;
const BLUR_SIGMA = 30;
const PADDING_PCT_PERSON = 0.15;
const PADDING_PCT_VEICULO = 0.45;

// Cache do modelo COCO-SSD entre invocations (Fluid Compute reaproveita instância)
let modelCache = null;
let loadingPromise = null;

/**
 * Carrega o modelo COCO-SSD uma vez e cacheia.
 * Chamadas concorrentes aguardam a mesma Promise.
 */
async function carregarModelo() {
  if (modelCache) return modelCache;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    // Lazy require para não impactar cold start de endpoints que não usam blur.
    // Usamos só os pacotes mínimos (core + converter + cpu backend) para
    // manter o bundle da função Vercel abaixo do limite do plano Pro (250MB).
    const tf = require('@tensorflow/tfjs-core');
    require('@tensorflow/tfjs-converter'); // necessário p/ carregar o modelo
    require('@tensorflow/tfjs-backend-cpu');
    const cocoSsd = require('@tensorflow-models/coco-ssd');

    // Ativar backend CPU explicitamente
    await tf.setBackend('cpu');
    await tf.ready();

    const model = await cocoSsd.load({ base: 'mobilenet_v2' });
    modelCache = { model, tf };
    return modelCache;
  })();

  try {
    return await loadingPromise;
  } finally {
    loadingPromise = null;
  }
}

/**
 * Converte buffer JPEG em tensor RGB usando jpeg-js (puro JS, sem nativo).
 */
function jpegBufferToTensor(tf, jpegBuffer) {
  const jpeg = require('jpeg-js');
  const raw = jpeg.decode(jpegBuffer, { useTArray: true });
  const { width, height, data } = raw;
  const numPixels = width * height;
  const rgb = new Uint8Array(numPixels * 3);
  for (let i = 0; i < numPixels; i++) {
    rgb[i * 3] = data[i * 4];
    rgb[i * 3 + 1] = data[i * 4 + 1];
    rgb[i * 3 + 2] = data[i * 4 + 2];
  }
  return tf.tensor3d(rgb, [height, width, 3], 'int32');
}

/**
 * Detecta pessoas/motos/bikes na imagem e aplica blur automático.
 *
 * @param {Buffer} jpegBuffer - Buffer JPEG da foto original
 * @returns {Promise<{buffer: Buffer, pessoas: number, detectadas: object[], erro?: string}>}
 */
async function blurPessoas(jpegBuffer) {
  if (!jpegBuffer || jpegBuffer.length < 100) {
    return { buffer: jpegBuffer, pessoas: 0, detectadas: [], erro: 'buffer vazio' };
  }

  try {
    const { model, tf } = await carregarModelo();

    // 1. Ler metadata da imagem original
    const meta = await sharp(jpegBuffer).metadata();
    const { width, height } = meta;
    if (!width || !height) {
      return { buffer: jpegBuffer, pessoas: 0, detectadas: [], erro: 'sem dimensões' };
    }

    // 2. Upscale 2x para melhorar detecção de pessoas pequenas/distantes
    const upW = width * UPSCALE_FACTOR;
    const upH = height * UPSCALE_FACTOR;
    const upscaledBuffer = await sharp(jpegBuffer)
      .resize(upW, upH, { kernel: 'lanczos3' })
      .jpeg()
      .toBuffer();

    // 3. Inferência
    const tensor = jpegBufferToTensor(tf, upscaledBuffer);
    const predictions = await model.detect(tensor, MAX_DETECTIONS, SCORE_THRESHOLD);
    tensor.dispose();

    // 4. Filtrar classes alvo e converter bbox de volta para escala original
    const pessoas = predictions
      .filter(p => BLUR_CLASSES.includes(p.class))
      .map(p => ({
        class: p.class,
        score: p.score,
        bbox: [
          p.bbox[0] / UPSCALE_FACTOR,
          p.bbox[1] / UPSCALE_FACTOR,
          p.bbox[2] / UPSCALE_FACTOR,
          p.bbox[3] / UPSCALE_FACTOR,
        ],
      }));

    if (pessoas.length === 0) {
      return { buffer: jpegBuffer, pessoas: 0, detectadas: [] };
    }

    // 5. Montar blurs como composições
    const composites = [];
    for (const pessoa of pessoas) {
      let [bx, by, bw, bh] = pessoa.bbox;
      const pct = pessoa.class === 'person' ? PADDING_PCT_PERSON : PADDING_PCT_VEICULO;
      const padX = bw * pct;
      const padY = bh * pct;
      // Para moto/bike, padding extra em cima para cobrir condutor
      const extraTop = pessoa.class === 'person' ? 0 : bh * 0.8;

      let x = Math.max(0, Math.round(bx - padX));
      let y = Math.max(0, Math.round(by - padY - extraTop));
      let w = Math.min(width - x, Math.round(bw + padX * 2));
      let h = Math.min(height - y, Math.round(bh + padY * 2 + extraTop));

      // Preservar faixa superior (data/hora/placa/velocidade)
      if (y < RESERVED_TOP_PX) {
        const diff = RESERVED_TOP_PX - y;
        y = RESERVED_TOP_PX;
        h = Math.max(0, h - diff);
      }
      if (w <= 0 || h <= 0) continue;

      try {
        const blurred = await sharp(jpegBuffer)
          .extract({ left: x, top: y, width: w, height: h })
          .blur(BLUR_SIGMA)
          .toBuffer();
        composites.push({ input: blurred, left: x, top: y });
      } catch {
        // Ignora erro de extract de uma região específica e segue
      }
    }

    if (composites.length === 0) {
      return { buffer: jpegBuffer, pessoas: 0, detectadas: pessoas };
    }

    // 6. Compor tudo
    const output = await sharp(jpegBuffer)
      .composite(composites)
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();

    return {
      buffer: output,
      pessoas: composites.length,
      detectadas: pessoas.map(p => ({
        class: p.class,
        score: Math.round(p.score * 100),
      })),
    };
  } catch (err) {
    // Fallback: qualquer erro retorna o buffer original sem bloquear
    console.error('[face-blur] Erro ao processar:', err?.message);
    return {
      buffer: jpegBuffer,
      pessoas: 0,
      detectadas: [],
      erro: err?.message || 'erro desconhecido',
    };
  }
}

module.exports = { blurPessoas };
