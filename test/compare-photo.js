#!/usr/bin/env node
// Script para comparar foto original vs comprimida
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const FOTO_PATH = 'e24b3bcc-cb64-4de0-a430-4d5ffca577c9/302af029-5e58-4bcf-8af8-4968642a4d84/2026-03-11T16-30-59_NYS1854.jpg';

async function main() {
  // 1. Download da foto original
  console.log('Baixando foto original...');
  const { data, error } = await supabase.storage
    .from('capturas-fotos')
    .download(FOTO_PATH);

  if (error) { console.error('Erro:', error); return; }

  const originalBuffer = Buffer.from(await data.arrayBuffer());
  console.log(`Original: ${(originalBuffer.length / 1024).toFixed(1)} KB`);

  // 2. Comprimir com mesmas configurações do captura.js
  const compressed = await sharp(originalBuffer)
    .resize(1280, null, { withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer();
  console.log(`Comprimida (q70, 1280px): ${(compressed.length / 1024).toFixed(1)} KB`);
  console.log(`Redução: ${((1 - compressed.length / originalBuffer.length) * 100).toFixed(1)}%`);

  // 3. Obter metadados
  const origMeta = await sharp(originalBuffer).metadata();
  const compMeta = await sharp(compressed).metadata();
  console.log(`\nOriginal:   ${origMeta.width}x${origMeta.height} | ${origMeta.format}`);
  console.log(`Comprimida: ${compMeta.width}x${compMeta.height} | ${compMeta.format}`);

  // 4. Upload da versão comprimida para comparação
  const compPath = FOTO_PATH.replace('.jpg', '_compressed.jpg');
  const { error: upErr } = await supabase.storage
    .from('capturas-fotos')
    .upload(compPath, compressed, { contentType: 'image/jpeg', upsert: true });

  if (upErr) { console.error('Erro upload:', upErr); return; }

  // 5. Gerar URLs assinadas (válidas por 1 hora)
  const { data: origUrl } = await supabase.storage
    .from('capturas-fotos')
    .createSignedUrl(FOTO_PATH, 3600);

  const { data: compUrl } = await supabase.storage
    .from('capturas-fotos')
    .createSignedUrl(compPath, 3600);

  console.log('\n=== LINKS (válidos por 1 hora) ===');
  console.log(`\nORIGINAL:   ${origUrl.signedUrl}`);
  console.log(`\nCOMPRIMIDA: ${compUrl.signedUrl}`);

  // 6. Limpar arquivo de teste depois
  console.log('\n(A foto comprimida de teste será removida do storage em breve)');
}

main().catch(console.error);
