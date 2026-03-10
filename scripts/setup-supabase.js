#!/usr/bin/env node

/**
 * PROTECTOR LOMBADA - Setup Automático do Supabase
 *
 * Uso: node scripts/setup-supabase.js
 *
 * Requisitos: .env configurado com SUPABASE_URL e SUPABASE_SERVICE_KEY
 *
 * Este script:
 * 1. Cria as tabelas (clientes, cameras, veiculos, capturas)
 * 2. Configura RLS policies
 * 3. Cria bucket de storage
 * 4. Cria usuário de teste no Auth
 * 5. Cadastra cliente de exemplo + câmera com token
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Carregar .env se existir
try {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim();
          if (!process.env[key]) process.env[key] = val;
        }
      }
    });
  }
} catch {}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('\n❌ ERRO: Variáveis SUPABASE_URL e SUPABASE_SERVICE_KEY não encontradas.');
  console.error('   Crie o arquivo .env na raiz do projeto com essas variáveis.\n');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  console.log('\n🔧 PROTECTOR LOMBADA - Setup do Supabase');
  console.log('=========================================\n');
  console.log(`📡 URL: ${SUPABASE_URL}\n`);

  // 1. Executar Schema SQL
  console.log('1️⃣  Executando schema SQL...');
  const schemaSQL = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');

  // Separar em statements individuais (remover comentários de bloco e linhas vazias)
  const statements = schemaSQL
    .replace(/\/\*[\s\S]*?\*\//g, '') // remove /* ... */
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  let sqlErrors = 0;
  for (const stmt of statements) {
    const { error } = await supabase.rpc('exec_sql', { sql: stmt + ';' }).maybeSingle();
    if (error) {
      // Tentar via REST se rpc não existe
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({ sql: stmt + ';' }),
      });
      if (!resp.ok) {
        // Ignorar erros de "already exists"
        const errText = await resp.text();
        if (!errText.includes('already exists') && !errText.includes('duplicate')) {
          console.log(`   ⚠️  SQL warning: ${errText.slice(0, 100)}`);
          sqlErrors++;
        }
      }
    }
  }

  if (sqlErrors > 0) {
    console.log(`   ⚠️  ${sqlErrors} warnings no SQL (pode ser normal se as tabelas já existem)`);
    console.log('   💡 Recomendação: Execute o sql/schema.sql manualmente no SQL Editor do Supabase\n');
  } else {
    console.log('   ✅ Schema SQL processado\n');
  }

  // 2. Criar bucket de storage
  console.log('2️⃣  Configurando Storage bucket...');
  const { error: bucketError } = await supabase.storage.createBucket('capturas-fotos', {
    public: false,
  });
  if (bucketError) {
    if (bucketError.message?.includes('already exists')) {
      console.log('   ✅ Bucket "capturas-fotos" já existe\n');
    } else {
      console.log(`   ⚠️  Bucket: ${bucketError.message}\n`);
    }
  } else {
    console.log('   ✅ Bucket "capturas-fotos" criado\n');
  }

  // 3. Criar usuário de teste
  console.log('3️⃣  Criando usuário de teste no Auth...');
  const testEmail = 'admin@protector.teste';
  const testPassword = 'Protector@2025';

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: testEmail,
    password: testPassword,
    email_confirm: true,
  });

  let userId;
  if (authError) {
    if (authError.message?.includes('already been registered') || authError.message?.includes('already exists')) {
      console.log(`   ✅ Usuário ${testEmail} já existe`);
      // Buscar o userId
      const { data: users } = await supabase.auth.admin.listUsers();
      const existing = users?.users?.find(u => u.email === testEmail);
      userId = existing?.id;
    } else {
      console.log(`   ❌ Erro Auth: ${authError.message}`);
    }
  } else {
    userId = authData.user.id;
    console.log(`   ✅ Usuário criado: ${testEmail}`);
  }
  console.log(`   📧 E-mail: ${testEmail}`);
  console.log(`   🔑 Senha: ${testPassword}\n`);

  // 4. Cadastrar cliente de exemplo
  console.log('4️⃣  Cadastrando cliente de exemplo...');
  const clienteId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  // Verificar se já existe
  const { data: existingCliente } = await supabase
    .from('clientes')
    .select('id')
    .eq('id', clienteId)
    .maybeSingle();

  if (existingCliente) {
    console.log('   ✅ Cliente de exemplo já existe\n');
  } else {
    const { error: clienteError } = await supabase.from('clientes').insert({
      id: clienteId,
      user_id: userId,
      nome: 'Condomínio Parque das Flores',
      local_via: 'Rua Principal - Via Interna',
      cidade_uf: 'São Paulo/SP',
      cep: '01234-567',
      endereco: 'Rua das Flores, 100',
      limite_velocidade: 30,
      emails_notificacao: [testEmail],
    });
    if (clienteError) {
      console.log(`   ❌ Erro cliente: ${clienteError.message}\n`);
    } else {
      console.log('   ✅ Cliente "Condomínio Parque das Flores" cadastrado\n');
    }
  }

  // 5. Cadastrar câmera com token
  console.log('5️⃣  Cadastrando câmera com token...');
  const cameraToken = crypto.randomBytes(16).toString('hex');

  const { data: existingCamera } = await supabase
    .from('cameras')
    .select('id, token')
    .eq('cliente_id', clienteId)
    .limit(1)
    .maybeSingle();

  let finalToken;
  if (existingCamera) {
    finalToken = existingCamera.token;
    console.log('   ✅ Câmera já existe');
  } else {
    const { error: camError } = await supabase.from('cameras').insert({
      cliente_id: clienteId,
      nome: 'Câmera Entrada Principal',
      token: cameraToken,
    });
    if (camError) {
      console.log(`   ❌ Erro câmera: ${camError.message}`);
      finalToken = cameraToken;
    } else {
      console.log('   ✅ Câmera "Entrada Principal" cadastrada');
      finalToken = cameraToken;
    }
  }
  console.log(`   🎫 Token da câmera: ${finalToken}\n`);

  // 6. Cadastrar veículos de exemplo
  console.log('6️⃣  Cadastrando veículos de exemplo...');
  const veiculos = [
    { cliente_id: clienteId, placa: 'RPK5F09', nome_morador: 'João Silva', unidade: 'Bloco A - Apt 101', marca: 'Toyota Corolla', cor: 'Prata' },
    { cliente_id: clienteId, placa: 'ABC1D23', nome_morador: 'Maria Santos', unidade: 'Bloco B - Apt 205', marca: 'Honda Civic', cor: 'Preto' },
  ];

  for (const v of veiculos) {
    const { error } = await supabase.from('veiculos').upsert(v, { onConflict: 'cliente_id,placa', ignoreDuplicates: true });
    if (error && !error.message?.includes('duplicate') && !error.message?.includes('unique')) {
      console.log(`   ⚠️  Veículo ${v.placa}: ${error.message}`);
    }
  }
  console.log('   ✅ Veículos cadastrados\n');

  // Resumo final
  console.log('=========================================');
  console.log('✅ SETUP CONCLUÍDO!\n');
  console.log('📋 DADOS DE ACESSO:');
  console.log('─────────────────────────────────────────');
  console.log(`   Dashboard Login:`);
  console.log(`     E-mail: ${testEmail}`);
  console.log(`     Senha:  ${testPassword}`);
  console.log('');
  console.log(`   Token da Câmera (para configurar na ALPHADIGI):`);
  console.log(`     ${finalToken}`);
  console.log('');
  console.log(`   URL do endpoint da câmera:`);
  console.log(`     POST https://SEU-DOMINIO/api/captura?token=${finalToken}`);
  console.log('');
  console.log(`   Teste com cURL:`);
  console.log(`     curl -X POST "https://SEU-DOMINIO/api/captura?token=${finalToken}" \\`);
  console.log(`       -H "Content-Type: application/json" \\`);
  console.log(`       -d '{"plate":"RPK5F09","speed":"45","time":"2025-03-21 14:57:02","pixels":"194","vehicleType":"car","vehicleColor":"silver"}'`);
  console.log('─────────────────────────────────────────\n');
}

main().catch(err => {
  console.error('\n❌ Erro fatal:', err.message);
  process.exit(1);
});
