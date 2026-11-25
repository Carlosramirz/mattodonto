import React, { useState, useEffect } from 'react';
import { format, startOfWeek, addDays, isSameDay, differenceInMinutes, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon, Clock, CheckCircle, User, Phone, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

// Estados de cita: un solo mapa, colores semánticos del sistema.
// confirmada → success · pendiente → warning · cancelada → danger · atendida → silver
const STATUS = {
  confirmed: { label: 'Atendida', chip: 'bg-success-100 text-success' },
  pending: { label: 'Pendiente', chip: 'bg-warning-100 text-warning' },
  cancelled: { label: 'Cancelada', chip: 'bg-danger-100 text-danger' },
};

function StatusTag({ status }) {
  const s = STATUS[status];
  if (!s) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${s.chip}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}

export default function Dashboard() {
  const { apiFetch, user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [timeUntilNext, setTimeUntilNext] = useState(null);

  // Semanal logic
  const startDate = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDays = [...Array(7)].map((_, i) => addDays(startDate, i));

  const fetchAppointments = async (date) => {
    setLoading(true);
    try {
      const formattedDate = format(date, 'yyyy-MM-dd');
      const res = await apiFetch(`/api/dentist/appointments?date=${formattedDate}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setAppointments(data);
        calculateNextAppointment(data, date);
      } else {
        setAppointments([]);
        calculateNextAppointment([], date);
      }
    } catch (error) {
      console.error('Error fetching appointments:', error);
      setAppointments([]);
      calculateNextAppointment([], date);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointments(selectedDate);

    // Supabase Realtime Subscription
    const channel = supabase
      .channel('public:appointments')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        (payload) => {
          console.log('Realtime change received!', payload);
          fetchAppointments(selectedDate);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // Recalculate 'next appointment' every minute if viewing today
  useEffect(() => {
    if (!isSameDay(selectedDate, new Date())) {
      setTimeUntilNext(null);
      return;
    }

    const interval = setInterval(() => {
      calculateNextAppointment(appointments, selectedDate);
    }, 60000);

    return () => clearInterval(interval);
  }, [appointments, selectedDate]);

  const calculateNextAppointment = (apps, date) => {
    if (!isSameDay(date, new Date()) || !Array.isArray(apps)) {
      setTimeUntilNext(null);
      return;
    }

    const now = new Date();
    const next = apps.find(app => {
      if (app.status !== 'pending') return false;
      const appDateTime = parse(`${app.date} ${app.start_time}`, 'yyyy-MM-dd HH:mm:ss', new Date());
      return appDateTime > now;
    });

    if (next) {
      const appDateTime = parse(`${next.date} ${next.start_time}`, 'yyyy-MM-dd HH:mm:ss', new Date());
      const diff = differenceInMinutes(appDateTime, now);
      setTimeUntilNext(diff);
    } else {
      setTimeUntilNext(null);
    }
  };

  const markAsAttended = async (id) => {
    try {
      const res = await apiFetch(`/api/dentist/appointments/${id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'confirmed' })
      });
      if (!res.ok) {
        const err = await res.json();
        alert('Error: ' + err.error);
      } else {
        setAppointments(apps => apps.map(app => app.id === id ? { ...app, status: 'confirmed' } : app));
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const totalAppointments = appointments.length;
  const pendingAppointments = appointments.filter(a => a.status === 'pending').length;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="flex items-center gap-4">
        {user?.logo_url && (
          <img
            src={user.logo_url}
            alt="Logo profesional"
            className="w-16 h-16 rounded-full object-cover border border-primary-200 shadow-sm"
          />
        )}
        <div>
          <h1 className="font-heading text-3xl font-semibold text-primary">
            Agenda de {user?.full_name || 'Odontólogo'}
          </h1>
          <p className="text-ink-muted mt-1 text-sm">Resumen de tus citas y agenda diaria.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">

        {/* Columna izquierda: resumen y semana */}
        <div className="lg:col-span-1 space-y-6">

          {/* Resumen del día — azul marino plano, sin gradiente ni índigo */}
          <div className="bg-primary rounded-2xl p-6 text-white shadow-md">
            <h3 className="font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-secondary-300 mb-4">
              Resumen del <span className="tabular-nums">{format(selectedDate, 'dd/MM/yyyy')}</span>
            </h3>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-primary-800 rounded-xl p-3">
                <p className="font-heading text-3xl font-semibold tabular-nums leading-none">{totalAppointments}</p>
                <p className="text-xs text-primary-200 mt-1.5">Citas totales</p>
              </div>
              <div className="bg-primary-800 rounded-xl p-3">
                <p className="font-heading text-3xl font-semibold tabular-nums leading-none">{pendingAppointments}</p>
                <p className="text-xs text-primary-200 mt-1.5">Pendientes</p>
              </div>
            </div>

            {timeUntilNext !== null ? (
              <div className="bg-primary-800 rounded-xl p-4 flex items-center gap-3">
                <Clock className="w-7 h-7 text-secondary-300 shrink-0" />
                <div>
                  <p className="text-xs text-primary-200">Próxima cita en</p>
                  <p className="font-heading text-xl font-semibold tabular-nums">{timeUntilNext} min</p>
                </div>
              </div>
            ) : (
              <div className="bg-primary-800 rounded-xl p-4 text-center">
                <p className="text-sm text-primary-200">No hay citas próximas pendientes.</p>
              </div>
            )}
          </div>

          {/* Selector semanal */}
          <div className="bg-surface rounded-2xl shadow-sm border border-primary/10 p-5">
            <h3 className="font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted mb-4">Esta semana</h3>
            <div className="space-y-2">
              {weekDays.map(day => {
                const isSelected = isSameDay(day, selectedDate);
                const isToday = isSameDay(day, new Date());
                return (
                  <button
                    key={day.toString()}
                    onClick={() => setSelectedDate(day)}
                    className={`
                      w-full min-h-touch flex items-center justify-between p-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer
                      ${isSelected ? 'bg-primary text-white shadow-sm' : 'text-ink-muted hover:bg-primary-100 hover:text-primary'}
                    `}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center tabular-nums font-semibold ${isSelected ? 'bg-primary-800 text-white' : 'bg-silver-200 text-ink'}`}>
                        {format(day, 'd')}
                      </div>
                      <span className="capitalize">{format(day, 'EEEE', { locale: es })}</span>
                    </div>
                    {isToday && <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white' : 'bg-secondary'}`} />}
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* Columna derecha: lista de citas */}
        <div className="lg:col-span-3">
          <div className="bg-surface rounded-2xl shadow-sm border border-primary/10 p-6 min-h-[600px]">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-heading text-xl font-semibold text-primary">
                Agenda de pacientes
              </h2>
              {loading && <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />}
            </div>

            {appointments.length === 0 && !loading ? (
              <div className="text-center py-20">
                <CalendarIcon className="mx-auto h-16 w-16 text-silver-300 mb-4" />
                <p className="text-ink font-medium text-lg">Día sin citas agendadas.</p>
                <p className="text-ink-subtle mt-1">Disfruta tu tiempo libre o configura más disponibilidad.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {appointments.map((app) => (
                  <div
                    key={app.id}
                    className={`
                      p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between transition-colors gap-4
                      ${app.status === 'confirmed'
                        ? 'bg-success-100/60 border-success/20'
                        : app.status === 'cancelled'
                          ? 'bg-danger-100/50 border-danger/20'
                          : 'bg-surface border-primary/10 shadow-sm hover:border-primary-300'}
                    `}
                  >
                    <div className="flex items-start gap-4">
                      {/* Badge de hora — cifras tabulares, radio del sistema */}
                      <div className="bg-primary-100 text-primary font-semibold px-3 py-2 rounded-xl text-sm whitespace-nowrap text-center tabular-nums leading-tight">
                        {app.start_time.substring(0, 5)}<br />
                        <span className="text-xs font-normal text-ink-muted">{app.end_time.substring(0, 5)}</span>
                      </div>

                      {/* Datos del paciente */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <User className="w-4 h-4 text-silver" />
                          <span className="font-semibold text-ink">{app.patient_name}</span>
                          <StatusTag status={app.status} />
                        </div>

                        <div className="flex items-center gap-2 text-sm text-ink-muted">
                          <Phone className="w-3.5 h-3.5 text-silver" />
                          <span className="tabular-nums">{app.patient_phone}</span>
                        </div>

                        <div className="flex items-start gap-2 text-sm text-ink-muted">
                          <FileText className="w-3.5 h-3.5 mt-0.5 text-silver" />
                          <span className="line-clamp-2">“{app.reason || 'Sin motivo especificado'}”</span>
                        </div>
                      </div>
                    </div>

                    {/* Acción */}
                    <div className="w-full sm:w-auto">
                      {app.status === 'pending' ? (
                        <button
                          onClick={() => markAsAttended(app.id)}
                          className="w-full sm:w-auto min-h-touch inline-flex items-center justify-center gap-2 bg-surface text-primary border border-primary-300 hover:bg-primary-100 hover:border-primary-400 active:bg-primary-200 px-4 py-2 rounded-full font-medium text-sm transition-colors"
                        >
                          <CheckCircle className="w-4 h-4" />
                          <span>Marcar atendida</span>
                        </button>
                      ) : app.status === 'confirmed' ? (
                        <div className="inline-flex items-center gap-2 text-success font-medium text-sm px-4 py-2">
                          <CheckCircle className="w-5 h-5" />
                          <span>Completada</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
