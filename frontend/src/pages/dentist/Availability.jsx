import React, { useState, useEffect } from 'react';
import { format, startOfWeek, addDays, isSameDay, subWeeks, addWeeks } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon, Clock, Trash2, Power, PowerOff, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function Availability() {
  const { user, apiFetch } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Form state
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('13:00');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [bufferMinutes, setBufferMinutes] = useState(10);

  // ID real del odontólogo obtenido del contexto de autenticación
  const dentistId = user?.id;

  useEffect(() => {
    fetchSlots(selectedDate);
  }, [selectedDate]);

  const fetchSlots = async (date) => {
    setLoading(true);
    try {
      const formattedDate = format(date, 'yyyy-MM-dd');
      const res = await apiFetch(`/api/availability?date=${formattedDate}`);
      const data = await res.json();
      setSlots(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching slots:', error);
      setSlots([]);
    } finally {
      setLoading(false);
    }
  };

  const generateSlots = async (e) => {
    e.preventDefault();
    try {
      const formattedDate = format(selectedDate, 'yyyy-MM-dd');
      const res = await apiFetch('/api/availability', {
        method: 'POST',
        body: JSON.stringify({
          dentist_id: dentistId,
          date: formattedDate,
          startTime,
          endTime,
          durationMinutes: Number(durationMinutes),
          bufferMinutes: Number(bufferMinutes)
        })
      });
      
      if (res.ok) {
        fetchSlots(selectedDate);
      } else {
        const err = await res.json();
        alert('Error: ' + err.error);
      }
    } catch (error) {
      console.error('Error generating slots:', error);
    }
  };

  const toggleSlot = async (id) => {
    try {
      const res = await apiFetch(`/api/availability/${id}/toggle`, {
        method: 'PUT'
      });
      if (res.ok) {
        setSlots(slots.map(slot => 
          slot.id === id ? { ...slot, is_active: !slot.is_active } : slot
        ));
      } else {
        const err = await res.json();
        alert('Error: ' + err.error);
      }
    } catch (error) {
      console.error('Error toggling slot:', error);
    }
  };

  // Calendar logic
  const startDate = startOfWeek(currentDate, { weekStartsOn: 1 }); // Start on Monday
  const weekDays = [...Array(7)].map((_, i) => addDays(startDate, i));

  const prevWeek = () => setCurrentDate(subWeeks(currentDate, 1));
  const nextWeek = () => setCurrentDate(addWeeks(currentDate, 1));

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8 font-sans">
      <div>
        <h1 className="font-heading text-3xl font-semibold text-ink">Gestión de Disponibilidad</h1>
        <p className="text-ink-subtle mt-1.5 text-sm font-medium">Configura tus horarios de atención semanales.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Calendar & Form */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Calendar */}
          <div className="bg-white rounded-2xl shadow-sm border border-silver-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-ink capitalize text-sm uppercase tracking-wider">
                {format(currentDate, 'MMMM yyyy', { locale: es })}
              </h2>
              <div className="flex space-x-2">
                <button onClick={prevWeek} className="p-1.5 rounded-xl hover:bg-silver-100 text-ink-muted transition-colors cursor-pointer border border-silver-200">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={nextWeek} className="p-1.5 rounded-xl hover:bg-silver-100 text-ink-muted transition-colors cursor-pointer border border-silver-200">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-7 gap-2">
              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => (
                <div key={day} className="text-center text-[10px] font-bold text-ink-subtle uppercase tracking-wider mb-2">
                  {day}
                </div>
              ))}
              {weekDays.map(day => {
                const isSelected = isSameDay(day, selectedDate);
                const isToday = isSameDay(day, new Date());
                return (
                  <button
                    key={day.toString()}
                    onClick={() => setSelectedDate(day)}
                    className={`
                      p-2 rounded-xl text-sm font-medium flex flex-col items-center justify-center transition-all duration-200 cursor-pointer
                      ${isSelected ? 'bg-primary text-white shadow-md font-bold' : 'hover:bg-silver-100 text-ink-muted'}
                      ${isToday && !isSelected ? 'text-secondary font-bold' : ''}
                    `}
                  >
                    <span>{format(day, 'd')}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Generator Form */}
          <div className="bg-white rounded-2xl shadow-sm border border-silver-200 p-5">
            <div className="flex items-center space-x-2 mb-4">
              <Clock className="w-5 h-5 text-secondary" />
              <h3 className="font-semibold text-ink text-sm uppercase tracking-wider font-bold">Generar Bloques</h3>
            </div>
            
            <form onSubmit={generateSlots} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-ink-muted font-bold mb-1">Hora Inicio</label>
                  <input 
                    type="time" 
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 border border-silver-300 rounded-lg focus:outline-none focus:border-secondary focus:shadow-focus" 
                    required 
                  />
                </div>
                <div>
                  <label className="block text-ink-muted font-bold mb-1">Hora Fin</label>
                  <input 
                    type="time" 
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 border border-silver-300 rounded-lg focus:outline-none focus:border-secondary focus:shadow-focus" 
                    required 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-ink-muted font-bold mb-1">Duración Cita (min)</label>
                  <input 
                    type="number" 
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                    className="w-full px-3 py-2 border border-silver-300 rounded-lg focus:outline-none focus:border-secondary focus:shadow-focus" 
                    required 
                  />
                </div>
                <div>
                  <label className="block text-ink-muted font-bold mb-1">Tiempo entre citas (min)</label>
                  <input 
                    type="number" 
                    value={bufferMinutes}
                    onChange={(e) => setBufferMinutes(e.target.value)}
                    className="w-full px-3 py-2 border border-silver-300 rounded-lg focus:outline-none focus:border-secondary focus:shadow-focus" 
                    required 
                  />
                </div>
              </div>

              <button 
                type="submit" 
                className="w-full bg-primary hover:bg-secondary text-white font-bold py-3 px-4 rounded-xl transition-all cursor-pointer mt-2 shadow-md hover:shadow-lg"
              >
                Generar Disponibilidad
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Slots List */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-silver-200 p-6 h-full min-h-[500px]">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-heading text-xl font-semibold text-ink">
                Bloques para el {format(selectedDate, 'dd/MM/yyyy')}
              </h2>
            </div>

            {loading ? (
              <div className="flex justify-center items-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : slots.length === 0 ? (
              <div className="text-center py-16 px-4">
                <CalendarIcon className="mx-auto h-12 w-12 text-silver-400 mb-4" />
                <p className="text-ink-subtle font-medium">No hay bloques configurados para este día.</p>
                <p className="text-sm text-ink-subtle mt-1">Usa el formulario para generar tu disponibilidad.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {slots.map((slot) => {
                  const isBooked = slot.isBooked;
                  return (
                    <div 
                      key={slot.id} 
                      className={`
                        p-4 rounded-2xl border flex items-center justify-between transition-all gap-4
                        ${!slot.is_active ? 'bg-silver-100 border-silver-300 opacity-70' : 'bg-white border-silver-200 hover:border-silver-300 shadow-sm'}
                        ${isBooked ? 'border-l-4 border-l-warning' : ''}
                      `}
                    >
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className={`font-bold ${!slot.is_active ? 'text-ink-subtle line-through' : 'text-ink'}`}>
                            {slot.start_time.substring(0, 5)} - {slot.end_time.substring(0, 5)}
                          </span>
                          {isBooked && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-warning-100 text-warning-700 uppercase tracking-wide">
                              Ocupado
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-ink-subtle mt-1 font-medium">
                          Tiempo entre citas: {slot.buffer_minutes} min
                        </p>
                        {isBooked && slot.appointment && (
                          <p className="text-xs text-ink-muted font-semibold mt-1.5 truncate max-w-[150px]">
                            Paciente: {slot.appointment.patient_name}
                          </p>
                        )}
                      </div>

                      <button
                        onClick={() => toggleSlot(slot.id)}
                        disabled={isBooked}
                        className={`
                          p-2 rounded-full transition-colors focus:outline-none cursor-pointer
                          ${isBooked 
                            ? 'bg-silver-200 text-silver-400 cursor-not-allowed' 
                            : slot.is_active 
                              ? 'bg-success-100 text-success hover:bg-success-100' 
                              : 'bg-silver-300 text-ink-muted hover:bg-silver-300'
                          }
                        `}
                        title={isBooked ? "No se puede desactivar un bloque ocupado" : slot.is_active ? "Desactivar" : "Activar"}
                      >
                        {slot.is_active ? <Power className="w-5 h-5" /> : <PowerOff className="w-5 h-5" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
