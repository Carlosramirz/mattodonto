import { Resend } from 'resend';
import { createEvent } from 'ics';
import dotenv from 'dotenv';
import { parseISO } from 'date-fns';

dotenv.config();

// En la versión gratuita de Resend, el FROM_EMAIL debe ser obligatoriamente onboarding@resend.dev
const resend = new Resend(process.env.RESEND_API_KEY || 're_123456789');
const CLINIC_ADDRESS = process.env.CLINIC_ADDRESS || 'Av. Providencia 1234, Box 5';
const DENTIST_EMAIL = process.env.DENTIST_EMAIL || 'dentist@example.com';
const FROM_EMAIL = 'onboarding@resend.dev'; 

export async function sendConfirmationToPatient(appointment) {
  try {
    const dateTime = parseISO(`${appointment.date}T${appointment.start_time}`);
    
    const event = {
      start: [
        dateTime.getFullYear(), 
        dateTime.getMonth() + 1, 
        dateTime.getDate(), 
        dateTime.getHours(), 
        dateTime.getMinutes()
      ],
      startInputType: 'local',
      startOutputType: 'local',
      duration: { minutes: 30 },
      title: 'Cita Odontológica - Mattodonto',
      description: `Cita confirmada para ${appointment.patient_name}.\nMotivo: ${appointment.reason}`,
      location: CLINIC_ADDRESS,
      status: 'CONFIRMED',
      busyStatus: 'BUSY',
      organizer: { name: 'Mattodonto', email: FROM_EMAIL }
    };

    let icsContent;
    createEvent(event, (error, value) => {
      if (error) {
        console.error('[EMAIL ERROR] Error creando archivo ICS:', error);
      } else {
        icsContent = value;
        icsContent = icsContent.replace('BEGIN:VCALENDAR', 'BEGIN:VCALENDAR\nX-WR-TIMEZONE:America/Santiago');
      }
    });

    const attachments = icsContent ? [{
      filename: 'cita.ics',
      content: Buffer.from(icsContent).toString('base64'),
    }] : [];

    // Nota: El link de cancelación en producción debe ser adaptado al dominio real.
    // Actualmente usa /cancel/:token. Si se usa /cancel?token=... en el email, 
    // debe ser compatible con la ruta del frontend.
    const cancelUrl = `http://localhost:5173/cancel/${appointment.cancel_token}`;

    const { data, error } = await resend.emails.send({
      from: `Mattodonto <${FROM_EMAIL}>`,
      to: appointment.patient_email,
      subject: 'Tu cita ha sido confirmada',
      html: `
        <h2>¡Hola ${appointment.patient_name}!</h2>
        <p>Tu cita odontológica ha sido confirmada.</p>
        <p><strong>Fecha y Hora:</strong> ${appointment.date} a las ${appointment.start_time.substring(0,5)} hrs</p>
        <p><strong>Dirección:</strong> ${CLINIC_ADDRESS}</p>
        <p><strong>Motivo:</strong> ${appointment.reason}</p>
        <hr />
        <p><small>Si necesitas cancelar tu cita, por favor <a href="${cancelUrl}">haz clic aquí</a>.</small></p>
      `,
      attachments
    });

    if (error) {
      console.error(`[EMAIL ERROR] Tipo: Confirmación Paciente, Destinatario: ${appointment.patient_email}, Error:`, error);
    }
    return data;
  } catch (error) {
    console.error(`[EMAIL ERROR] Tipo: Confirmación Paciente (Excepción), Destinatario: ${appointment.patient_email}, Error:`, error);
  }
}

export async function sendNotificationToDentist(appointment) {
  try {
    const { data, error } = await resend.emails.send({
      from: `Mattodonto <${FROM_EMAIL}>`,
      to: DENTIST_EMAIL,
      subject: `Nueva cita agendada: ${appointment.patient_name}`,
      html: `
        <h2>Nueva Cita Agendada</h2>
        <p><strong>Paciente:</strong> ${appointment.patient_name}</p>
        <p><strong>Teléfono:</strong> ${appointment.patient_phone}</p>
        <p><strong>Motivo:</strong> ${appointment.reason}</p>
        <p><strong>Fecha y Hora:</strong> ${appointment.date} a las ${appointment.start_time.substring(0,5)} hrs</p>
      `
    });

    if (error) {
      console.error(`[EMAIL ERROR] Tipo: Notificación Dentista, Destinatario: ${DENTIST_EMAIL}, Error:`, error);
    }
    return data;
  } catch (error) {
    console.error(`[EMAIL ERROR] Tipo: Notificación Dentista (Excepción), Destinatario: ${DENTIST_EMAIL}, Error:`, error);
  }
}

export async function sendCancellationNotificationToDentist(appointment) {
  try {
    const { data, error } = await resend.emails.send({
      from: `Mattodonto <${FROM_EMAIL}>`,
      to: DENTIST_EMAIL,
      subject: `Cita CANCELADA: ${appointment.patient_name}`,
      html: `
        <h2>Una cita ha sido cancelada</h2>
        <p>El paciente ha cancelado la siguiente cita. El horario ha quedado disponible automáticamente en tu calendario.</p>
        <p><strong>Paciente:</strong> ${appointment.patient_name}</p>
        <p><strong>Teléfono:</strong> ${appointment.patient_phone}</p>
        <p><strong>Fecha y Hora:</strong> ${appointment.date} a las ${appointment.start_time.substring(0,5)} hrs</p>
      `
    });

    if (error) {
      console.error(`[EMAIL ERROR] Tipo: Cancelación Dentista, Destinatario: ${DENTIST_EMAIL}, Error:`, error);
    }
    return data;
  } catch (error) {
    console.error(`[EMAIL ERROR] Tipo: Cancelación Dentista (Excepción), Destinatario: ${DENTIST_EMAIL}, Error:`, error);
  }
}

export async function sendAdminCancellationToPatient(appointment, reason = '') {
  try {
    const reasonText = reason ? `<p><strong>Motivo de cancelación:</strong> ${reason}</p>` : '';
    
    const { data, error } = await resend.emails.send({
      from: `Mattodonto <${FROM_EMAIL}>`,
      to: appointment.patient_email,
      subject: `Aviso Importante: Tu cita ha sido cancelada`,
      html: `
        <h2>Hola ${appointment.patient_name},</h2>
        <p>Lamentamos informarte que tu cita programada para el <strong>${appointment.date} a las ${appointment.start_time.substring(0,5)} hrs</strong> ha sido cancelada por el centro médico.</p>
        ${reasonText}
        <p>Por favor, ingresa a nuestra plataforma para reagendar tu hora en otro momento disponible.</p>
        <p>Disculpa los inconvenientes.</p>
        <p>Atte,<br/>Equipo Mattodonto</p>
      `
    });

    if (error) {
      console.error(`[EMAIL ERROR] Tipo: Cancelación Admin Paciente, Destinatario: ${appointment.patient_email}, Error:`, error);
    }
    return data;
  } catch (error) {
    console.error(`[EMAIL ERROR] Tipo: Cancelación Admin Paciente (Excepción), Destinatario: ${appointment.patient_email}, Error:`, error);
  }
}

export async function sendCancellationConfirmationToPatient(appointment) {
  try {
    const { data, error } = await resend.emails.send({
      from: `Mattodonto <${FROM_EMAIL}>`,
      to: appointment.patient_email,
      subject: `Confirmación de Cancelación - Mattodonto`,
      html: `
        <h2>Hola ${appointment.patient_name},</h2>
        <p>Confirmamos que tu cita programada para el <strong>${appointment.date} a las ${appointment.start_time.substring(0,5)} hrs</strong> ha sido cancelada exitosamente.</p>
        <p>El horario ha sido liberado de nuestro sistema.</p>
        <p>Si deseas agendar una nueva hora, puedes hacerlo en cualquier momento desde nuestra plataforma.</p>
        <p>Atte,<br/>Equipo Mattodonto</p>
      `
    });

    if (error) {
      console.error(`[EMAIL ERROR] Tipo: Confirmación Cancelación Paciente, Destinatario: ${appointment.patient_email}, Error:`, error);
    }
    return data;
  } catch (error) {
    console.error(`[EMAIL ERROR] Tipo: Confirmación Cancelación Paciente (Excepción), Destinatario: ${appointment.patient_email}, Error:`, error);
  }
}
