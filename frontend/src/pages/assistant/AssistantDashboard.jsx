import React, { useState, useEffect } from 'react';
import { format, startOfWeek, addDays, isSameDay, parse, addMonths, subMonths, startOfMonth, endOfMonth, endOfWeek, isSameMonth, isBefore, startOfDay, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon, Clock, User, Phone, FileText, Plus, X, ArrowLeft, ChevronLeft, ChevronRight, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

// Helper de suma de minutos para bloque doble
function addMinutesToTime(timeStr, minutes) {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const total = h * 60 + m + minutes;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}:00`;
}

// Helper RUT chileno
function formatRut(value) {
  let clean = value.replace(/[^0-9kK]/g, '').toUpperCase();
  if (clean.length === 0) return '';
  if (clean.length > 9) clean = clean.slice(0, 9);
  if (clean.length === 1) return clean;
  
  const dv = clean.slice(-1);
  const body = clean.slice(0, -1);
  
  let formattedBody = '';
  let count = 0;
  for (let i = body.length - 1; i >= 0; i--) {
    formattedBody = body[i] + formattedBody;
    count++;
    if (count % 3 === 0 && i !== 0) {
      formattedBody = '.' + formattedBody;
    }
  }
  return `${formattedBody}-${dv}`;
}

function validateChileanRut(rutStr) {
  if (typeof rutStr !== 'string') return false;
  const clean = rutStr.replace(/[^0-9kK]/g, '').toUpperCase();
  if (clean.length < 7) return false;
  
  const dv = clean.slice(-1);
  const body = clean.slice(0, -1);
  
  let sum = 0;
  let multiplier = 2;
  
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  
  const remainder = sum % 11;
  const result = 11 - remainder;
  
  let expectedDv;
  if (result === 11) expectedDv = '0';
  else if (result === 10) expectedDv = 'K';
  else expectedDv = String(result);
  
  return dv === expectedDv;
}

export default function AssistantDashboard() {
  const { apiFetch } = useAuth();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dentists, setDentists] = useState([]);
  const [selectedDentistId, setSelectedDentistId] = useState(''); // vacío significa "Todos"
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(false);

  // Modal Agendamiento
  const [showWizardModal, setShowWizardModal] = useState(false);

  // Semanal logic
  const startDate = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDays = [...Array(7)].map((_, i) => addDays(startDate, i));

  // Obtener lista de odontólogos
  const fetchDentists = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/public/dentists');
      const data = await res.json();
      if (Array.isArray(data)) {
        setDentists(data);
      }
    } catch (error) {
      console.error('Error fetching dentists:', error);
    }
  };

  const fetchAppointments = async (date, dentistId) => {
    setLoading(true);
    try {
      const formattedDate = format(date, 'yyyy-MM-dd');
      let url = `/api/dentist/appointments?date=${formattedDate}`;
      if (dentistId) {
        url += `&dentist_id=${dentistId}`;
      }
      const res = await apiFetch(url);
      const data = await res.json();
      if (res.ok) {
        setAppointments(data || []);
      }
    } catch (error) {
      console.error('Error fetching appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelAppointment = async (apptId) => {
    const confirmCancel = window.confirm('¿Estás seguro de que deseas cancelar esta cita?');
    if (!confirmCancel) return;

    try {
      const res = await apiFetch(`/api/dentist/appointments/${apptId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'cancelled' })
      });
      if (res.ok) {
        setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, status: 'cancelled' } : a));
      } else {
        const err = await res.json();
        alert('Error al cancelar: ' + err.error);
      }
    } catch (error) {
      console.error('Error cancelling appointment:', error);
      alert('Error de conexión al intentar cancelar.');
    }
  };

  useEffect(() => {
    fetchDentists();
  }, []);

  useEffect(() => {
    fetchAppointments(selectedDate, selectedDentistId);
    
    // Supabase Realtime Subscription
    const channel = supabase
      .channel('public:appointments')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        () => {
          fetchAppointments(selectedDate, selectedDentistId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, selectedDentistId]);

  const totalAppointments = appointments.length;
  const pendingAppointments = appointments.filter(a => a.status === 'pending').length;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Panel del Asistente</h1>
          <p className="text-gray-500 mt-2">Agenda diaria y asignación de citas clínicas.</p>
        </div>
        <div className="flex items-center gap-4 self-start md:self-auto">
          {/* Selector de Dentista */}
          <div className="flex flex-col">
            <label className="text-xs font-bold text-gray-500 mb-1">Filtrar por Odontólogo</label>
            <select
              value={selectedDentistId}
              onChange={(e) => setSelectedDentistId(e.target.value)}
              className="px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white text-sm font-semibold text-gray-700 transition-all"
            >
              <option value="">Todos los odontólogos</option>
              {dentists.map(d => (
                <option key={d.id} value={d.id}>{d.full_name}</option>
              ))}
            </select>
          </div>

          <button 
            onClick={() => setShowWizardModal(true)}
            className="flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-3 rounded-2xl shadow-lg shadow-blue-200 transition-all hover:-translate-y-0.5 mt-5"
          >
            <Plus className="w-5 h-5" />
            <span>Agendar Cita</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Agenda Semanal y Resumen */}
        <div className="lg:col-span-1 space-y-6">
          {/* Summary Widget */}
          <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl p-6 text-white shadow-lg shadow-indigo-200">
            <h3 className="font-semibold text-indigo-100 mb-4">Resumen del {format(selectedDate, 'dd/MM/yyyy')}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
                <p className="text-3xl font-bold">{totalAppointments}</p>
                <p className="text-xs text-indigo-100 mt-1">Citas Totales</p>
              </div>
              <div className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
                <p className="text-3xl font-bold">{pendingAppointments}</p>
                <p className="text-xs text-indigo-100 mt-1">Pendientes</p>
              </div>
            </div>
          </div>

          {/* Selector de días de la semana */}
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

        {/* Listado de Citas */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 min-h-[500px]">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-800">Citas Agendadas</h2>
              {loading && <Loader2 className="w-5 h-5 animate-spin text-blue-600" />}
            </div>

            {appointments.length === 0 && !loading ? (
              <div className="text-center py-20">
                <CalendarIcon className="mx-auto h-16 w-16 text-gray-200 mb-4" />
                <p className="text-gray-500 font-medium text-lg">No hay citas en este día.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {appointments.map((app) => (
                  <div 
                    key={app.id} 
                    className={`
                      p-5 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between transition-all gap-4
                      ${app.status === 'confirmed' ? 'bg-green-50/50 border-green-100' : app.status === 'cancelled' ? 'bg-red-50/30 border-red-100 opacity-70' : 'bg-white border-gray-100 shadow-sm'}
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
                        <div className="flex flex-wrap items-center gap-2">
                          <User className="w-4 h-4 text-gray-400" />
                          <span className="font-bold text-gray-900">{app.patient_name}</span>
                          {app.status === 'confirmed' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 uppercase">
                              Confirmada
                            </span>
                          )}
                          {app.status === 'cancelled' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 uppercase">
                              Cancelada
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Acciones del Asistente */}
                    {app.status !== 'cancelled' && (
                      <button
                        onClick={() => handleCancelAppointment(app.id)}
                        className="text-xs font-bold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-3.5 py-2 rounded-xl transition-all self-end sm:self-auto"
                      >
                        Cancelar Cita
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL CON EL BOOKING WIZARD INTERNO ADAPTADO */}
      {showWizardModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 sm:p-8 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button 
              onClick={() => setShowWizardModal(false)}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
            <InternalBookingWizard 
              dentists={dentists}
              initialDentistId={selectedDentistId}
              onClose={() => {
                setShowWizardModal(false);
                fetchAppointments(selectedDate, selectedDentistId);
              }} 
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Componente del Asistente del Asistente (BookingWizard adaptado)
function InternalBookingWizard({ dentists, initialDentistId, onClose }) {
  const [step, setStep] = useState(initialDentistId ? 1 : 0); // Si no hay dentista inicial, empieza en paso 0
  const [selectedDentist, setSelectedDentist] = useState(
    initialDentistId ? dentists.find(d => d.id === initialDentistId) : null
  );

  const [appointmentTypes, setAppointmentTypes] = useState([]);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [slotsByDate, setSlotsByDate] = useState({});
  const [loading, setLoading] = useState(true);

  // Selecciones
  const [selectedType, setSelectedType] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);

  // Formulario
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '+569',
    rut: '',
    reason: 'Consulta'
  });
  const [rutError, setRutError] = useState(null);

  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [bookingError, setBookingError] = useState(null);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchTypes();
      if (selectedDentist) {
        await fetchSlots(selectedDentist.id);
      }
      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDentist]);

  const fetchTypes = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/public/appointment-types');
      const data = await res.json();
      if (res.ok) {
        setAppointmentTypes(data || []);
        if (data.length > 0) setSelectedType(data[0]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSlots = async (dentistId) => {
    try {
      const res = await fetch(`http://localhost:3001/api/public/availability?dentist_id=${dentistId}`);
      const data = await res.json();
      if (res.ok) {
        setAvailableSlots(data || []);
        const grouped = {};
        data.forEach(slot => {
          if (!grouped[slot.date]) grouped[slot.date] = [];
          grouped[slot.date].push(slot);
        });
        setSlotsByDate(grouped);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDentistSelect = (dentist) => {
    setSelectedDentist(dentist);
    // Limpiar selecciones previas
    setSelectedDate(null);
    setSelectedSlot(null);
    setStep(1);
  };

  const getValidSlotsForDate = (dateStr, type) => {
    const slots = slotsByDate[dateStr] || [];
    if (!type || !type.requires_double_slot) return slots;

    return slots.filter(slot => {
      const nextTime = addMinutesToTime(slot.end_time, slot.buffer_minutes);
      return slots.some(s => 
        s.dentist_id === slot.dentist_id && 
        s.start_time === nextTime
      );
    });
  };

  const submitBooking = async () => {
    setBookingLoading(true);
    setBookingError(null);
    try {
      const res = await fetch('http://localhost:3001/api/public/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          availability_id: selectedSlot.id,
          patient_name: formData.name,
          patient_email: formData.email,
          patient_phone: formData.phone,
          patient_rut: formData.rut,
          reason: formData.reason,
          appointment_type_id: selectedType.id
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al agendar cita');
      setBookingSuccess(true);
      setStep(6);
    } catch (err) {
      setBookingError(err.message);
    } finally {
      setBookingLoading(false);
    }
  };

  const handleRutChange = (e) => {
    const formatted = formatRut(e.target.value);
    setFormData(prev => ({ ...prev, rut: formatted }));
  };

  // PASO 0: Elegir Odontólogo
  const renderStep0 = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-gray-900 mb-2">Paso 1: Seleccionar Odontólogo</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {dentists.map(d => (
          <button
            key={d.id}
            type="button"
            onClick={() => handleDentistSelect(d)}
            className="p-4 text-left border rounded-2xl transition-all border-gray-255 bg-white hover:border-blue-500 hover:shadow-sm"
          >
            <div className="font-bold text-sm text-gray-900">{d.full_name}</div>
            <div className="text-xs text-gray-500">Cirujano Dentista</div>
          </button>
        ))}
      </div>
    </div>
  );

  // PASO 1: Tipo de Cita
  const renderStep1 = () => (
    <div className="space-y-4">
      {!initialDentistId && (
        <button onClick={() => setStep(0)} className="flex items-center text-xs font-semibold text-blue-600 hover:text-blue-800">
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Volver a odontólogos
        </button>
      )}
      <h3 className="text-lg font-bold text-gray-900">Paso 2: Tipo de Cita</h3>
      <p className="text-xs text-gray-500">Odontólogo: <strong>Dr(a). {selectedDentist?.full_name}</strong></p>
      <div className="space-y-2">
        {appointmentTypes.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSelectedType(t)}
            className={`w-full p-4 text-left border rounded-2xl transition-all ${
              selectedType?.id === t.id ? 'border-blue-600 bg-blue-50/50' : 'border-gray-200'
            }`}
          >
            <div className="font-bold text-sm">{t.name}</div>
            <div className="text-xs text-gray-500 mt-1">Duración: {t.duration_minutes} min</div>
          </button>
        ))}
      </div>
      <button
        onClick={() => setStep(2)}
        disabled={!selectedType}
        className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl text-xs hover:bg-blue-700 transition-colors disabled:opacity-50 mt-4"
      >
        Continuar
      </button>
    </div>
  );

  // PASO 2: Elegir Fecha
  const renderStep2 = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const today = startOfDay(new Date());

    const rows = [];
    let days = [];
    let day = startDate;

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const cloneDay = day;
        const dateKey = format(cloneDay, 'yyyy-MM-dd');
        const validSlots = getValidSlotsForDate(dateKey, selectedType);
        const hasSlots = validSlots.length > 0;
        const isPast = isBefore(cloneDay, today);
        const isCurrentMonth = isSameMonth(cloneDay, monthStart);

        const isDisabled = isPast || !hasSlots || !isCurrentMonth;
        const isSelected = selectedDate && isSameDay(cloneDay, selectedDate);

        days.push(
          <button
            key={cloneDay.toString()}
            disabled={isDisabled}
            onClick={() => {
              setSelectedDate(cloneDay);
              setSelectedSlot(null);
              setStep(3);
            }}
            className={`p-2.5 flex flex-col items-center justify-center rounded-xl text-xs transition-all border ${
              isDisabled ? 'text-gray-300 border-transparent cursor-not-allowed' : 'hover:border-blue-300 hover:bg-blue-50/10'
            } ${isSelected ? 'bg-blue-600 text-white font-bold shadow-sm' : ''}`}
          >
            <span>{format(cloneDay, 'd')}</span>
          </button>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="grid grid-cols-7 gap-1.5" key={day.toString()}>
          {days}
        </div>
      );
      days = [];
    }

    return (
      <div className="space-y-4">
        <button onClick={() => setStep(1)} className="flex items-center text-xs font-semibold text-blue-600 hover:text-blue-800">
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Volver a tipo de cita
        </button>
        <h3 className="text-lg font-bold text-gray-900">Paso 3: Elegir Fecha</h3>
        <p className="text-xs text-gray-500">
          Dr(a). {selectedDentist?.full_name} • Tipo: {selectedType?.name}
        </p>
        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
          <div className="flex justify-between items-center mb-3">
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1 border bg-white rounded-lg"><ChevronLeft className="w-4 h-4"/></button>
            <span className="font-bold text-xs capitalize">{format(currentMonth, 'MMMM yyyy', { locale: es })}</span>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1 border bg-white rounded-lg"><ChevronRight className="w-4 h-4"/></button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-2 text-center text-[10px] font-bold text-gray-400">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(n => <div key={n}>{n}</div>)}
          </div>
          <div className="space-y-1">{rows}</div>
        </div>
      </div>
    );
  };

  // PASO 3: Horarios
  const renderStep3 = () => {
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    const validSlots = getValidSlotsForDate(dateKey, selectedType);

    return (
      <div className="space-y-4">
        <button onClick={() => setStep(2)} className="flex items-center text-xs font-semibold text-blue-600 hover:text-blue-800">
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Volver al calendario
        </button>
        <h3 className="text-lg font-bold text-gray-900">Paso 4: Horarios Disponibles</h3>
        <p className="text-xs text-gray-500">
          Fecha: {format(selectedDate, "dd 'de' MMMM", { locale: es })} con el Dr(a). {selectedDentist?.full_name}
        </p>
        <div className="grid grid-cols-3 gap-2.5">
          {validSlots.map(slot => (
            <button
              key={slot.id}
              onClick={() => {
                setSelectedSlot(slot);
                setStep(4);
              }}
              className="p-3 border-2 border-gray-200 hover:border-blue-500 rounded-xl font-bold text-sm bg-white"
            >
              {slot.start_time.substring(0, 5)}
            </button>
          ))}
        </div>
      </div>
    );
  };

  // PASO 4: Formulario Paciente
  const renderStep4 = () => (
    <div className="space-y-4">
      <button onClick={() => setStep(3)} className="flex items-center text-xs font-semibold text-blue-600 hover:text-blue-800">
        <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Volver a horarios
      </button>
      <h3 className="text-lg font-bold text-gray-900">Paso 5: Datos del Paciente</h3>
      <form onSubmit={(e) => {
        e.preventDefault();
        if (!validateChileanRut(formData.rut)) {
          setRutError('RUT no válido');
          return;
        }
        setRutError(null);
        setStep(5);
      }} className="space-y-4 text-xs">
        <div>
          <label className="block font-medium text-gray-700 mb-1">Nombre Completo *</label>
          <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-xl outline-none" />
        </div>
        <div>
          <label className="block font-medium text-gray-700 mb-1">RUT *</label>
          <input type="text" required value={formData.rut} onChange={handleRutChange} className="w-full px-3 py-2 border border-gray-200 rounded-xl outline-none" />
          {rutError && <p className="text-red-500 text-[10px] mt-1">{rutError}</p>}
        </div>
        <div>
          <label className="block font-medium text-gray-700 mb-1">Correo Electrónico *</label>
          <input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-xl outline-none" />
        </div>
        <div>
          <label className="block font-medium text-gray-700 mb-1">Teléfono *</label>
          <input type="tel" required value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-xl outline-none" />
        </div>
        <div>
          <label className="block font-medium text-gray-700 mb-1">Motivo de Consulta</label>
          <select value={formData.reason} onChange={e => setFormData({...formData, reason: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-xl outline-none bg-white">
            <option value="Consulta">Consulta General</option>
            <option value="Limpieza">Limpieza Dental</option>
            <option value="Urgencia">Urgencia</option>
            <option value="Control">Control</option>
            <option value="Otro">Otro</option>
          </select>
        </div>
        <button type="submit" className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl">Continuar al Resumen</button>
      </form>
    </div>
  );

  // PASO 5: Resumen
  const renderStep5 = () => (
    <div className="space-y-4">
      <button onClick={() => setStep(4)} className="flex items-center text-xs font-semibold text-blue-600 hover:text-blue-800">
        <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Volver a datos
      </button>
      <h3 className="text-lg font-bold text-gray-900">Paso 6: Resumen</h3>
      <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 text-xs space-y-2">
        <p><strong>Odontólogo:</strong> Dr(a). {selectedDentist?.full_name}</p>
        <p><strong>Fecha:</strong> {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })} a las {selectedSlot?.start_time.substring(0,5)} hrs</p>
        <p><strong>Tipo:</strong> {selectedType?.name}</p>
        <p><strong>Paciente:</strong> {formData.name} ({formData.rut})</p>
        <p><strong>Contacto:</strong> {formData.email} • {formData.phone}</p>
        <p><strong>Motivo:</strong> {formData.reason}</p>
      </div>

      {bookingError && <p className="text-red-600 font-bold text-xs">{bookingError}</p>}

      <button
        onClick={submitBooking}
        disabled={bookingLoading}
        className="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl disabled:opacity-50"
      >
        {bookingLoading ? 'Agendando...' : 'Confirmar Cita'}
      </button>
    </div>
  );

  // PASO 6: Éxito
  const renderStep6 = () => (
    <div className="text-center py-6 space-y-4">
      <div className="w-12 h-12 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto">
        <CheckCircle className="w-6 h-6" />
      </div>
      <h3 className="text-xl font-bold text-gray-900">¡Cita Agendada Exitosamente!</h3>
      <p className="text-xs text-gray-500 max-w-sm mx-auto">La cita ha quedado agendada en la base de datos de Mattodonto. Se envió confirmación por correo al paciente.</p>
      <button onClick={onClose} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs">Cerrar y Volver a Agenda</button>
    </div>
  );

  return (
    <div>
      {loading ? (
        <div className="py-12 text-center text-gray-400 text-xs">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
          Cargando opciones...
        </div>
      ) : (
        <>
          {step === 0 && renderStep0()}
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
          {step === 5 && renderStep5()}
          {step === 6 && renderStep6()}
        </>
      )}
    </div>
  );
}
