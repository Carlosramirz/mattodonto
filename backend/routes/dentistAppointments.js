import express from 'express';
import { supabase } from '../supabaseClient.js';
import { requireStaff } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Proteger todas las rutas con requireStaff (dentist, admin, assistant)
router.use(requireStaff);

// GET /api/dentist/appointments
// Retorna las citas para un día específico.
// Filtra por el dentist_id del usuario autenticado si es un odontólogo.
// Para asistentes y admins, permite filtrar usando ?dentist_id=UUID.
router.get('/', async (req, res) => {
  try {
    const { date, dentist_id } = req.query;

    let query = supabase
      .from('appointment_blocks')
      .select(`
        appointments!inner (*),
        availability!inner (
          date,
          start_time,
          end_time
        )
      `);

    if (date) {
      query = query.eq('availability.date', date);
    }

    // Filtrar por odontólogo según rol
    if (req.user.role === 'dentist') {
      query = query.eq('appointments.dentist_id', req.user.id);
    } else if (dentist_id) {
      query = query.eq('appointments.dentist_id', dentist_id);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Aplanar resultado
    const flatData = data.map(block => ({
      ...block.appointments,
      date: block.availability.date,
      start_time: block.availability.start_time,
      end_time: block.availability.end_time
    }));

    // Ordenar cronológicamente por hora de inicio
    flatData.sort((a, b) => a.start_time.localeCompare(b.start_time));

    res.json(flatData);
  } catch (err) {
    console.error('Error fetching dentist appointments:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/dentist/appointments/:id/status
// Cambiar estado de una cita. Los odontólogos solo pueden modificar las suyas.
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'confirmed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Estado de cita inválido' });
    }

    // Verificar propiedad si es odontólogo
    if (req.user.role === 'dentist') {
      const { data: appointment, error: fetchError } = await supabase
        .from('appointments')
        .select('dentist_id')
        .eq('id', id)
        .single();

      if (fetchError || !appointment) {
        return res.status(404).json({ error: 'Cita no encontrada.' });
      }

      if (appointment.dentist_id !== req.user.id) {
        return res.status(403).json({ error: 'Acceso denegado. No eres el propietario de esta cita.' });
      }
    }

    const { data, error } = await supabase
      .from('appointments')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('Error updating appointment status:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
