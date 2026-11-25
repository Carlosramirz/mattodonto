import React, { useState, useEffect } from 'react';
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, isSameMonth, isSameDay, addDays,
  isBefore, startOfDay
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, User, CheckCircle, ArrowLeft, ShieldAlert } from 'lucide-react';

/* ──────────────────────────────────────────────────────────────
   Clases compartidas — un solo lenguaje visual para los 6 pasos.
   Antes los pasos 1 y 2-6 usaban azules distintos (primary vs blue-600)
   y grises distintos (slate-* vs gray-*).
   ────────────────────────────────────────────────────────────── */
const btnPrimary =
  "w-full min-h-touch py-3.5 bg-primary hover:bg-primary-700 active:bg-primary-800 disabled:opacity-45 disabled:cursor-not-allowed text-white font-medium rounded-full shadow-sm hover:shadow-md disabled:shadow-none transition-all";
const btnBack =
  "inline-flex items-center min-h-touch text-sm font-medium text-secondary-600 hover:text-primary-800 mb-6 transition-colors";
const stepTitle =
  "font-heading text-2xl font-semibold text-primary mb-2 flex items-center";
const inputBase =
  "w-full min-h-touch px-4 py-2.5 rounded-xl border border-silver-300 bg-surface text-ink placeholder:text-silver-500 outline-none transition-all focus:border-secondary focus:shadow-focus";
const fieldLabel = "block text-sm font-medium text-primary-800 mb-1.5";
const selectableCard = (isSelected) => `
  w-full p-5 text-left rounded-2xl transition-all border flex items-center justify-between gap-4 group
  ${isSelected
    ? 'border-primary bg-primary-100 shadow-sm'
    : 'border-primary/10 bg-surface hover:border-primary-300 hover:shadow-md'}
`;

const STEP_LABELS = ['Odontólogo', 'Tipo', 'Fecha', 'Hora', 'Datos', 'Resumen'];

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

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function BookingWizard() {
  const [currentStep, setCurrentStep] = useState(1);

  // Estado de Datos
  const [dentists, setDentists] = useState([]);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [slotsByDate, setSlotsByDate] = useState({});
  const [appointmentTypes, setAppointmentTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Estado de Selección
  const [selectedDentist, setSelectedDentist] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);

  // Estado del Formulario
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '+569',
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
      await fetchDentists();
      await fetchAppointmentTypes();
      setLoading(false);
    };
    init();
  }, []);

  const fetchDentists = async () => {
    try {
      const res = await fetch(`${API_URL}/api/public/dentists`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setDentists(data);
      } else {
        console.error('La respuesta de odontólogos no es un array:', data);
        setDentists([]);
      }
    } catch (err) {
      console.error('Error al obtener la lista de odontólogos:', err);
      setDentists([]);
    }
  };

  const fetchAppointmentTypes = async () => {
    try {
      const res = await fetch(`${API_URL}/api/public/appointment-types`);
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

  const fetchAvailability = async (dentistId) => {
    try {
      const res = await fetch(`${API_URL}/api/public/availability?dentist_id=${dentistId}`);
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

  const handleDentistSelect = async (dentist) => {
    setSelectedDentist(dentist);
    // Limpiar selecciones previas
    setSelectedDate(null);
    setSelectedSlot(null);
    await fetchAvailability(dentist.id);
    handleNextStep();
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
      const res = await fetch(`${API_URL}/api/public/appointments`, {
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
      setCurrentStep(7); // Paso de éxito

      // Recargar disponibilidad en segundo plano
      fetchAvailability(selectedDentist.id);
    } catch (err) {
      setBookingError(err.message);
    } finally {
      setBookingLoading(false);
    }
  };

  // --- RENDERIZADO DE PASOS ---

  // Obtener iniciales de un nombre
  const getInitials = (name) => {
    if (!name) return 'D';
    const cleanName = name.replace(/^(Dr\.|Dra\.)\s+/i, '');
    const parts = cleanName.split(' ');
    const initials = parts.map(p => p[0]).filter(Boolean).slice(0, 2).join('');
    return initials.toUpperCase();
  };

  // PASO 1: Selección de Odontólogo
  const renderStep1Dentist = () => {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h2 className={stepTitle}>
          <User className="w-6 h-6 mr-3 text-secondary shrink-0" />
          Selecciona tu odontólogo
        </h2>
        <p className="text-ink-muted mb-6 text-sm">Todos atienden en el mismo box; la disponibilidad es la real de cada profesional.</p>

        {dentists.length === 0 ? (
          <div className="text-center p-8 bg-silver-200 rounded-2xl">
            <p className="text-ink-muted font-medium">No hay odontólogos registrados actualmente en el sistema.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {dentists.map(dentist => {
              const isSelected = selectedDentist?.id === dentist.id;
              const initials = getInitials(dentist.full_name);
              return (
                <button
                  key={dentist.id}
                  type="button"
                  onClick={() => handleDentistSelect(dentist)}
                  className={selectableCard(isSelected)}
                >
                  <div className="flex items-center gap-4">
                    {/* Avatar o Logo */}
                    {dentist.logo_url ? (
                      <img
                        src={dentist.logo_url}
                        alt={dentist.full_name}
                        className="w-14 h-14 rounded-full object-cover border border-primary-200 shadow-sm"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-primary-100 text-primary border border-primary-200 font-heading font-semibold flex items-center justify-center text-lg">
                        {initials}
                      </div>
                    )}
                    <div>
                      <span className="font-heading font-semibold text-lg text-ink block group-hover:text-primary transition-colors leading-tight">
                        {dentist.full_name}
                      </span>
                      <span className="text-[11px] text-ink-subtle font-semibold tracking-[0.08em] uppercase mt-1 block">
                        Cirujano Dentista
                      </span>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all shrink-0 ${isSelected ? 'border-primary bg-primary text-white' : 'border-silver-400'}`}>
                    {isSelected && <span className="w-2 h-2 bg-white rounded-full" />}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // PASO 2: Selección de Tipo de Cita
  const renderStep2Type = () => {
    return (
      <div className="animate-in fade-in slide-in-from-right-8 duration-500">
        <button onClick={handlePrevStep} className={btnBack}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver a odontólogos
        </button>

        <h2 className={stepTitle}>
          <CalendarIcon className="w-6 h-6 mr-3 text-secondary shrink-0" />
          Selecciona el tipo de cita
        </h2>
        <p className="text-ink-muted mb-6 text-sm">La duración se reserva completa en la agenda del box.</p>

        <div className="space-y-3">
          {appointmentTypes.map(type => {
            const isSelected = selectedType?.id === type.id;
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => setSelectedType(type)}
                className={`${selectableCard(isSelected)} flex-col md:flex-row md:items-center`}
              >
                <div>
                  <span className="font-heading font-semibold text-lg text-ink block">{type.name}</span>
                  {type.requires_double_slot && (
                    <p className="text-xs text-secondary-600 font-medium mt-1">
                      * Requiere 2 bloques horarios consecutivos
                    </p>
                  )}
                </div>
                <span className="text-sm font-medium px-3 py-1 bg-primary-100 text-primary-800 rounded-full whitespace-nowrap self-start md:self-auto tabular-nums">
                  {type.duration_minutes} min
                </span>
              </button>
            );
          })}
        </div>

        <button onClick={handleNextStep} disabled={!selectedType} className={`${btnPrimary} mt-8`}>
          Continuar
        </button>
      </div>
    );
  };

  // PASO 3: Selección de Fecha (Calendario)
  const renderStep3Calendar = () => {
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
              min-h-touch p-2 sm:p-3 flex flex-col items-center justify-center rounded-xl transition-colors border tabular-nums
              ${isDisabled
                ? 'text-silver-400 cursor-not-allowed border-transparent'
                : isSelected
                  ? 'bg-primary text-white border-primary font-semibold shadow-sm'
                  : 'bg-surface text-ink border-primary/10 hover:border-secondary hover:bg-primary-100'}
            `}
          >
            <span className="text-base">{format(cloneDay, 'd')}</span>
            {!isDisabled && !isSelected && (
              <span className="w-1.5 h-1.5 bg-secondary rounded-full mt-1" />
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
        <button onClick={handlePrevStep} className={btnBack}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver a tipo de cita
        </button>

        <h2 className={stepTitle}>
          <CalendarIcon className="w-6 h-6 mr-3 text-secondary shrink-0" />
          Elige una fecha
        </h2>
        <p className="text-ink-muted mb-6 text-sm">
          Días con horas libres para <strong className="text-ink font-medium">{selectedType?.name}</strong> con {selectedDentist?.full_name}
        </p>

        <div className="bg-background p-5 rounded-3xl border border-primary/10">
          <div className="flex justify-between items-center mb-5">
            <button
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              aria-label="Mes anterior"
              className="w-10 h-10 grid place-items-center bg-surface rounded-full shadow-sm hover:bg-primary-100 transition-colors border border-primary/10 text-primary"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h3 className="font-heading text-lg font-semibold text-primary capitalize">
              {format(currentMonth, 'MMMM yyyy', { locale: es })}
            </h3>
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              aria-label="Mes siguiente"
              className="w-10 h-10 grid place-items-center bg-surface rounded-full shadow-sm hover:bg-primary-100 transition-colors border border-primary/10 text-primary"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-2 mb-3">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(dayName => (
              <div key={dayName} className="text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-subtle">
                {dayName}
              </div>
            ))}
          </div>

          {rows}
        </div>
      </div>
    );
  };

  // PASO 4: Selección de Horario
  const renderStep4Slots = () => {
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    const allSlots = slotsByDate[dateKey] || [];
    const validSlots = getValidSlotsForDate(dateKey, selectedType);
    const validIds = new Set(validSlots.map(s => s.id));

    return (
      <div className="animate-in fade-in slide-in-from-right-8 duration-500">
        <button onClick={handlePrevStep} className={btnBack}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver al calendario
        </button>

        <h2 className={stepTitle}>
          <Clock className="w-6 h-6 mr-3 text-secondary shrink-0" />
          Horarios disponibles
        </h2>
        <p className="text-ink-muted mb-6 text-sm first-letter:uppercase">
          {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })} · {selectedDentist?.full_name}
        </p>

        {selectedType?.requires_double_slot && (
          <div className="p-4 bg-secondary-100 border border-secondary-200 rounded-2xl mb-6 text-sm text-secondary-800">
            <strong className="font-semibold">Nota:</strong> los horarios habilitados garantizan dos bloques consecutivos para este tipo de cita. Los que no alcanzan aparecen tachados.
          </div>
        )}

        {allSlots.length === 0 ? (
          <div className="text-center p-8 bg-silver-200 rounded-2xl">
            <p className="text-ink-muted">No hay horarios disponibles para este día, por favor regresa y elige otra fecha.</p>
          </div>
        ) : (
          <>
            {/* El box es compartido: los bloques que no sirven se muestran
                deshabilitados, nunca se esconden (regla del sistema). */}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              {allSlots.map(slot => {
                const isUsable = validIds.has(slot.id);
                const isSelected = selectedSlot?.id === slot.id;
                return (
                  <button
                    key={slot.id}
                    disabled={!isUsable}
                    onClick={() => {
                      setSelectedSlot(slot);
                      handleNextStep();
                    }}
                    className={`
                      min-h-touch py-2.5 rounded-xl font-medium text-sm tabular-nums transition-colors border
                      ${!isUsable
                        ? 'bg-silver-200 border-transparent text-silver-500 line-through cursor-not-allowed'
                        : isSelected
                          ? 'bg-primary border-primary text-white'
                          : 'bg-surface border-primary-200 text-primary hover:border-secondary hover:bg-primary-100'}
                    `}
                  >
                    {slot.start_time.substring(0, 5)}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-ink-subtle mt-4">Los horarios tachados ya están tomados o no alcanzan para la duración de esta prestación.</p>
          </>
        )}
      </div>
    );
  };

  // PASO 5: Datos del Paciente
  const renderStep5Form = () => {
    return (
      <div className="animate-in fade-in slide-in-from-right-8 duration-500">
        <button onClick={handlePrevStep} className={btnBack}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver a horarios
        </button>

        <h2 className={stepTitle}>
          <User className="w-6 h-6 mr-3 text-secondary shrink-0" />
          Ingresa tus datos
        </h2>
        <p className="text-ink-muted mb-6 text-sm">Completa tus datos de contacto.</p>

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
            <label className={fieldLabel}>Nombre completo</label>
            <input
              type="text" required
              value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
              className={inputBase}
              placeholder="Ej. Juan Pérez"
            />
          </div>

          <div>
            <label className={fieldLabel}>RUT</label>
            <input
              type="text" required
              value={formData.rut} onChange={handleRutChange}
              aria-invalid={!!rutError}
              className={`${inputBase} tabular-nums ${rutError ? 'border-danger focus:border-danger focus:shadow-none' : ''}`}
              placeholder="Ej. 12.345.678-5"
            />
            {rutError ? (
              <p className="text-xs text-danger mt-1.5 font-medium">{rutError}</p>
            ) : (
              <p className="text-xs text-ink-subtle mt-1.5">Formato: XX.XXX.XXX-X (con puntos y guión)</p>
            )}
          </div>

          <div>
            <label className={fieldLabel}>Correo electrónico</label>
            <input
              type="email" required
              value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })}
              className={inputBase}
              placeholder="ejemplo@correo.com"
            />
          </div>

          <div>
            <label className={fieldLabel}>Teléfono (celular)</label>
            <input
              type="tel" required
              pattern="^\+56[0-9]{9}$"
              title="Debe tener el formato +56 seguido de 9 dígitos"
              value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })}
              className={`${inputBase} tabular-nums`}
            />
            <p className="text-xs text-ink-subtle mt-1.5">Formato: +56912345678</p>
          </div>

          <div>
            <label className={fieldLabel}>Motivo de consulta</label>
            <select
              value={formData.reason} onChange={e => setFormData({ ...formData, reason: e.target.value })}
              className={inputBase}
            >
              <option value="Consulta">Consulta General</option>
              <option value="Limpieza">Limpieza Dental</option>
              <option value="Urgencia">Urgencia</option>
              <option value="Control">Control</option>
              <option value="Otro">Otro</option>
            </select>
          </div>

          <button type="submit" className={`${btnPrimary} mt-2`}>
            Continuar al resumen
          </button>
        </form>
      </div>
    );
  };

  // PASO 6: Resumen y Confirmación
  const renderStep6Confirm = () => {
    return (
      <div className="animate-in fade-in slide-in-from-right-8 duration-500">
        <button onClick={handlePrevStep} className={btnBack} disabled={bookingLoading}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver a mis datos
        </button>

        <h2 className={stepTitle}>
          <CheckCircle className="w-6 h-6 mr-3 text-secondary shrink-0" />
          Resumen de la cita
        </h2>
        <p className="text-ink-muted mb-6 text-sm">Revisa los datos antes de confirmar.</p>

        <div className="bg-background border border-primary/10 rounded-3xl p-6 mb-8 space-y-4">
          <div className="pb-4 border-b border-primary/10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">Odontólogo</p>
            <p className="font-heading text-lg font-semibold text-ink mt-0.5">{selectedDentist?.full_name}</p>
          </div>

          <div className="pb-4 border-b border-primary/10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">Cuándo</p>
            <p className="font-heading text-lg font-semibold text-ink capitalize mt-0.5">
              {format(selectedDate, "EEEE d 'de' MMMM, yyyy", { locale: es })}
            </p>
            <p className="font-heading text-2xl font-semibold text-primary mt-1 tabular-nums">{selectedSlot?.start_time.substring(0, 5)} hrs</p>
          </div>

          <div className="pt-1 space-y-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">Tipo de consulta</p>
              <p className="font-medium text-ink">{selectedType?.name} <span className="tabular-nums text-ink-muted">({selectedType?.duration_minutes} min)</span></p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">Paciente</p>
              <p className="font-medium text-ink">{formData.name} <span className="tabular-nums text-ink-muted">(RUT: {formData.rut})</span></p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">Contacto</p>
              <p className="text-ink">{formData.email} • <span className="tabular-nums">{formData.phone}</span></p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">Motivo</p>
              <p className="text-ink">{formData.reason}</p>
            </div>
          </div>
        </div>

        {bookingError && (
          <div className="bg-danger-100 text-danger-700 p-4 rounded-2xl mb-6 border border-danger/20 flex items-start gap-2">
            <ShieldAlert className="w-5 h-5 text-danger shrink-0 mt-0.5" />
            <div className="text-sm">{bookingError}</div>
          </div>
        )}

        {/* La acción principal es azul marino, no verde: el verde es un estado, no un botón. */}
        <button onClick={submitBooking} disabled={bookingLoading} className={btnPrimary}>
          {bookingLoading ? 'Confirmando...' : 'Confirmar agendamiento'}
        </button>
      </div>
    );
  };

  // RENDER ÉXITO (PASO 7)
  const renderSuccess = () => {
    return (
      <div className="text-center animate-in zoom-in-95 duration-500 py-10">
        <div className="w-20 h-20 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-success" />
        </div>
        <h2 className="font-heading text-3xl font-semibold text-primary mb-4">Cita confirmada</h2>
        <p className="text-ink-muted max-w-md mx-auto mb-8">
          Te enviamos un correo a <span className="font-medium text-ink">{formData.email}</span> con los detalles.
          Te esperamos el <span className="font-medium text-ink capitalize">{format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}</span> a las <span className="font-medium text-ink tabular-nums">{selectedSlot?.start_time.substring(0, 5)}</span> con {selectedDentist?.full_name}.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="min-h-touch text-secondary-600 font-medium hover:text-primary-800 hover:underline underline-offset-4 transition-colors"
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
        <h1 className="font-heading text-5xl font-semibold text-primary tracking-tight">Mattodonto</h1>
        <p className="text-ink-muted mt-3 text-lg">Agenda tu hora dental de forma rápida y sencilla.</p>
      </div>

      {/* Stepper — con etiqueta por paso (se oculta en el paso de éxito) */}
      {currentStep < 7 && (
        <nav aria-label="Progreso de la reserva" className="flex items-center gap-1.5 mb-10 max-w-2xl mx-auto">
          {STEP_LABELS.map((label, i) => {
            const step = i + 1;
            const isDone = currentStep > step;
            const isCurrent = currentStep === step;
            return (
              <React.Fragment key={label}>
                {i > 0 && <span className="flex-1 h-0.5 bg-primary/10 rounded-full" />}
                <span
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`flex items-center gap-2 text-xs ${isCurrent ? 'text-primary font-medium' : 'text-ink-subtle'}`}
                >
                  <span className={`
                    w-7 h-7 shrink-0 grid place-items-center rounded-full text-xs font-semibold tabular-nums transition-colors
                    ${isCurrent ? 'bg-primary text-white' : isDone ? 'bg-primary-200 text-primary' : 'bg-silver-200 text-ink-subtle'}
                  `}>
                    {step}
                  </span>
                  <span className={isCurrent ? 'inline' : 'hidden lg:inline'}>{label}</span>
                </span>
              </React.Fragment>
            );
          })}
        </nav>
      )}

      {/* Contenedor del Contenido de los Pasos */}
      <div className="bg-surface rounded-3xl shadow-lg p-6 sm:p-10 border border-primary/10">
        {loading ? (
          <div className="py-20 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-ink-muted">Cargando disponibilidad y opciones...</p>
          </div>
        ) : (
          <>
            {currentStep === 1 && renderStep1Dentist()}
            {currentStep === 2 && renderStep2Type()}
            {currentStep === 3 && renderStep3Calendar()}
            {currentStep === 4 && renderStep4Slots()}
            {currentStep === 5 && renderStep5Form()}
            {currentStep === 6 && renderStep6Confirm()}
            {currentStep === 7 && renderSuccess()}
          </>
        )}
      </div>
    </div>
  );
}
