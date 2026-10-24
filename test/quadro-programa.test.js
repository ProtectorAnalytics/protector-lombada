/**
 * Programa do PC do quadro (quadro-windows/, Tauri v2): atualização sozinha
 * assinada e publicação no Release. Uso: node test/quadro-programa.test.js
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');
const conf = JSON.parse(ler('quadro-windows/src-tauri/tauri.conf.json'));
const cargo = ler('quadro-windows/src-tauri/Cargo.toml');
const pacote = JSON.parse(ler('quadro-windows/package.json'));
const workflow = ler('.github/workflows/quadro-windows.yml');
const main = ler('quadro-windows/src-tauri/src/main.rs');

let n = 0;
function caso(nome, fn) { fn(); n += 1; console.log(`ok - ${nome}`); }

caso('mesma versão no tauri.conf, Cargo.toml e package.json', () => {
  const doCargo = (cargo.match(/^version = "([^"]+)"/m) || [])[1];
  assert.strictEqual(doCargo, conf.version);
  assert.strictEqual(pacote.version, conf.version);
});

caso('atualizador: chave pública minisign e latest.json do último Release', () => {
  const u = conf.plugins.updater;
  assert.ok(Buffer.from(u.pubkey, 'base64').toString().includes('minisign public key'), 'pubkey');
  assert.deepStrictEqual(u.endpoints, ['https://github.com/ProtectorAnalytics/protector-lombada/releases/latest/download/latest.json']);
  assert.strictEqual(u.windows.installMode, 'passive');
  assert.strictEqual(conf.bundle.createUpdaterArtifacts, true);
  assert.match(cargo, /^tauri-plugin-updater = "=\d+\.\d+\.\d+"$/m, 'versão exata');
});

caso('o programa só procura atualização no build final e reabre depois de instalar', () => {
  assert.ok(main.includes('tauri_plugin_updater::Builder::new().build()'));
  assert.ok(main.includes('atualizar_sozinho(handle);'));
  assert.match(main, /fn atualizar_sozinho[\s\S]*?if cfg!\(debug_assertions\) \{\s*return;/);
  assert.match(main, /instalar_versao_nova\(&app\)\)\s*\{\s*app\.restart\(\);/);
});

caso('workflow: assina os pacotes, confere a tag e publica latest.json', () => {
  assert.strictEqual((workflow.match(/TAURI_SIGNING_PRIVATE_KEY: \$\{\{ secrets\.TAURI_SIGNING_PRIVATE_KEY \}\}/g) || []).length, 2);
  assert.ok(workflow.includes('[ "quadro-v$versao" = "$GITHUB_REF_NAME" ]'), 'tag = versão');
  ['"windows-x86_64"', '"darwin-aarch64"', '"darwin-x86_64"', 'latest.json --clobber', 'Quadro-Lombada-Mac.app.tar.gz.sig', 'Quadro-Lombada-Setup.exe.sig']
    .forEach((t) => assert.ok(workflow.includes(t), t));
  assert.ok(!/TAURI_SIGNING_PRIVATE_KEY:\s*[^$\s]/.test(workflow), 'chave nunca escrita no arquivo');
});

console.log(`\n${n} casos ok`);
