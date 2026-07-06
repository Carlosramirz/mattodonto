import express from 'express';
import { supabase } from '../supabaseClient.js';

const router = express.Router();

// GET /api/dentist/appointments
// Supports ?date=YYYY-MM-DD
router.get('/', async (req, res) => {
  try {
    const { date } = req.query;

    let query = supabase
      .from('appointment_blocks')
      .select(`
        appointments (*),
        availability!inner (
          date,
          start_time,
          end_time
        )
      `);

    if (date) {
      query = query.eq('availability.date', date);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Flatten the result to expose appointment fields + availability fields directly
    const flatData = data.map(block => ({
      ...block.appointments,
      date: block.availability.date,
      start_time: block.availability.start_time,
      end_time: block.availability.end_time
    }));

    // Sort chronologically by start_time
    flatData.sort((a, b) => a.start_time.localeCompare(b.start_time));

    res.json(flatData);
  } catch (err) {
    console.error('Error fetching dentist appointments:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/dentist/appointments/:id/status
// Body: { status: 'pending' | 'confirmed' | 'cancelled' }
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'confirmed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
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
