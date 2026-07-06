import express from 'express';
import { supabase } from '../supabaseClient.js';

const router = express.Router();

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
router.get('/', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;
    
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
    const { dentist_id, date, startTime, endTime, durationMinutes, bufferMinutes } = req.body;

    if (!dentist_id || !date || !startTime || !endTime || !durationMinutes) {
      return res.status(400).json({ error: 'Missing required fields' });
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
        dentist_id,
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
      return res.status(400).json({ error: 'Time range is too short for a single slot' });
    }

    const { data, error } = await supabase
      .from('availability')
      .insert(slots)
      .select();

    if (error) throw error;

    res.status(201).json({ message: 'Slots generated successfully', slots: data });
  } catch (err) {
    console.error('Error generating availability:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/availability/:id/toggle
router.put('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if slot has an appointment
    const { data: slot, error: fetchError } = await supabase
      .from('availability')
      .select(`
        is_active,
        appointment_blocks (id)
      `)
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    if (slot.appointment_blocks && slot.appointment_blocks.length > 0) {
      return res.status(400).json({ error: 'Cannot toggle an availability slot that already has an appointment.' });
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
