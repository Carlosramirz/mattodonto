import React, { useState, useEffect } from 'react';
import { format, startOfWeek, addDays, isSameDay, differenceInMinutes, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon, Clock, CheckCircle, User, Phone, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

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
          // Re-fetch to guarantee consistency of joined data 
          // (Alternatively we could manually patch the state if it's an UPDATE)
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
    // Find the first pending appointment that is in the future
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
        // Optimistic update
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
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Agenda de {user?.full_name || user?.email || 'Odontólogo'}
        </h1>
        <p className="text-gray-500 mt-2">Resumen de tus citas y agenda diaria.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Left Sidebar: Week & Summary */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Summary Widget */}
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg shadow-blue-200">
            <h3 className="font-semibold text-blue-100 mb-4">Resumen del {format(selectedDate, 'dd/MM/yyyy')}</h3>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
                <p className="text-3xl font-bold">{totalAppointments}</p>
                <p className="text-xs text-blue-100 mt-1">Citas Totales</p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
                <p className="text-3xl font-bold">{pendingAppointments}</p>
                <p className="text-xs text-blue-100 mt-1">Pendientes</p>
              </div>
            </div>

            {timeUntilNext !== null ? (
              <div className="bg-white/20 rounded-xl p-4 backdrop-blur-sm flex items-center space-x-3 border border-white/20">
                <Clock className="w-8 h-8 text-white" />
                <div>
                  <p className="text-sm font-medium">Próxima cita en</p>
                  <p className="text-xl font-bold">{timeUntilNext} min</p>
                </div>
              </div>
            ) : (
              <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm text-center">
                <p className="text-sm text-blue-100">No hay citas próximas pendientes.</p>
              </div>
            )}
          </div>

          {/* Weekly Selector */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-800 mb-4">Esta Semana</h3>
            <div className="space-y-2">
              {weekDays.map(day => {
                const isSelected = isSameDay(day, selectedDate);
                const isToday = isSameDay(day, new Date());
                return (
                  <button
                    key={day.toString()}
                    onClick={() => setSelectedDate(day)}
                    className={`
                      w-full flex items-center justify-between p-3 rounded-xl text-sm font-medium transition-all
                      ${isSelected ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'hover:bg-gray-50 text-gray-600 border border-transparent'}
                    `}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSelected ? 'bg-blue-100' : 'bg-gray-100'}`}>
                        {format(day, 'd')}
                      </div>
                      <span className="capitalize">{format(day, 'EEEE', { locale: es })}</span>
                    </div>
                    {isToday && <span className="w-2 h-2 rounded-full bg-blue-500"></span>}
                  </button>
                );
              })}
            </div>
          </div>
          
        </div>

        {/* Right Column: Appointments List */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 min-h-[600px]">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-800">
                Agenda de Pacientes
              </h2>
              {loading && <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>}
            </div>

            {appointments.length === 0 && !loading ? (
              <div className="text-center py-20">
                <CalendarIcon className="mx-auto h-16 w-16 text-gray-200 mb-4" />
                <p className="text-gray-500 font-medium text-lg">Día sin citas agendadas.</p>
                <p className="text-gray-400 mt-1">Disfruta tu tiempo libre o configura más disponibilidad.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {appointments.map((app) => (
                  <div 
                    key={app.id} 
                    className={`
                      p-5 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between transition-all
                      ${app.status === 'confirmed' ? 'bg-green-50/50 border-green-100' : 'bg-white hover:border-blue-200 border-gray-100 shadow-sm'}
                    `}
                  >
                    <div className="flex items-start space-x-4">
                      {/* Time Badge */}
                      <div className="bg-gray-100 text-gray-800 font-bold px-3 py-2 rounded-lg text-sm whitespace-nowrap text-center">
                        {app.start_time.substring(0, 5)}<br/>
                        <span className="text-xs font-normal text-gray-500">{app.end_time.substring(0, 5)}</span>
                      </div>
                      
                      {/* Patient Info */}
                      <div className="space-y-1 mt-1 sm:mt-0">
                        <div className="flex items-center space-x-2">
                          <User className="w-4 h-4 text-gray-400" />
                          <span className="font-bold text-gray-900">{app.patient_name}</span>
                          {app.status === 'confirmed' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 uppercase">
                              Atendida
                            </span>
                          )}
                          {app.status === 'cancelled' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 uppercase">
                              Cancelada
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center space-x-2 text-sm text-gray-500">
                          <Phone className="w-3.5 h-3.5" />
                          <span>{app.patient_phone}</span>
                        </div>
                        
                        <div className="flex items-start space-x-2 text-sm text-gray-500">
                          <FileText className="w-3.5 h-3.5 mt-0.5" />
                          <span className="line-clamp-2 italic">"{app.reason || 'Sin motivo especificado'}"</span>
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="mt-4 sm:mt-0 w-full sm:w-auto">
                      {app.status === 'pending' ? (
                        <button
                          onClick={() => markAsAttended(app.id)}
                          className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white border border-blue-200 hover:border-transparent px-4 py-2 rounded-xl font-medium transition-all"
                        >
                          <CheckCircle className="w-4 h-4" />
                          <span>Marcar Atendida</span>
                        </button>
                      ) : app.status === 'confirmed' ? (
                        <div className="flex items-center space-x-2 text-green-600 font-medium px-4 py-2">
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
