import React, { useState, useEffect } from 'react';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon, Clock, Plus, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

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
      const res = await fetch('http://localhost:3001/api/public/dentists');
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
        // Actualizar localmente el is_active
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
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Disponibilidad de Odontólogos</h1>
          <p className="text-gray-500 mt-2">Administrar bloques de atención y horarios del personal clínico.</p>
        </div>

        {/* Selector de Dentista */}
        <div className="flex flex-col self-start md:self-auto min-w-[250px]">
          <label className="text-xs font-bold text-gray-500 mb-1">Odontólogo a Configurar</label>
          <select
            value={selectedDentistId}
            onChange={(e) => setSelectedDentistId(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white text-sm font-semibold text-gray-700 transition-all"
          >
            <option value="">Selecciona un odontólogo...</option>
            {dentists.map(d => (
              <option key={d.id} value={d.id}>{d.full_name}</option>
            ))}
          </select>
        </div>
      </div>

      {!selectedDentistId ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-gray-100 shadow-sm">
          <CalendarIcon className="mx-auto h-16 w-16 text-gray-200 mb-4" />
          <p className="text-gray-500 font-semibold text-lg">Selecciona un odontólogo arriba para comenzar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Lado izquierdo: Días y Generador */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Calendario Semanal */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-800 mb-4 font-bold text-sm uppercase tracking-wider">Fecha a Gestionar</h3>
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

            {/* Generador de bloques */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-850 mb-4 font-bold text-sm uppercase tracking-wider">Generar Bloques</h3>
              
              {success && (
                <div className="bg-green-50 text-green-700 p-3 rounded-xl mb-4 text-xs font-semibold border border-green-100">
                  ¡Bloques generados exitosamente!
                </div>
              )}
              {error && (
                <div className="bg-red-50 text-red-700 p-3 rounded-xl mb-4 text-xs font-semibold border border-red-100">
                  {error}
                </div>
              )}

              <form onSubmit={handleGenerate} className="space-y-4 text-xs">
                <div>
                  <label className="block text-gray-700 font-bold mb-1">Hora Inicio</label>
                  <input type="time" required value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-gray-700 font-bold mb-1">Hora Fin</label>
                  <input type="time" required value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-gray-700 font-bold mb-1">Duración (minutos)</label>
                  <select value={duration} onChange={e => setDuration(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    <option value="15">15 min (Control/Diag)</option>
                    <option value="30">30 min (Tratamientos)</option>
                    <option value="60">60 min</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-700 font-bold mb-1">Buffer (minutos)</label>
                  <input type="number" min="0" max="60" value={buffer} onChange={e => setBuffer(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                </div>
                
                <button
                  type="submit"
                  disabled={genLoading}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center space-x-2"
                >
                  {genLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Generar Rango</span>}
                </button>
              </form>
            </div>
          </div>

          {/* Lado derecho: Grid de bloques generados */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 min-h-[500px]">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-800">Bloques Horarios</h2>
                <div className="flex items-center space-x-2">
                  {loading && <Loader2 className="w-5 h-5 animate-spin text-blue-600" />}
                  <button 
                    onClick={() => fetchAvailability(selectedDate, selectedDentistId)}
                    className="p-2 border rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              </div>

              {slots.length === 0 && !loading ? (
                <div className="text-center py-20">
                  <Clock className="mx-auto h-16 w-16 text-gray-200 mb-4" />
                  <p className="text-gray-500 font-medium text-lg">No hay bloques definidos para este día.</p>
                  <p className="text-gray-400 text-xs mt-1">Usa el formulario del panel izquierdo para generar horarios de atención.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {slots.map(slot => (
                    <button
                      key={slot.id}
                      onClick={() => handleToggleSlot(slot.id)}
                      className={`
                        p-4 rounded-2xl border-2 transition-all text-center flex flex-col justify-center items-center gap-1
                        ${slot.isBooked 
                          ? 'bg-blue-50/50 border-blue-200 cursor-not-allowed' 
                          : slot.is_active 
                            ? 'bg-white border-green-200 hover:border-green-400 text-gray-800' 
                            : 'bg-gray-50 border-gray-200 text-gray-400 line-through'}
                      `}
                      disabled={slot.isBooked}
                    >
                      <span className="font-bold text-lg">{slot.start_time.substring(0, 5)}</span>
                      <span className="text-[10px] uppercase font-semibold text-gray-500">
                        {slot.isBooked ? 'Ocupado' : slot.is_active ? 'Activo (Click apagar)' : 'Apagado (Click encender)'}
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
