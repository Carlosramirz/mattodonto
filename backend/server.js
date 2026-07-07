import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import availabilityRoutes from './routes/availability.js';
import dentistAppointmentsRoutes from './routes/dentistAppointments.js';
import publicRoutes from './routes/public.js';
import adminRoutes from './routes/admin.js';
import patientRoutes from './routes/patients.js';
import clinicalRecordsRoutes from './routes/clinicalRecords.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/availability', availabilityRoutes);
app.use('/api/dentist/appointments', dentistAppointmentsRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/dentist/patients', patientRoutes);
app.use('/api/dentist', clinicalRecordsRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
