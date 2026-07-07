import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Faltan credenciales de Supabase en .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAvailability() {
  console.log('Verificando registros de disponibilidad...');
  const { data, error } = await supabase
    .from('availability')
    .select('id, date, start_time, dentist_id');

  if (error) {
    console.error('Error al consultar disponibilidad:', error);
    process.exit(1);
  }

  const nullDentist = data.filter(d => !d.dentist_id);
  
  if (nullDentist.length > 0) {
    console.warn(`¡ATENCIÓN! Se encontraron ${nullDentist.length} registros de disponibilidad sin dentist_id:`);
    console.table(nullDentist);
  } else {
    console.log('✅ Todos los registros de disponibilidad tienen dentist_id válido.');
  }

  // También verifiquemos si hay registros de pacientes o citas que podamos examinar
  const { count: patientCount } = await supabase
    .from('patients')
    .select('*', { count: 'exact', head: true });

  console.log(`Total de pacientes en la base de datos: ${patientCount}`);
  process.exit(0);
}

checkAvailability();
