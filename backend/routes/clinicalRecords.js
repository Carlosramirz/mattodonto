import express from 'express';
import { supabaseAdmin as supabase } from '../supabaseAdminClient.js';
import { requireClinicalAccess } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Aplicar el middleware de acceso clínico (dentist y admin) a todas las rutas.
// Al igual que con patients, el rol assistant no tiene permitido entrar.
router.use(requireClinicalAccess);

// Helper para verificar propiedad del paciente
async function checkPatientOwnership(patientId, user) {
  if (user.role === 'admin') {
    return false; // El admin no tiene permitido acceder a registros clínicos
  }
  if (user.role === 'dentist') {
    const { data, error } = await supabase
      .from('patients')
      .select('dentist_id')
      .eq('id', patientId)
      .maybeSingle();

    if (error || !data) return false;
    return data.dentist_id === user.id;
  }
  return false;
}

// GET /api/dentist/diagnosis-catalog
// Retorna el catálogo completo de diagnósticos agrupados por categoría
router.get('/diagnosis-catalog', async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      return res.status(403).json({ error: 'Acceso denegado. Los administradores no tienen acceso clínico.' });
    }

    const { data, error } = await supabase
      .from('diagnosis_catalog')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw error;

    const grouped = data.reduce((acc, curr) => {
      if (!acc[curr.category]) {
        acc[curr.category] = [];
      }
      acc[curr.category].push({ id: curr.id, name: curr.name });
      return acc;
    }, {});

    res.json(grouped);
  } catch (err) {
    console.error('Error al obtener catálogo de diagnósticos:', err);
    res.status(500).json({ error: 'Error interno al obtener el catálogo de diagnósticos.' });
  }
});

// GET /api/dentist/medical-alerts-catalog
// Retorna la lista ordenada por sort_order
router.get('/medical-alerts-catalog', async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      return res.status(403).json({ error: 'Acceso denegado. Los administradores no tienen acceso clínico.' });
    }

    const { data, error } = await supabase
      .from('medical_alerts_catalog')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Error al obtener catálogo de alertas médicas:', err);
    res.status(500).json({ error: 'Error interno al obtener el catálogo de alertas.' });
  }
});

// GET /api/dentist/patients/:id/records
// Retorna el historial de sesiones del paciente ordenado cronológicamente desc
router.get('/patients/:id/records', async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar primero la propiedad del paciente
    const isOwner = await checkPatientOwnership(id, req.user);
    if (!isOwner) {
      return res.status(403).json({ error: 'Acceso denegado. No tienes acceso al historial de este paciente.' });
    }

    const { data, error } = await supabase
      .from('clinical_records')
      .select(`
        *,
        dentist:users (
          full_name
        )
      `)
      .eq('patient_id', id)
      .order('session_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Error al obtener historial clínico:', err);
    res.status(500).json({ error: 'Error interno al obtener el historial clínico.' });
  }
});

// POST /api/dentist/patients/:id/records
// Crea una nueva sesión o registro clínico para un paciente
router.post('/patients/:id/records', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      appointment_id, session_date, chief_complaint, 
      anamnesis, exploration, diagnosis, diagnosis_codes, procedure_performed 
    } = req.body;

    if (!session_date) {
      return res.status(400).json({ error: 'La fecha de la sesión es obligatoria.' });
    }

    // Verificar la propiedad del paciente
    const isOwner = await checkPatientOwnership(id, req.user);
    if (!isOwner) {
      return res.status(403).json({ error: 'Acceso denegado. No tienes acceso a este paciente.' });
    }

    const { data, error } = await supabase
      .from('clinical_records')
      .insert({
        patient_id: id,
        appointment_id: appointment_id || null,
        dentist_id: req.user.id,
        session_date,
        chief_complaint: chief_complaint || '',
        anamnesis: anamnesis || '',
        exploration: exploration || '',
        diagnosis: diagnosis || '',
        diagnosis_codes: diagnosis_codes || [],
        procedure_performed: procedure_performed || ''
      })
      .select(`
        *,
        dentist:users (
          full_name
        )
      `)
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (err) {
    console.error('Error al crear registro clínico:', err);
    res.status(500).json({ error: 'Error interno al guardar la sesión clínica.' });
  }
});

// PUT /api/dentist/records/:recordId
// Edita una sesión o registro clínico existente con verificación de pertenencia del paciente
router.put('/records/:recordId', async (req, res) => {
  try {
    const { recordId } = req.params;
    const { 
      session_date, chief_complaint, anamnesis, 
      exploration, diagnosis, diagnosis_codes, procedure_performed 
    } = req.body;

    if (!session_date) {
      return res.status(400).json({ error: 'La fecha de la sesión es obligatoria.' });
    }

    // Verificar si el registro existe y obtener el patient_id
    const { data: existingRecord, error: checkError } = await supabase
      .from('clinical_records')
      .select('id, patient_id')
      .eq('id', recordId)
      .maybeSingle();

    if (checkError) throw checkError;
    if (!existingRecord) {
      return res.status(404).json({ error: 'El registro clínico no existe o ya no está disponible.' });
    }

    // Verificar propiedad del paciente asociado
    const isOwner = await checkPatientOwnership(existingRecord.patient_id, req.user);
    if (!isOwner) {
      return res.status(403).json({ error: 'Acceso denegado. No tienes acceso a este registro clínico.' });
    }

    const { data, error } = await supabase
      .from('clinical_records')
      .update({
        session_date,
        chief_complaint: chief_complaint || '',
        anamnesis: anamnesis || '',
        exploration: exploration || '',
        diagnosis: diagnosis || '',
        diagnosis_codes: diagnosis_codes || [],
        procedure_performed: procedure_performed || ''
      })
      .eq('id', recordId)
      .select(`
        *,
        dentist:users (
          full_name
        )
      `)
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Error al editar registro clínico:', err);
    res.status(500).json({ error: 'Error interno al actualizar la sesión clínica.' });
  }
});

export default router;
