import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('❌ Error: Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en tu .env');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function createFirstAdmin() {
  const email = process.argv[2];
  const password = process.argv[3];

  if (!email || !password) {
    console.log('Uso: node setupAdmin.js <email> <password>');
    console.log('Ejemplo: node setupAdmin.js admin@mattodonto.com 123456');
    process.exit(1);
  }

  console.log(`Creando cuenta de administrador para: ${email}...`);

  try {
    // 1. Crear usuario en Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        console.error('❌ Error: El usuario ya existe en Supabase Auth. Intenta con otro correo o elimínalo primero desde el dashboard de Supabase.');
        process.exit(1);
      }
      throw authError;
    }

    const userId = authData.user.id;
    console.log('✅ Usuario Auth creado. ID:', userId);

    // 2. Insertar en tabla public.users con rol admin
    const { error: dbError } = await supabaseAdmin
      .from('users')
      .insert({
        id: userId,
        role: 'admin',
        full_name: 'Administrador Principal'
      });

    if (dbError) {
      console.error('❌ Error al asignar el rol en la base de datos:', dbError);
      // Intentar hacer rollback
      await supabaseAdmin.auth.admin.deleteUser(userId);
      process.exit(1);
    }

    console.log('🎉 ¡Administrador creado exitosamente!');
    console.log(`Ya puedes iniciar sesión en /login con:\nEmail: ${email}\nPassword: ${password}`);
    
  } catch (err) {
    console.error('❌ Error fatal:', err);
  }
}

createFirstAdmin();
