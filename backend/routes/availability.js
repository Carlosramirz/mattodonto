import express from 'express';
import { supabase } from '../supabaseClient.js';
import { requireStaff } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Proteger todas las rutas con requireStaff (dentist, assistant, admin)
router.use(requireStaff);

// Helper to add minutes to a "HH:mm" time string
function addMinutes(timeStr, minutesToAdd) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes + minutesToAdd;
  const newHours = Math.floor(totalMinutes / 60);
  const newMinutes = totalMinutes % 60;
  return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
}

// GET /api/availability
// Queries availability. Supports ?date=YYYY-MM-DD or ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// and ?dentist_id=UUID (optional for assistants/admins, mandatory filter for dentists).
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate, dentist_id } = req.query;
    
    let query = supabase
      .from('availability')
      .select(`
        *,
        appointment_blocks (
          id,
          appointment_id,
          appointments (
            status,
            patient_name
          )
        )
      `)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (date) {
      query = query.eq('date', date);
    } else if (startDate && endDate) {
      query = query.gte('date', startDate).lte('date', endDate);
    }

    // Filtrado de dentist_id basado en el rol
    if (req.user.role === 'dentist') {
      // Dentista siempre ve únicamente sus propios bloques, no se puede eludir
      query = query.eq('dentist_id', req.user.id);
    } else if (dentist_id) {
      // Asistentes o admins pueden filtrar por un dentista específico
      query = query.eq('dentist_id', dentist_id);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Format response to indicate if it's booked
    const formattedData = data.map(slot => {
      const isBooked = slot.appointment_blocks && slot.appointment_blocks.length > 0;
      return {
        ...slot,
        isBooked,
        appointment: isBooked ? slot.appointment_blocks[0].appointments : null
      };
    });

    res.json(formattedData);
  } catch (err) {
    console.error('Error fetching availability:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/availability
// Body: { dentist_id, date, startTime, endTime, durationMinutes, bufferMinutes }
router.post('/', async (req, res) => {
  try {
    const { date, startTime, endTime, durationMinutes, bufferMinutes } = req.body;
    let targetDentistId = req.body.dentist_id;

    // Si es odontólogo, sobreescribir dentist_id obligatoriamente con el suyo propio del token
    if (req.user.role === 'dentist') {
      targetDentistId = req.user.id;
    }

    if (!targetDentistId || !date || !startTime || !endTime || !durationMinutes) {
      return res.status(400).json({ error: 'Faltan campos requeridos.' });
    }

    const slots = [];
    let currentTime = startTime;

    while (true) {
      const slotEndTime = addMinutes(currentTime, durationMinutes);
      
      // If adding duration goes past endTime, we stop.
      if (slotEndTime > endTime) {
        break;
      }

      slots.push({
        dentist_id: targetDentistId,
        date,
        start_time: currentTime,
        end_time: slotEndTime,
        buffer_minutes: bufferMinutes || 0,
        is_active: true
      });

      // Next slot starts after duration + buffer
      currentTime = addMinutes(slotEndTime, bufferMinutes || 0);
    }

    if (slots.length === 0) {
      return res.status(400).json({ error: 'El rango de tiempo es demasiado corto para un bloque.' });
    }

    const { data, error } = await supabase
      .from('availability')
      .insert(slots)
      .select();

    if (error) throw error;

    res.status(201).json({ message: 'Bloques generados exitosamente', slots: data });
  } catch (err) {
    console.error('Error generating availability:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/availability/:id/toggle
router.put('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if slot exists and fetch details
    const { data: slot, error: fetchError } = await supabase
      .from('availability')
      .select(`
        is_active,
        dentist_id,
        appointment_blocks (id)
      `)
      .eq('id', id)
      .single();

    if (fetchError || !slot) {
      return res.status(404).json({ error: 'Bloque de disponibilidad no encontrado.' });
    }

    // Dentista solo puede modificar sus propios bloques
    if (req.user.role === 'dentist' && slot.dentist_id !== req.user.id) {
      return res.status(403).json({ error: 'Acceso denegado. No eres el propietario de este bloque.' });
    }

    if (slot.appointment_blocks && slot.appointment_blocks.length > 0) {
      return res.status(400).json({ error: 'No se puede desactivar un bloque que ya tiene una cita agendada.' });
    }

    const { data, error: updateError } = await supabase
      .from('availability')
      .update({ is_active: !slot.is_active })
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json(data);
  } catch (err) {
    console.error('Error toggling availability:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
