#!/usr/bin/env node
/**
 * Gera site/og-image.jpg (1200x630) — imagem de preview para
 * WhatsApp / redes sociais. Foto do equipamento + identidade Protector.
 * Uso: node scripts/gen-og-image.js
 */
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const IMG = path.join(ROOT, 'site', 'images');
const OUT = path.join(ROOT, 'site', 'og-image.jpg');

const W = 1200, H = 630;
const PHOTO_W = 470;
const PHOTO_X = W - PHOTO_W; // 730
const FONT = 'Helvetica Neue, Helvetica, Arial, sans-serif';

(async () => {
  // 1. Fundo: gradiente azul-marinho da marca + glow suave
  const bgSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#0E1838"/>
        <stop offset="0.55" stop-color="#0A1128"/>
        <stop offset="1" stop-color="#050A18"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.16" cy="0.28" r="0.65">
        <stop offset="0" stop-color="#046BD2" stop-opacity="0.32"/>
        <stop offset="1" stop-color="#046BD2" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
  </svg>`);
  const base = await sharp(bgSvg).png().toBuffer();

  // 2. Foto do equipamento (lado direito)
  const photo = await sharp(path.join(IMG, 'lombada-hero.jpg'))
    .resize(PHOTO_W, H, { fit: 'cover', position: 'center' })
    .toBuffer();

  // 3. Logo Protector em branco (mascara via canal alpha)
  const logoSrc = path.join(IMG, 'logo-protector.png');
  const lMeta = await sharp(logoSrc).metadata();
  const alpha = await sharp(logoSrc).ensureAlpha().extractChannel('alpha').png().toBuffer();
  const whiteLogo = await sharp({
    create: { width: lMeta.width, height: lMeta.height, channels: 3, background: '#FFFFFF' },
  }).joinChannel(alpha).png().toBuffer();
  const LOGO_W = 256;
  const logo = await sharp(whiteLogo).resize({ width: LOGO_W }).toBuffer();

  // 4. Overlay: blend da emenda foto/painel + textos
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="seam" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#0A1128" stop-opacity="0.98"/>
        <stop offset="1" stop-color="#0A1128" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect x="${PHOTO_X - 12}" y="0" width="190" height="${H}" fill="url(#seam)"/>
    <rect x="0" y="${H - 8}" width="${W}" height="8" fill="#046BD2"/>

    <text x="72" y="222" font-family="${FONT}" font-size="21" font-weight="700"
          letter-spacing="3.4" fill="#3B9AFF">SISTEMA DE SEGURAN&#199;A VI&#193;RIA</text>

    <text x="70" y="312" font-family="${FONT}" font-size="84" font-weight="800"
          fill="#F1F5F9">Lombada</text>
    <text x="70" y="402" font-family="${FONT}" font-size="84" font-weight="800"
          fill="#F1F5F9">Educativa</text>

    <text x="72" y="462" font-family="${FONT}" font-size="25" font-weight="400" fill="#AEB9CC">
      Exibe a velocidade ao motorista, l&#234; as placas</text>
    <text x="72" y="497" font-family="${FONT}" font-size="25" font-weight="400" fill="#AEB9CC">
      e alerta a administra&#231;&#227;o &#8212; em tempo real,</text>
    <text x="72" y="532" font-family="${FONT}" font-size="25" font-weight="400" fill="#AEB9CC">
      direto na portaria do condom&#237;nio.</text>

    <circle cx="78" cy="571" r="5" fill="#34D399"/>
    <text x="94" y="579" font-family="${FONT}" font-size="24" font-weight="700"
          fill="#3B9AFF">lombada.appps.com.br</text>
  </svg>`);

  await sharp(base)
    .composite([
      { input: photo, left: PHOTO_X, top: 0 },
      { input: overlay, left: 0, top: 0 },
      { input: logo, left: 70, top: 70 },
    ])
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(OUT);

  const out = await sharp(OUT).metadata();
  console.log(`OK -> ${OUT} (${out.width}x${out.height})`);
})().catch((e) => { console.error(e); process.exit(1); });
