import React, { useState, useEffect } from 'react';
import { 
  format, addMonths, subMonths, startOfMonth, endOfMonth, 
  startOfWeek, endOfWeek, isSameMonth, isSameDay, addDays, 
  isBefore, startOfDay, parseISO
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, User, CheckCircle, ArrowLeft } from 'lucide-react';

// Función auxiliar para sumar minutos a una cadena de hora "HH:mm:ss" o "HH:mm"
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

// Función auxiliar para formatear RUT chileno XX.XXX.XXX-X
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

// Función auxiliar para validar RUT chileno (módulo 11)
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

export default function BookingWizard() {
  const [currentStep, setCurrentStep] = useState(1);
  
  // Estado de Datos
  const [availableSlots, setAvailableSlots] = useState([]);
  const [slotsByDate, setSlotsByDate] = useState({});
  const [appointmentTypes, setAppointmentTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Estado de Selección
  const [selectedType, setSelectedType] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  
  // Estado del Formulario
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '+56',
    rut: '',
    reason: 'Consulta'
  });
  const [rutError, setRutError] = useState(null);

  const handleRutChange = (e) => {
    const formatted = formatRut(e.target.value);
    setFormData(prev => ({ ...prev, rut: formatted }));
  };
  
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [bookingError, setBookingError] = useState(null);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await fetchAppointmentTypes();
      await fetchAvailability();
      setLoading(false);
    };
    init();
  }, []);

  const fetchAppointmentTypes = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/public/appointment-types');
      const data = await res.json();
      if (Array.isArray(data)) {
        setAppointmentTypes(data);
        if (data.length > 0) {
          setSelectedType(data[0]); // Seleccionar el primero por defecto
        }
      } else {
        console.error('La respuesta de tipos de cita no es un array:', data);
        setAppointmentTypes([]);
      }
    } catch (err) {
      console.error('Error al obtener los tipos de cita:', err);
      setAppointmentTypes([]);
    }
  };

  const fetchAvailability = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/public/availability');
      const data = await res.json();
      
      if (Array.isArray(data)) {
        setAvailableSlots(data);
        
        // Agrupar por fecha
        const grouped = {};
        data.forEach(slot => {
          if (!grouped[slot.date]) grouped[slot.date] = [];
          grouped[slot.date].push(slot);
        });
        setSlotsByDate(grouped);
      } else {
        console.error('La respuesta de disponibilidad no es un array:', data);
        setAvailableSlots([]);
        setSlotsByDate({});
      }
    } catch (err) {
      console.error('Error al obtener disponibilidad:', err);
      setAvailableSlots([]);
      setSlotsByDate({});
    }
  };

  const handleNextStep = () => setCurrentStep(prev => prev + 1);
  const handlePrevStep = () => {
    setBookingError(null);
    setCurrentStep(prev => prev - 1);
  };

  // Función para filtrar bloques horarios con disponibilidad suficiente para el tipo de cita
  const getValidSlotsForDate = (dateStr, type) => {
    const slots = slotsByDate[dateStr] || [];
    if (!type) return slots;
    if (!type.requires_double_slot) return slots;

    // Si requiere bloque doble, cada bloque debe tener uno consecutivo libre para el mismo dentista
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
      
      if (!res.ok) {
        throw new Error(data.error || 'Error al agendar la cita');
      }

      setBookingSuccess(true);
      setCurrentStep(6); // Paso de éxito
      
      // Recargar disponibilidad en segundo plano
      fetchAvailability();
    } catch (err) {
      setBookingError(err.message);
    } finally {
      setBookingLoading(false);
    }
  };

  // --- RENDERIZADO DE PASOS ---

  // PASO 1: Selección de Tipo de Cita
  const renderStep1Type = () => {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
          <CalendarIcon className="w-6 h-6 mr-3 text-blue-600" />
          Selecciona el Tipo de Cita
        </h2>
        
        <div className="space-y-4">
          {appointmentTypes.map(type => {
            const isSelected = selectedType?.id === type.id;
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => setSelectedType(type)}
                className={`
                  w-full p-5 text-left rounded-2xl transition-all border-2 flex flex-col md:flex-row md:items-center justify-between gap-3
                  ${isSelected 
                    ? 'border-blue-600 bg-blue-50/50 shadow-md shadow-blue-50/50' 
                    : 'border-gray-150 bg-white hover:border-blue-300 hover:shadow-md'}
                `}
              >
                <div>
                  <span className="font-bold text-lg text-gray-900 block">{type.name}</span>
                  {type.requires_double_slot && (
                    <p className="text-xs text-blue-600 font-semibold mt-1">
                      * Requiere 2 bloques horarios consecutivos
                    </p>
                  )}
                </div>
                <span className="text-sm font-semibold px-4 py-2 bg-gray-100 text-gray-700 rounded-full whitespace-nowrap self-start md:self-auto">
                  Duración: {type.duration_minutes} min
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={handleNextStep}
          disabled={!selectedType}
          className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-200 transition-all transform hover:-translate-y-0.5 mt-8 disabled:opacity-50"
        >
          Continuar
        </button>
      </div>
    );
  };

  // PASO 2: Selección de Fecha (Calendario)
  const renderStep2Calendar = () => {
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
        
        // Verificar bloques válidos para el tipo seleccionado
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
              // Limpiar slot seleccionado previamente si cambia de día
              if (!selectedDate || !isSameDay(cloneDay, selectedDate)) {
                setSelectedSlot(null);
              }
              handleNextStep();
            }}
            className={`
              p-3 sm:p-4 flex flex-col items-center justify-center rounded-2xl transition-all border
              ${isDisabled ? 'text-gray-300 cursor-not-allowed border-transparent' : 'hover:border-blue-300 hover:shadow-md border-transparent'}
              ${isSelected ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 font-bold' : (!isDisabled ? 'bg-white text-gray-700' : '')}
            `}
          >
            <span className="text-lg">{format(cloneDay, 'd')}</span>
            {!isDisabled && !isSelected && (
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full mt-1"></span>
            )}
          </button>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="grid grid-cols-7 gap-2 mb-2" key={day.toString()}>
          {days}
        </div>
      );
      days = [];
    }

    return (
      <div className="animate-in fade-in slide-in-from-right-8 duration-500">
        <button onClick={handlePrevStep} className="flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver a tipo de cita
        </button>

        <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center">
          <CalendarIcon className="w-6 h-6 mr-3 text-blue-600" />
          Elige una Fecha
        </h2>
        <p className="text-gray-500 mb-6">Mostrando días disponibles para: <strong>{selectedType?.name}</strong></p>
        
        <div className="bg-gray-50/50 p-6 rounded-3xl border border-gray-100">
          <div className="flex justify-between items-center mb-6">
            <button 
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-2 bg-white rounded-full shadow-sm hover:bg-gray-50 transition-colors border border-gray-200"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h3 className="text-lg font-bold text-gray-800 capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: es })}
            </h3>
            <button 
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-2 bg-white rounded-full shadow-sm hover:bg-gray-50 transition-colors border border-gray-200"
            >
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>
          
          <div className="grid grid-cols-7 gap-2 mb-4">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(dayName => (
              <div key={dayName} className="text-center font-semibold text-gray-500 text-sm">
                {dayName}
              </div>
            ))}
          </div>
          
          {rows}
        </div>
      </div>
    );
  };

  // PASO 3: Selección de Horario
  const renderStep3Slots = () => {
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    const validSlots = getValidSlotsForDate(dateKey, selectedType);

    return (
      <div className="animate-in fade-in slide-in-from-right-8 duration-500">
        <button onClick={handlePrevStep} className="flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver al calendario
        </button>
        
        <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center">
          <Clock className="w-6 h-6 mr-3 text-blue-600" />
          Horarios Disponibles
        </h2>
        <p className="text-gray-500 mb-6 flex flex-wrap gap-1">
          Mostrando horas para el <span>{format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}</span>
          <span>({selectedType?.name})</span>
        </p>

        {selectedType?.requires_double_slot && (
          <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl mb-6 text-sm text-blue-800">
            <strong>Nota:</strong> Los horarios mostrados garantizan dos bloques consecutivos para este tipo de cita.
          </div>
        )}

        {validSlots.length === 0 ? (
          <div className="text-center p-8 bg-gray-50 rounded-2xl border border-gray-200">
            <p className="text-gray-600">No hay horarios disponibles para este tipo de cita hoy, por favor regresa y elige otra fecha.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {validSlots.map(slot => (
              <button
                key={slot.id}
                onClick={() => {
                  setSelectedSlot(slot);
                  handleNextStep();
                }}
                className={`
                  p-4 rounded-2xl font-bold text-lg transition-all border-2
                  ${selectedSlot?.id === slot.id 
                    ? 'border-blue-600 bg-blue-50 text-blue-700' 
                    : 'border-gray-150 bg-white hover:border-blue-300 hover:shadow-md text-gray-700'}
                `}
              >
                {slot.start_time.substring(0, 5)}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  // PASO 4: Datos del Paciente
  const renderStep4Form = () => {
    return (
      <div className="animate-in fade-in slide-in-from-right-8 duration-500">
        <button onClick={handlePrevStep} className="flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver a horarios
        </button>
        
        <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center">
          <User className="w-6 h-6 mr-3 text-blue-600" />
          Ingresa tus Datos
        </h2>
        <p className="text-gray-500 mb-6">Completa tus datos de contacto.</p>

        <form className="space-y-5" onSubmit={(e) => { 
          e.preventDefault(); 
          if (!validateChileanRut(formData.rut)) {
            setRutError('El RUT ingresado no es válido. Verifica e intenta nuevamente.');
            return;
          }
          setRutError(null);
          handleNextStep(); 
        }}>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
            <input 
              type="text" required
              value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" 
              placeholder="Ej. Juan Pérez"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">RUT</label>
            <input 
              type="text" required
              value={formData.rut} onChange={handleRutChange}
              className={`w-full px-4 py-3 rounded-xl border ${rutError ? 'border-red-500 focus:ring-red-500' : 'border-gray-200 focus:ring-blue-500'} focus:ring-2 focus:border-transparent transition-all outline-none`} 
              placeholder="Ej. 12.345.678-5"
            />
            {rutError ? (
              <p className="text-xs text-red-600 mt-1 font-medium">{rutError}</p>
            ) : (
              <p className="text-xs text-gray-500 mt-1">Formato: XX.XXX.XXX-X (con puntos y guión)</p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico</label>
            <input 
              type="email" required
              value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" 
              placeholder="ejemplo@correo.com"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono (Celular)</label>
            <input 
              type="tel" required
              pattern="^\+56[0-9]{9}$"
              title="Debe tener el formato +56 seguido de 9 dígitos"
              value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" 
            />
            <p className="text-xs text-gray-500 mt-1">Formato: +56912345678</p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo de Consulta</label>
            <select 
              value={formData.reason} onChange={e => setFormData({...formData, reason: e.target.value})}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none bg-white"
            >
              <option value="Consulta">Consulta General</option>
              <option value="Limpieza">Limpieza Dental</option>
              <option value="Urgencia">Urgencia</option>
              <option value="Control">Control</option>
              <option value="Otro">Otro</option>
            </select>
          </div>

          <button type="submit" className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-200 transition-all transform hover:-translate-y-0.5 mt-4">
            Continuar al Resumen
          </button>
        </form>
      </div>
    );
  };

  // PASO 5: Resumen y Confirmación
  const renderStep5Confirm = () => {
    return (
      <div className="animate-in fade-in slide-in-from-right-8 duration-500">
        <button onClick={handlePrevStep} className="flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 mb-6 transition-colors" disabled={bookingLoading}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver a mis datos
        </button>
        
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
          <CheckCircle className="w-6 h-6 mr-3 text-blue-600" />
          Resumen de la Cita
        </h2>

        <div className="bg-gray-50 border border-gray-200 rounded-3xl p-6 mb-8 space-y-4">
          <div className="pb-4 border-b border-gray-200">
            <p className="text-sm text-gray-500 font-medium">Cuándo</p>
            <p className="text-lg font-bold text-gray-900 capitalize">
              {format(selectedDate, "EEEE d 'de' MMMM, yyyy", { locale: es })}
            </p>
            <p className="text-blue-600 font-bold mt-1 text-xl">{selectedSlot?.start_time.substring(0, 5)} hrs</p>
          </div>
          
          <div className="pt-2 space-y-3">
            <div>
              <p className="text-sm text-gray-500 font-medium">Tipo de Consulta</p>
              <p className="font-semibold text-gray-800">{selectedType?.name} ({selectedType?.duration_minutes} min)</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Paciente</p>
              <p className="font-semibold text-gray-800">{formData.name} (RUT: {formData.rut})</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Contacto</p>
              <p className="text-gray-800">{formData.email} • {formData.phone}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Motivo</p>
              <p className="text-gray-800">{formData.reason}</p>
            </div>
          </div>
        </div>

        {bookingError && (
          <div className="bg-red-50 text-red-700 p-4 rounded-xl mb-6 border border-red-100 flex items-start">
            <div className="font-bold mr-2">¡Atención!</div>
            <div>{bookingError}</div>
          </div>
        )}

        <button 
          onClick={submitBooking} 
          disabled={bookingLoading}
          className={`
            w-full py-4 text-white font-bold rounded-xl shadow-lg transition-all
            ${bookingLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600 hover:-translate-y-0.5 shadow-green-200'}
          `}
        >
          {bookingLoading ? 'Confirmando...' : 'Confirmar Agendamiento'}
        </button>
      </div>
    );
  };

  // RENDER ÉXITO (PASO 6)
  const renderSuccess = () => {
    return (
      <div className="text-center animate-in zoom-in-95 duration-500 py-10">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-green-500" />
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-4">¡Cita Confirmada!</h2>
        <p className="text-gray-600 max-w-md mx-auto mb-8 text-lg">
          Te hemos enviado un correo a <span className="font-semibold">{formData.email}</span> con los detalles de tu cita. 
          Te esperamos el <span className="font-semibold capitalize">{format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}</span> a las <span className="font-semibold">{selectedSlot?.start_time.substring(0, 5)}</span>.
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="text-blue-600 font-medium hover:underline"
        >
          Agendar otra cita
        </button>
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Cabecera */}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Mattodonto</h1>
        <p className="text-gray-500 mt-3 text-lg">Agenda tu hora de forma rápida y sencilla.</p>
      </div>

      {/* Barra de Progreso (se oculta en el paso final de éxito) */}
      {currentStep < 6 && (
        <div className="flex items-center justify-between mb-10 max-w-md mx-auto px-4 relative">
          <div className="absolute top-1/2 left-0 right-0 h-1 bg-gray-200 -z-10 -translate-y-1/2"></div>
          <div className="absolute top-1/2 left-0 h-1 bg-blue-600 -z-10 -translate-y-1/2 transition-all duration-500" style={{ width: `${((currentStep - 1) / 4) * 100}%` }}></div>
          
          {[1, 2, 3, 4, 5].map(step => (
            <div 
              key={step} 
              className={`
                w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300
                ${currentStep > step ? 'bg-blue-600 text-white' : currentStep === step ? 'bg-blue-600 text-white ring-4 ring-blue-100' : 'bg-white text-gray-400 border-2 border-gray-200'}
              `}
            >
              {step}
            </div>
          ))}
        </div>
      )}

      {/* Contenedor del Contenido de los Pasos */}
      <div className="bg-white rounded-[2rem] shadow-xl shadow-gray-200/50 p-6 sm:p-10 border border-gray-100">
        {loading ? (
          <div className="py-20 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-500">Cargando disponibilidad y opciones...</p>
          </div>
        ) : (
          <>
            {currentStep === 1 && renderStep1Type()}
            {currentStep === 2 && renderStep2Calendar()}
            {currentStep === 3 && renderStep3Slots()}
            {currentStep === 4 && renderStep4Form()}
            {currentStep === 5 && renderStep5Confirm()}
            {currentStep === 6 && renderSuccess()}
          </>
        )}
      </div>
    </div>
  );
}
