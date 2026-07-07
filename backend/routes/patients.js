import express from 'express';
import { supabaseAdmin as supabase } from '../supabaseAdminClient.js';
import { requireClinicalAccess } from '../middlewares/authMiddleware.js';
import { validateRut, normalizeRut } from '../utils/rutValidator.js';

const router = express.Router();

// Aplicar el middleware de acceso clínico (dentist y admin) a todas las rutas de pacientes.
// Esto bloquea por completo al rol assistant (asistente).
router.use(requireClinicalAccess);

// GET /api/dentist/patients
// Retorna la lista paginada de pacientes con búsqueda por RUT o Nombre,
// aislada al odontólogo autenticado.
router.get('/', async (req, res) => {
  try {
    const { search, page = 1 } = req.query;
    const limit = 20;
    const offset = (parseInt(page, 10) - 1) * limit;

    // El admin no puede ver listas de pacientes
    if (req.user.role === 'admin') {
      return res.status(403).json({ error: 'Acceso denegado. Los administradores no tienen acceso clínico.' });
    }

    let query = supabase
      .from('patients')
      .select('*', { count: 'exact' });

    // Filtrar por dentist_id del odontólogo autenticado
    if (req.user.role === 'dentist') {
      query = query.eq('dentist_id', req.user.id);
    }

    if (search && search.trim() !== '') {
      const term = search.trim();
      const normalized = normalizeRut(term);

      if (normalized) {
        query = query.or(`rut.eq.${normalized},full_name.ilike.%${term}%`);
      } else {
        query = query.ilike('full_name', `%${term}%`);
      }
    }

    // Ordenar alfabéticamente por nombre
    query = query
      .order('full_name', { ascending: true })
      .range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) throw error;

    res.json({
      patients: data || [],
      totalCount: count,
      page: parseInt(page, 10),
      totalPages: Math.ceil(count / limit)
    });
  } catch (err) {
    console.error('Error al obtener lista de pacientes:', err);
    res.status(500).json({ error: 'Error interno al obtener los pacientes.' });
  }
});

// GET /api/dentist/patients/:id
// Detalle de un paciente específico, verificado por propiedad
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // El admin no puede ver detalles del paciente
    if (req.user.role === 'admin') {
      return res.status(403).json({ error: 'Acceso denegado. Los administradores no tienen acceso clínico.' });
    }

    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Paciente no encontrado.' });
    }

    // El dentista solo puede ver sus propios pacientes
    if (req.user.role === 'dentist' && data.dentist_id !== req.user.id) {
      return res.status(403).json({ error: 'Acceso denegado. No tienes acceso a este paciente.' });
    }

    res.json(data);
  } catch (err) {
    console.error('Error al obtener detalle del paciente:', err);
    res.status(500).json({ error: 'Error interno al obtener los datos del paciente.' });
  }
});

// POST /api/dentist/patients
// Crear un nuevo paciente asociado al odontólogo autenticado
router.post('/', async (req, res) => {
  try {
    const { 
      full_name, rut, phone, email, address, 
      birth_date, sex, gender_identity, prevision, prevision_detail,
      medical_alerts
    } = req.body;

    // El admin no puede crear pacientes
    if (req.user.role === 'admin') {
      return res.status(403).json({ error: 'Acceso denegado. Los administradores no tienen acceso clínico.' });
    }

    // Validar requeridos
    if (!full_name || !rut || !sex || !prevision) {
      return res.status(400).json({ error: 'Faltan campos obligatorios.' });
    }

    // Validar RUT
    if (!validateRut(rut)) {
      return res.status(400).json({ error: 'El RUT ingresado no es válido.' });
    }

    // Validar alertas médicas
    if (medical_alerts !== undefined) {
      if (!Array.isArray(medical_alerts)) {
        return res.status(400).json({ error: 'medical_alerts debe ser un arreglo.' });
      }
      for (const alert of medical_alerts) {
        if (typeof alert !== 'string') {
          return res.status(400).json({ error: 'Cada alerta debe ser un texto.' });
        }
        if (alert.length > 100) {
          return res.status(400).json({ error: 'Cada alerta no puede exceder 100 caracteres.' });
        }
      }
    }

    const normalizedRut = normalizeRut(rut);

    // Verificar si el RUT ya está registrado
    const { data: existing, error: checkError } = await supabase
      .from('patients')
      .select('id')
      .eq('rut', normalizedRut)
      .maybeSingle();

    if (checkError) throw checkError;

    if (existing) {
      return res.status(400).json({ error: 'Ya existe una ficha de paciente registrada con este RUT.' });
    }

    // Insertar el paciente asignando el dentist_id del odontólogo creador automáticamente
    const { data, error } = await supabase
      .from('patients')
      .insert({
        full_name,
        rut: normalizedRut,
        phone,
        email,
        address,
        birth_date: birth_date || null,
        sex,
        gender_identity: gender_identity || null,
        prevision,
        prevision_detail: (prevision === 'ISAPRE' || prevision === 'Otro') ? prevision_detail : null,
        medical_alerts: medical_alerts || [],
        dentist_id: req.user.id // Asignado obligatoriamente del token
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (err) {
    console.error('Error al crear paciente:', err);
    res.status(500).json({ error: err.message || 'Error interno al crear el paciente.' });
  }
});

// PUT /api/dentist/patients/:id
// Editar los datos personales y de contacto de un paciente
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      full_name, rut, phone, email, address, 
      birth_date, sex, gender_identity, prevision, prevision_detail
    } = req.body;

    // El admin no puede editar pacientes
    if (req.user.role === 'admin') {
      return res.status(403).json({ error: 'Acceso denegado. Los administradores no tienen acceso clínico.' });
    }

    // Validar requeridos
    if (!full_name || !rut || !sex || !prevision) {
      return res.status(400).json({ error: 'Faltan campos obligatorios.' });
    }

    // Validar RUT
    if (!validateRut(rut)) {
      return res.status(400).json({ error: 'El RUT ingresado no es válido.' });
    }

    const normalizedRut = normalizeRut(rut);

    // Verificar que el RUT no esté tomado por otro paciente
    const { data: existing, error: checkError } = await supabase
      .from('patients')
      .select('id')
      .eq('rut', normalizedRut)
      .neq('id', id)
      .maybeSingle();

    if (checkError) throw checkError;

    if (existing) {
      return res.status(400).json({ error: 'El RUT ingresado ya está registrado para otro paciente.' });
    }

    // Verificar propiedad si es odontólogo
    if (req.user.role === 'dentist') {
      const { data: patientCheck, error: ownerError } = await supabase
        .from('patients')
        .select('dentist_id')
        .eq('id', id)
        .single();

      if (ownerError || !patientCheck) {
        return res.status(404).json({ error: 'Paciente no encontrado.' });
      }
      if (patientCheck.dentist_id !== req.user.id) {
        return res.status(403).json({ error: 'Acceso denegado. No tienes acceso a este paciente.' });
      }
    }

    // Preparar objeto de actualización (excluyendo medical_alerts y dentist_id)
    const updateObj = {
      full_name,
      rut: normalizedRut,
      phone,
      email,
      address,
      birth_date: birth_date || null,
      sex,
      gender_identity: gender_identity || null,
      prevision,
      prevision_detail: (prevision === 'ISAPRE' || prevision === 'Otro') ? prevision_detail : null
    };

    const { data, error } = await supabase
      .from('patients')
      .update(updateObj)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Error al editar paciente:', err);
    res.status(500).json({ error: err.message || 'Error interno al editar los datos del paciente.' });
  }
});

// PUT /api/dentist/patients/:id/medical-alerts
// Editar alertas médicas con verificación de propiedad
router.put('/:id/medical-alerts', async (req, res) => {
  try {
    const { id } = req.params;
    const { medical_alerts } = req.body;

    // El admin no puede editar alertas médicas
    if (req.user.role === 'admin') {
      return res.status(403).json({ error: 'Acceso denegado. Los administradores no tienen acceso clínico.' });
    }

    if (medical_alerts === undefined || !Array.isArray(medical_alerts)) {
      return res.status(400).json({ error: 'medical_alerts es obligatorio y debe ser un arreglo.' });
    }

    for (const alert of medical_alerts) {
      if (typeof alert !== 'string') {
        return res.status(400).json({ error: 'Cada alerta médica debe ser una cadena de texto (string).' });
      }
      if (alert.length > 100) {
        return res.status(400).json({ error: 'Cada alerta médica no puede superar los 100 caracteres.' });
      }
    }

    // Verificar propiedad si es odontólogo
    if (req.user.role === 'dentist') {
      const { data: patientCheck, error: ownerError } = await supabase
        .from('patients')
        .select('dentist_id')
        .eq('id', id)
        .single();

      if (ownerError || !patientCheck) {
        return res.status(404).json({ error: 'Paciente no encontrado.' });
      }
      if (patientCheck.dentist_id !== req.user.id) {
        return res.status(403).json({ error: 'Acceso denegado. No tienes acceso a este paciente.' });
      }
    }

    const { data, error } = await supabase
      .from('patients')
      .update({ medical_alerts })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Error al actualizar alertas médicas:', err);
    res.status(500).json({ error: err.message || 'Error interno al actualizar las alertas médicas.' });
  }
});

export default router;
