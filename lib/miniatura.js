/**
 * Miniatura leve da foto da captura (320 px de largura, JPEG q60 mozjpeg).
 *
 * A tabela e os cartões do painel mostram a foto em 40×28 px e ~190 px de
 * altura; baixar o original 1920×1080 (~500 KB) para isso custava ~35 MB por
 * carga. A miniatura vive ao lado do original (mesma pasta = mesma política
 * de leitura do bucket) com o nome de caminhoMiniatura().
 *
 * O sharp é carregado só aqui dentro, na hora de gerar: se o binário nativo
 * faltar no pacote da função, a captura (/api/placa) continua de pé e só a
 * miniatura falha (vira log).
 */
const { caminhoMiniatura } = require('../site/js/miniatura');

const LARGURA_MINI = 320;
const QUALIDADE_MINI = 60;

/** Buffer JPEG da miniatura. Lança se a foto não puder ser lida. */
async function gerarMiniatura(fotoBuffer) {
  const sharp = require('sharp');
  return sharp(fotoBuffer)
    .rotate()
    .resize({ width: LARGURA_MINI, withoutEnlargement: true })
    .jpeg({ quality: QUALIDADE_MINI, mozjpeg: true })
    .toBuffer();
}

/**
 * Gera e grava a miniatura ao lado do original. Lança em qualquer falha —
 * quem chama decide (na captura, falha vira só log).
 */
async function salvarMiniatura({ fotoPath, fotoBuffer, upload, gerar = gerarMiniatura }) {
  const destino = caminhoMiniatura(fotoPath);
  if (!destino) throw new Error('caminho da foto inválido para miniatura');
  const inicio = Date.now();
  const mini = await gerar(fotoBuffer);
  await upload(destino, mini);
  return { path: destino, bytes: mini.length, ms: Date.now() - inicio };
}

module.exports = { gerarMiniatura, salvarMiniatura, LARGURA_MINI, QUALIDADE_MINI };
