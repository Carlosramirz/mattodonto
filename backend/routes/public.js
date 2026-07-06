import express from 'express';
import { supabase } from '../supabaseClient.js';
import { format, differenceInHours, parseISO } from 'date-fns';
import { 
  sendConfirmationToPatient, 
  sendNotificationToDentist, 
  sendCancellationNotificationToDentist,
  sendCancellationConfirmationToPatient
} from '../services/emailService.js';
import { validateRut, normalizeRut } from '../utils/rutValidator.js';

const router = express.Router();

// GET /api/public/appointment-types
// Retorna todos los tipos de cita predefinidos
router.get('/appointment-types', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('appointment_types')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Error al obtener tipos de cita:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/availability
// Retorna todos los bloques horarios futuros disponibles (is_active = true y sin citas asociadas)
router.get('/availability', async (req, res) => {
  try {
    const today = format(new Date(), 'yyyy-MM-dd');
    
    // Obtenemos disponibilidad activa desde hoy en adelante
    const { data, error } = await supabase
      .from('availability')
      .select(`
        id,
        dentist_id,
        date,
        start_time,
        end_time,
        buffer_minutes,
        appointment_blocks (id)
      `)
      .eq('is_active', true)
      .gte('date', today)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) throw error;

    // Filtramos los bloques que ya tienen una cita asignada
    const availableSlots = data.filter(slot => {
      return !slot.appointment_blocks || slot.appointment_blocks.length === 0;
    }).map(slot => ({
      id: slot.id,
      date: slot.date,
      start_time: slot.start_time,
      end_time: slot.end_time,
      dentist_id: slot.dentist_id,
      buffer_minutes: slot.buffer_minutes
    }));

    res.json(availableSlots);
  } catch (err) {
    console.error('Error al obtener disponibilidad pública:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/public/appointments
// Reserva una cita usando la transacción segura del RPC
router.post('/appointments', async (req, res) => {
  try {
    const { availability_id, patient_name, patient_phone, patient_email, patient_rut, reason, appointment_type_id } = req.body;

    if (!availability_id || !patient_name || !patient_phone || !patient_email || !patient_rut || !reason || !appointment_type_id) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    if (!validateRut(patient_rut)) {
      return res.status(400).json({ error: 'El RUT ingresado no es válido.' });
    }

    const normalizedRut = normalizeRut(patient_rut);

    // Ejecuta la reserva en la transacción segura de la BD
    const { data, error } = await supabase.rpc('book_appointment', {
      p_availability_id: availability_id,
      p_patient_name: patient_name,
      p_patient_phone: patient_phone,
      p_patient_email: patient_email,
      p_reason: reason,
      p_appointment_type_id: appointment_type_id
    });

    if (error) {
      console.error('RPC Error:', error);
      return res.status(409).json({ error: error.message || 'Error al reservar la cita' });
    }

    // Guardar el RUT en la cita creada de forma asíncrona/directa
    await supabase.from('appointments').update({ patient_rut: normalizedRut }).eq('id', data);

    // Obtener los datos completos de la cita incluyendo cancel_token y bloques
    const { data: fullAppointment, error: fetchError } = await supabase
      .from('appointments')
      .select(`
        *,
        appointment_blocks!inner (
          availability!inner (date, start_time)
        )
      `)
      .eq('id', data)
      .single();

    if (!fetchError && fullAppointment && fullAppointment.appointment_blocks.length > 0) {
      const emailData = {
        ...fullAppointment,
        date: fullAppointment.appointment_blocks[0].availability.date,
        start_time: fullAppointment.appointment_blocks[0].availability.start_time
      };
      
      // Enviar correos en segundo plano (fire and forget)
      sendConfirmationToPatient(emailData).catch(e => console.error(e));
      sendNotificationToDentist(emailData).catch(e => console.error(e));
    }

    res.status(201).json({ message: 'Cita reservada exitosamente', appointment_id: data });
  } catch (err) {
    console.error('Error al reservar cita:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/public/appointments/cancel/:token
// Validar el token y retornar los detalles de la cita
router.get('/appointments/cancel/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const { data: fullAppointment, error: fetchError } = await supabase
      .from('appointments')
      .select(`
        *,
        appointment_blocks!left (
          availability!left (date, start_time)
        )
      `)
      .eq('cancel_token', token)
      .single();

    if (fetchError || !fullAppointment) {
      return res.status(404).json({ error: 'Enlace de cancelación inválido o expirado.' });
    }

    let date = null;
    let start_time = null;

    if (fullAppointment.appointment_blocks && fullAppointment.appointment_blocks.length > 0) {
      date = fullAppointment.appointment_blocks[0].availability.date;
      start_time = fullAppointment.appointment_blocks[0].availability.start_time;
    }

    res.json({
      id: fullAppointment.id,
      patient_name: fullAppointment.patient_name,
      status: fullAppointment.status,
      date,
      start_time
    });
  } catch (err) {
    console.error('Error al obtener datos de cancelación:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// POST /api/public/appointments/cancel/:token
// Cancelación por token (flujo existente)
router.post('/appointments/cancel/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const { data: appt, error: fetchError } = await supabase
      .from('appointments')
      .select(`
        *,
        appointment_blocks!left (
          availability!left (date, start_time)
        )
      `)
      .eq('cancel_token', token)
      .single();

    if (fetchError || !appt) {
      return res.status(404).json({ error: 'Enlace de cancelación inválido o expirado.' });
    }

    if (appt.status === 'cancelled') {
      return res.status(400).json({ error: 'La cita ya ha sido cancelada.' });
    }

    if (!appt.appointment_blocks || appt.appointment_blocks.length === 0) {
      return res.status(400).json({ error: 'La cita no tiene un bloque horario asociado válido.' });
    }

    const { date, start_time } = appt.appointment_blocks[0].availability;
    
    // Validar política de 2 horas
    const apptDateTime = parseISO(`${date}T${start_time}`);
    const now = new Date();
    const hoursDiff = differenceInHours(apptDateTime, now);

    if (hoursDiff < 2) {
      const dentistPhone = process.env.DENTIST_PHONE || '+56900000000';
      return res.status(400).json({ 
        error: `Esta cita es en menos de 2 horas. Para cancelar, contacta directamente al odontólogo al ${dentistPhone}.` 
      });
    }

    // Liberar bloques y actualizar cita
    await supabase.from('appointment_blocks').delete().eq('appointment_id', appt.id);
    await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', appt.id);

    // Notificaciones por correo
    const emailData = {
      ...appt,
      date,
      start_time
    };
    sendCancellationNotificationToDentist(emailData).catch(e => console.error(e));
    sendCancellationConfirmationToPatient(emailData).catch(e => console.error(e));

    res.json({ message: 'Cita cancelada exitosamente.' });
  } catch (err) {
    console.error('Error al cancelar cita por token:', err);
    res.status(500).json({ error: 'Error al intentar cancelar la cita.' });
  }
});

// POST /api/public/appointments/cancel-by-rut
// Busca citas activas que coincidan con RUT + Email
router.post('/appointments/cancel-by-rut', async (req, res) => {
  try {
    const { rut, email } = req.body;

    if (!rut || !email) {
      return res.status(400).json({ error: 'Faltan campos obligatorios.' });
    }

    if (!validateRut(rut)) {
      return res.status(404).json({ error: 'No encontramos citas activas con esos datos.' });
    }

    const normalizedRut = normalizeRut(rut);

    // Buscar citas activas (status != 'cancelled') que coincidan con RUT y Email
    const { data: appointments, error: fetchError } = await supabase
      .from('appointments')
      .select(`
        *,
        appointment_types (name),
        appointment_blocks!inner (
          availability!inner (date, start_time, end_time)
        )
      `)
      .eq('patient_rut', normalizedRut)
      .eq('patient_email', email.trim())
      .neq('status', 'cancelled');

    if (fetchError) {
      console.error('Error al buscar citas por RUT:', fetchError);
      return res.status(500).json({ error: 'Error interno del servidor.' });
    }

    if (!appointments || appointments.length === 0) {
      return res.status(404).json({ error: 'No encontramos citas activas con esos datos.' });
    }

    if (appointments.length === 1) {
      // Caso 1: Cita única -> Cancelar de inmediato aplicando política
      const appt = appointments[0];
      const { date, start_time } = appt.appointment_blocks[0].availability;

      // Validar política de 2 horas
      const apptDateTime = parseISO(`${date}T${start_time}`);
      const now = new Date();
      const hoursDiff = differenceInHours(apptDateTime, now);

      if (hoursDiff < 2) {
        const dentistPhone = process.env.DENTIST_PHONE || '+56900000000';
        return res.status(400).json({ 
          error: `Esta cita es en menos de 2 horas. Para cancelar, contacta directamente al odontólogo al ${dentistPhone}.` 
        });
      }

      // Liberar bloques y actualizar
      await supabase.from('appointment_blocks').delete().eq('appointment_id', appt.id);
      await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', appt.id);

      // Notificaciones
      const emailData = {
        ...appt,
        date,
        start_time
      };
      sendCancellationNotificationToDentist(emailData).catch(e => console.error(e));
      sendCancellationConfirmationToPatient(emailData).catch(e => console.error(e));

      return res.json({ message: 'Cita cancelada exitosamente.' });
    }

    // Caso 2: Múltiples citas -> Retornar lista para selección
    const list = appointments.map(appt => {
      const firstBlock = appt.appointment_blocks[0];
      return {
        id: appt.id,
        date: firstBlock.availability.date,
        start_time: firstBlock.availability.start_time,
        appointment_type: appt.appointment_types ? appt.appointment_types.name : 'Otro'
      };
    });

    return res.json({ multiple: true, appointments: list });
  } catch (err) {
    console.error('Error en cancel-by-rut:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// POST /api/public/appointments/cancel-specific
// Confirma la cancelación de una cita elegida del listado múltiple
router.post('/appointments/cancel-specific', async (req, res) => {
  try {
    const { appointment_id, rut, email } = req.body;

    if (!appointment_id || !rut || !email) {
      return res.status(400).json({ error: 'Faltan campos obligatorios.' });
    }

    if (!validateRut(rut)) {
      return res.status(404).json({ error: 'No encontramos citas activas con esos datos.' });
    }

    const normalizedRut = normalizeRut(rut);

    // Validar coincidencia de RUT y Email para la cita específica activa
    const { data: appt, error: fetchError } = await supabase
      .from('appointments')
      .select(`
        *,
        appointment_blocks!inner (
          availability!inner (date, start_time, end_time)
        )
      `)
      .eq('id', appointment_id)
      .eq('patient_rut', normalizedRut)
      .eq('patient_email', email.trim())
      .neq('status', 'cancelled')
      .single();

    if (fetchError || !appt) {
      return res.status(404).json({ error: 'No encontramos citas activas con esos datos.' });
    }

    const { date, start_time } = appt.appointment_blocks[0].availability;

    // Validar política de 2 horas
    const apptDateTime = parseISO(`${date}T${start_time}`);
    const now = new Date();
    const hoursDiff = differenceInHours(apptDateTime, now);

    if (hoursDiff < 2) {
      const dentistPhone = process.env.DENTIST_PHONE || '+56900000000';
      return res.status(400).json({ 
        error: `Esta cita es en menos de 2 horas. Para cancelar, contacta directamente al odontólogo al ${dentistPhone}.` 
      });
    }

    // Liberar bloques y actualizar
    await supabase.from('appointment_blocks').delete().eq('appointment_id', appt.id);
    await supabase.from('appointments').update({ status: 'cancelled' }).eq('id', appt.id);

    // Notificaciones
    const emailData = {
      ...appt,
      date,
      start_time
    };
    sendCancellationNotificationToDentist(emailData).catch(e => console.error(e));
    sendCancellationConfirmationToPatient(emailData).catch(e => console.error(e));

    res.json({ message: 'Cita cancelada exitosamente.' });
  } catch (err) {
    console.error('Error en cancel-specific:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

export default router;
