import express from 'express';
import { supabase } from '../supabaseClient.js';
import { supabaseAdmin } from '../supabaseAdminClient.js';
import { requireAdmin } from '../middlewares/authMiddleware.js';
import { sendAdminCancellationToPatient } from '../services/emailService.js';

const router = express.Router();

// All routes in this file require Admin privileges
router.use(requireAdmin);

// POST /api/admin/users/dentist
// Creates a new dentist or assistant account
router.post('/users/dentist', async (req, res) => {
  try {
    const { email, password, full_name, role = 'dentist' } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
    }

    if (role !== 'dentist' && role !== 'assistant') {
      return res.status(400).json({ error: 'Rol no permitido. Debe ser dentist o assistant.' });
    }

    // 1. Create user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true // Auto-confirm for staff created by admin
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    const userId = authData.user.id;

    // 2. Insert into public.users table with the selected role
    const { error: dbError } = await supabaseAdmin
      .from('users')
      .insert({
        id: userId,
        role: role,
        full_name: full_name || ''
      });

    if (dbError) {
      // Rollback Auth user creation if DB insert fails
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return res.status(500).json({ error: 'Error al registrar el perfil de usuario' });
    }

    res.status(201).json({ 
      message: `${role === 'assistant' ? 'Asistente' : 'Odontólogo'} creado exitosamente`, 
      user: authData.user 
    });
  } catch (err) {
    console.error('Error creating user:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/admin/appointments
// Paginated, filterable appointment list
router.get('/appointments', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search || '';
    const status = req.query.status || '';
    const date = req.query.date || '';

    // Calculate range for pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('appointments')
      .select(`
        *,
        appointment_blocks (
          availability (date, start_time, end_time)
        )
      `, { count: 'exact' });

    // Apply filters
    if (search) {
      query = query.ilike('patient_name', `%${search}%`);
    }
    if (status) {
      query = query.eq('status', status);
    }
    // Filtering by date requires joining the availability table correctly. 
    // Since PostgREST doesn't easily allow filtering parent by nested child field in a single simple query,
    // we would need an inner join or view. 
    // For simplicity, if date is provided, we might not be able to easily filter here without an RPC or View.
    // We will apply the date filter on the frontend for now, or fetch the block ids first.
    if (date) {
      // Find blocks for that date
      const { data: availData } = await supabase.from('availability').select('id').eq('date', date);
      if (availData && availData.length > 0) {
        const availIds = availData.map(a => a.id);
        const { data: blockData } = await supabase.from('appointment_blocks').select('appointment_id').in('availability_id', availIds);
        const apptIds = blockData ? blockData.map(b => b.appointment_id) : [];
        if (apptIds.length > 0) {
          query = query.in('id', apptIds);
        } else {
          // If no blocks, return empty
          return res.json({ data: [], count: 0, page, limit });
        }
      } else {
        return res.json({ data: [], count: 0, page, limit });
      }
    }

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, count, error } = await query;

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Flatten data for easier consumption by frontend
    const formattedData = data.map(appt => {
      let apptDate = null;
      let start_time = null;
      
      if (appt.appointment_blocks && appt.appointment_blocks.length > 0 && appt.appointment_blocks[0].availability) {
        apptDate = appt.appointment_blocks[0].availability.date;
        start_time = appt.appointment_blocks[0].availability.start_time;
      }

      return {
        ...appt,
        date: apptDate,
        start_time
      };
    });

    res.json({
      data: formattedData,
      count,
      page,
      limit,
      totalPages: Math.ceil(count / limit)
    });
  } catch (err) {
    console.error('Error fetching admin appointments:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/admin/appointments/:id/cancel
// Admin manual cancellation with reason
router.post('/appointments/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const { data: appt, error: fetchError } = await supabase
      .from('appointments')
      .select(`
        *,
        appointment_blocks (
          availability (date, start_time)
        )
      `)
      .eq('id', id)
      .single();

    if (fetchError || !appt) {
      return res.status(404).json({ error: 'Cita no encontrada.' });
    }

    if (appt.status === 'cancelled') {
      return res.status(400).json({ error: 'La cita ya ha sido cancelada.' });
    }

    // Release block
    await supabaseAdmin.from('appointment_blocks').delete().eq('appointment_id', appt.id);
    
    // Update appointment status & reason
    await supabaseAdmin.from('appointments').update({ 
      status: 'cancelled',
      cancellation_reason: reason || 'Cancelado por el administrador'
    }).eq('id', appt.id);

    // Notify Patient
    let date = null;
    let start_time = null;
    if (appt.appointment_blocks && appt.appointment_blocks.length > 0) {
      date = appt.appointment_blocks[0].availability.date;
      start_time = appt.appointment_blocks[0].availability.start_time;
    }

    const emailData = { ...appt, date, start_time };
    sendAdminCancellationToPatient(emailData, reason).catch(e => console.error(e));

    res.json({ message: 'Cita cancelada exitosamente.' });
  } catch (err) {
    console.error('Error in admin cancellation:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/admin/availability/block-day
// Block an entire day and cancel all active appointments
router.post('/availability/block-day', async (req, res) => {
  try {
    const { date } = req.body;

    if (!date) {
      return res.status(400).json({ error: 'La fecha es obligatoria.' });
    }

    // Find all availability blocks for that date
    const { data: availabilityBlocks, error: availError } = await supabaseAdmin
      .from('availability')
      .select('id, start_time, appointment_blocks(appointment_id)')
      .eq('date', date)
      .eq('is_active', true);

    if (availError) {
      return res.status(400).json({ error: availError.message });
    }

    if (!availabilityBlocks || availabilityBlocks.length === 0) {
      return res.status(400).json({ error: 'No se encontraron bloques activos en esa fecha.' });
    }

    // Cancel all associated appointments
    const appointmentIdsToCancel = [];
    availabilityBlocks.forEach(block => {
      if (block.appointment_blocks && block.appointment_blocks.length > 0) {
        appointmentIdsToCancel.push(block.appointment_blocks[0].appointment_id);
      }
    });

    if (appointmentIdsToCancel.length > 0) {
      // Fetch full appointment details to send emails
      const { data: apptsToCancel } = await supabaseAdmin
        .from('appointments')
        .select('*')
        .in('id', appointmentIdsToCancel);

      if (apptsToCancel) {
        for (const appt of apptsToCancel) {
          const reason = 'El centro médico ha bloqueado las atenciones para este día.';
          
          // Delete appointment_block
          await supabaseAdmin.from('appointment_blocks').delete().eq('appointment_id', appt.id);
          
          // Update status
          await supabaseAdmin.from('appointments').update({ 
            status: 'cancelled',
            cancellation_reason: reason
          }).eq('id', appt.id);

          // Find start time
          const block = availabilityBlocks.find(b => b.appointment_blocks?.some(ab => ab.appointment_id === appt.id));
          
          const emailData = { ...appt, date, start_time: block ? block.start_time : '00:00:00' };
          sendAdminCancellationToPatient(emailData, reason).catch(e => console.error(e));
        }
      }
    }

    // Finally, deactivate all availability blocks for the day
    const availIds = availabilityBlocks.map(b => b.id);
    await supabaseAdmin
      .from('availability')
      .update({ is_active: false })
      .in('id', availIds);

    res.json({ message: `Día ${date} bloqueado exitosamente. Citas canceladas: ${appointmentIdsToCancel.length}` });
  } catch (err) {
    console.error('Error blocking day:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /api/admin/patients/:id/reassign
// Permite al administrador reasignar el odontólogo (dentist_id) de un paciente.
// Retorna únicamente el id y el full_name del paciente por privacidad de datos clínicos.
router.put('/patients/:id/reassign', async (req, res) => {
  try {
    const { id } = req.params;
    const { dentist_id } = req.body;

    if (!dentist_id) {
      return res.status(400).json({ error: 'El campo dentist_id es obligatorio' });
    }

    // Verificar que el nuevo odontólogo exista y sea realmente un odontólogo
    const { data: dentistUser, error: dentistError } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('id', dentist_id)
      .single();

    if (dentistError || !dentistUser) {
      return res.status(400).json({ error: 'El odontólogo especificado no existe' });
    }

    if (dentistUser.role !== 'dentist') {
      return res.status(400).json({ error: 'El usuario especificado no tiene rol de odontólogo' });
    }

    // Actualizar el dentist_id del paciente
    const { data: updatedPatient, error: updateError } = await supabaseAdmin
      .from('patients')
      .update({ dentist_id })
      .eq('id', id)
      .select('id, full_name')
      .single();

    if (updateError || !updatedPatient) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    res.json({
      message: 'Paciente reasignado exitosamente',
      patient: updatedPatient
    });
  } catch (err) {
    console.error('Error al reasignar paciente:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
