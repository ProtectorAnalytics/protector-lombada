/**
 * Script para criar o Super Admin do Protector Lombada Educativa.
 *
 * Uso: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/create-super-admin.js
 *
 * Ou configure as variáveis no .env e execute:
 *   node -r dotenv/config scripts/create-super-admin.js
 */

const { createClient } = require('@supabase/supabase-js');

const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@protector.com.br';
const SUPER_ADMIN_SENHA = process.env.SUPER_ADMIN_SENHA || 'Protector@Admin2026';
const SUPER_ADMIN_NOME = process.env.SUPER_ADMIN_NOME || 'Administrador Protector';

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_KEY no ambiente.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('Criando super admin...');
  console.log(`  E-mail: ${SUPER_ADMIN_EMAIL}`);
  console.log(`  Nome:   ${SUPER_ADMIN_NOME}`);

  // 1. Criar usuário no Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: SUPER_ADMIN_EMAIL,
    password: SUPER_ADMIN_SENHA,
    email_confirm: true,
  });

  if (authError) {
    if (authError.message.includes('already been registered')) {
      console.log('Usuário Auth já existe. Buscando...');
      const { data: { users } } = await supabase.auth.admin.listUsers();
      const existing = users.find(u => u.email === SUPER_ADMIN_EMAIL);
      if (existing) {
        await createProfile(supabase, existing.id);
        return;
      }
    }
    console.error('Erro ao criar no Auth:', authError.message);
    process.exit(1);
  }

  await createProfile(supabase, authData.user.id);
}

async function createProfile(supabase, authId) {
  // 2. Verificar se já existe perfil
  const { data: existingProfile } = await supabase
    .from('usuarios')
    .select('id')
    .eq('auth_id', authId)
    .single();

  if (existingProfile) {
    // Atualizar para super_admin
    await supabase
      .from('usuarios')
      .update({ role: 'super_admin', ativo: true })
      .eq('id', existingProfile.id);
    console.log('Perfil atualizado para super_admin.');
  } else {
    // Criar perfil
    const { error } = await supabase
      .from('usuarios')
      .insert({
        auth_id: authId,
        cliente_id: null,
        nome: SUPER_ADMIN_NOME,
        email: SUPER_ADMIN_EMAIL,
        role: 'super_admin',
        ativo: true,
      });

    if (error) {
      console.error('Erro ao criar perfil:', error.message);
      process.exit(1);
    }
    console.log('Perfil super_admin criado.');
  }

  console.log('\n========================================');
  console.log('SUPER ADMIN CRIADO COM SUCESSO!');
  console.log('========================================');
  console.log(`E-mail: ${SUPER_ADMIN_EMAIL}`);
  console.log(`Senha:  ${SUPER_ADMIN_SENHA}`);
  console.log(`Acesso: https://seu-dominio.vercel.app/admin`);
  console.log('========================================');
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
