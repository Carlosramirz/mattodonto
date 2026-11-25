import React, { useState, useEffect } from 'react';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon, Clock, Plus, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function AssistantAvailability() {
  const { apiFetch } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // Lista de dentistas y selección
  const [dentists, setDentists] = useState([]);
  const [selectedDentistId, setSelectedDentistId] = useState('');
  
  // Disponibilidad
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Formulario generación slots
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [duration, setDuration] = useState(15);
  const [buffer, setBuffer] = useState(0);
  const [genLoading, setGenLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Calendario semanal
  const startDate = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDays = [...Array(7)].map((_, i) => addDays(startDate, i));

  // Obtener dentistas
  const fetchDentists = async () => {
    try {
      const res = await fetch(`${API_URL}/api/public/dentists`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setDentists(data);
        if (data.length > 0) {
          setSelectedDentistId(data[0].id); // Seleccionar el primero por defecto
        }
      }
    } catch (e) {
      console.error('Error fetching dentists:', e);
    }
  };

  const fetchAvailability = async (date, dentistId) => {
    if (!dentistId) return;
    setLoading(true);
    try {
      const formattedDate = format(date, 'yyyy-MM-dd');
      const res = await apiFetch(`/api/availability?date=${formattedDate}&dentist_id=${dentistId}`);
      const data = await res.json();
      if (res.ok) {
        setSlots(data || []);
      }
    } catch (err) {
      console.error('Error fetching availability:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!selectedDentistId) {
      setError('Por favor selecciona un odontólogo.');
      return;
    }
    setGenLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await apiFetch('/api/availability', {
        method: 'POST',
        body: JSON.stringify({
          dentist_id: selectedDentistId,
          date: format(selectedDate, 'yyyy-MM-dd'),
          startTime: startTime + ':00',
          endTime: endTime + ':00',
          durationMinutes: parseInt(duration),
          bufferMinutes: parseInt(buffer)
        })
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
        fetchAvailability(selectedDate, selectedDentistId);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(data.error || 'Error al generar los bloques.');
      }
    } catch (err) {
      console.error('Error generating availability:', err);
      setError('Error de comunicación con el servidor.');
    } finally {
      setGenLoading(false);
    }
  };

  const handleToggleSlot = async (slotId) => {
    try {
      const res = await apiFetch(`/api/availability/${slotId}/toggle`, {
        method: 'PUT'
      });
      if (res.ok) {
        setSlots(prev => prev.map(s => s.id === slotId ? { ...s, is_active: !s.is_active } : s));
      } else {
        const err = await res.json();
        alert('Error: ' + err.error);
      }
    } catch (err) {
      console.error('Error toggling availability slot:', err);
    }
  };

  useEffect(() => {
    fetchDentists();
  }, []);

  useEffect(() => {
    if (selectedDentistId) {
      fetchAvailability(selectedDate, selectedDentistId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, selectedDentistId]);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8 font-sans">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <h1 className="font-heading text-3xl font-semibold text-ink">Disponibilidad de Odontólogos</h1>
          <p className="text-ink-subtle mt-1.5 text-sm font-medium">Administrar bloques de atención y horarios del personal clínico.</p>
        </div>

        {/* Selector de Dentista */}
        <div className="flex flex-col self-start md:self-auto min-w-[250px]">
          <label className="text-[10px] font-bold uppercase tracking-wider text-ink-muted mb-1">Odontólogo a Configurar</label>
          <select
            value={selectedDentistId}
            onChange={(e) => setSelectedDentistId(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-silver-300 focus:outline-none focus:border-secondary focus:shadow-focus bg-white text-sm font-semibold text-ink-muted transition-all cursor-pointer"
          >
            <option value="">Selecciona un odontólogo...</option>
            {dentists.map(d => (
              <option key={d.id} value={d.id}>{d.full_name}</option>
            ))}
          </select>
        </div>
      </div>

      {!selectedDentistId ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-silver-200 shadow-sm">
          <CalendarIcon className="mx-auto h-16 w-16 text-silver-400 mb-4" />
          <p className="text-ink-subtle font-semibold text-lg">Selecciona un odontólogo arriba para comenzar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Lado izquierdo: Días y Generador */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Calendario Semanal */}
            <div className="bg-white rounded-2xl shadow-sm border border-silver-200 p-5">
              <h3 className="font-semibold text-ink mb-4 font-bold text-xs uppercase tracking-wider">Fecha a Gestionar</h3>
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
                        ${isSelected ? 'bg-silver-100 text-primary border border-silver-300' : 'hover:bg-silver-100 text-ink-muted border border-transparent'}
                      `}
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSelected ? 'bg-silver-300/65 text-primary font-bold' : 'bg-silver-200'}`}>
                          {format(day, 'd')}
                        </div>
                        <span className="capitalize">{format(day, 'EEEE', { locale: es })}</span>
                      </div>
                      {isToday && <span className="w-2 h-2 rounded-full bg-secondary"></span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Generador de bloques */}
            <div className="bg-white rounded-2xl shadow-sm border border-silver-200 p-5">
              <h3 className="font-semibold text-ink mb-4 font-bold text-xs uppercase tracking-wider">Generar Bloques</h3>
              
              {success && (
                <div className="bg-success-100 text-success-700 p-3 rounded-xl mb-4 text-xs font-semibold border border-success/20">
                  ¡Bloques generados exitosamente!
                </div>
              )}
              {error && (
                <div className="bg-danger-100 text-danger-700 p-3 rounded-xl mb-4 text-xs font-semibold border border-danger/20">
                  {error}
                </div>
              )}

              <form onSubmit={handleGenerate} className="space-y-4 text-xs">
                <div>
                  <label className="block text-ink-muted font-bold mb-1">Hora Inicio</label>
                  <input type="time" required value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full px-3 py-2 border border-silver-300 rounded-lg focus:outline-none focus:border-secondary focus:shadow-focus" />
                </div>
                <div>
                  <label className="block text-ink-muted font-bold mb-1">Hora Fin</label>
                  <input type="time" required value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full px-3 py-2 border border-silver-300 rounded-lg focus:outline-none focus:border-secondary focus:shadow-focus" />
                </div>
                <div>
                  <label className="block text-ink-muted font-bold mb-1">Duración (minutos)</label>
                  <select value={duration} onChange={e => setDuration(e.target.value)} className="w-full px-3 py-2 border border-silver-300 rounded-lg bg-white focus:outline-none focus:border-secondary focus:shadow-focus cursor-pointer">
                    <option value="15">15 min (Control/Diag)</option>
                    <option value="30">30 min (Tratamientos)</option>
                    <option value="60">60 min</option>
                  </select>
                </div>
                <div>
                  <label className="block text-ink-muted font-bold mb-1">Buffer (minutos)</label>
                  <input type="number" min="0" max="60" value={buffer} onChange={e => setBuffer(e.target.value)} className="w-full px-3 py-2 border border-silver-300 rounded-lg focus:outline-none focus:border-secondary focus:shadow-focus" />
                </div>
                
                <button
                  type="submit"
                  disabled={genLoading}
                  className="w-full py-3 bg-primary hover:bg-secondary text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center space-x-2 cursor-pointer"
                >
                  {genLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Generar Rango</span>}
                </button>
              </form>
            </div>
          </div>

          {/* Lado derecho: Grid de bloques generados */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-3xl shadow-sm border border-silver-200 p-6 min-h-[500px]">
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-heading text-xl font-semibold text-ink">Bloques Horarios</h2>
                <div className="flex items-center space-x-2">
                  {loading && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
                  <button 
                    onClick={() => fetchAvailability(selectedDate, selectedDentistId)}
                    className="p-2 border rounded-xl hover:bg-silver-100 transition-colors border-silver-300 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4 text-ink-subtle" />
                  </button>
                </div>
              </div>

              {slots.length === 0 && !loading ? (
                <div className="text-center py-20">
                  <Clock className="mx-auto h-16 w-16 text-silver-400 mb-4" />
                  <p className="text-ink-subtle font-medium text-lg">No hay bloques definidos para este día.</p>
                  <p className="text-ink-subtle text-xs mt-1">Usa el formulario del panel izquierdo para generar horarios de atención.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {slots.map(slot => (
                    <button
                      key={slot.id}
                      onClick={() => handleToggleSlot(slot.id)}
                      className={`
                        p-4 rounded-2xl border-2 transition-all text-center flex flex-col justify-center items-center gap-1 cursor-pointer
                        ${slot.isBooked 
                          ? 'bg-silver-200 border-silver-300 text-ink-subtle cursor-not-allowed' 
                          : slot.is_active 
                            ? 'bg-success-100/70 border-success/20 hover:border-success/40 text-success-700 font-semibold' 
                            : 'bg-silver-100 border-silver-300 text-ink-subtle line-through'}
                      `}
                      disabled={slot.isBooked}
                    >
                      <span className="font-bold text-lg">{slot.start_time.substring(0, 5)}</span>
                      <span className="text-[9px] uppercase font-bold tracking-wide">
                        {slot.isBooked ? 'Ocupado' : slot.is_active ? 'Activo (Apagar)' : 'Apagado (Encender)'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
