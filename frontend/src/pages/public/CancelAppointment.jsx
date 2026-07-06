import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertCircle, CheckCircle, CalendarX, Loader2, Search } from 'lucide-react';

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

export default function CancelAppointment() {
  const { token } = useParams();
  
  const [loading, setLoading] = useState(!!token);
  const [canceling, setCanceling] = useState(false);
  const [appointment, setAppointment] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Estados para cancelación por RUT + Email
  const [rut, setRut] = useState('');
  const [email, setEmail] = useState('');
  const [rutFormError, setRutFormError] = useState(null);
  const [multipleAppointments, setMultipleAppointments] = useState([]);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState('');
  const [cancelingRut, setCancelingRut] = useState(false);
  const [showRutForm, setShowRutForm] = useState(!token);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetchAppointment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const fetchAppointment = async () => {
    try {
      const res = await fetch(`http://localhost:3001/api/public/appointments/cancel/${token}`);
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Error al obtener la cita');
      }

      if (data.status === 'cancelled') {
        throw new Error('Esta cita ya fue cancelada anteriormente.');
      }

      setAppointment(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setCanceling(true);
    setError(null);
    try {
      const res = await fetch(`http://localhost:3001/api/public/appointments/cancel/${token}`, {
        method: 'POST'
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al intentar cancelar la cita');
      }

      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setCanceling(false);
    }
  };

  // Buscar citas activas por RUT y Email
  const handleRutSearch = async (e) => {
    e.preventDefault();
    setRutFormError(null);
    setError(null);
    setMultipleAppointments([]);
    setSelectedAppointmentId('');
    
    if (!validateChileanRut(rut)) {
      setRutFormError('El RUT ingresado no es válido.');
      return;
    }

    setCancelingRut(true);
    try {
      const res = await fetch('http://localhost:3001/api/public/appointments/cancel-by-rut', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rut, email })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Ocurrió un error al buscar la cita.');
      }

      if (data.multiple) {
        setMultipleAppointments(data.appointments);
        if (data.appointments.length > 0) {
          setSelectedAppointmentId(data.appointments[0].id);
        }
      } else {
        setSuccess(true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelingRut(false);
    }
  };

  // Cancelar la cita seleccionada del listado múltiple
  const handleRutCancelSpecific = async () => {
    setError(null);
    setCancelingRut(true);
    try {
      const res = await fetch('http://localhost:3001/api/public/appointments/cancel-specific', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointment_id: selectedAppointmentId,
          rut,
          email
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al intentar cancelar la cita.');
      }

      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelingRut(false);
    }
  };

  const handleRutChange = (e) => {
    setRut(formatRut(e.target.value));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="flex flex-col items-center space-y-4 text-gray-500">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
          <p>Verificando enlace...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center border border-gray-100 animate-in zoom-in-95 duration-500">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Cita Cancelada</h2>
          <p className="text-gray-600 mb-8">
            Hemos liberado tu horario correctamente. El odontólogo ha sido notificado.
          </p>
          <Link to="/" className="inline-flex flex-col text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors">
            Volver a agendar
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white p-6 sm:p-10 rounded-3xl shadow-xl max-w-lg w-full border border-gray-100 relative overflow-hidden">
        
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <CalendarX className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Cancelar Cita</h1>
          <p className="text-gray-500 mt-2">Gestión y anulación de citas médicas en Mattodonto.</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-xl mb-6 flex items-start border border-red-100 text-sm">
            <AlertCircle className="w-5 h-5 mr-3 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Flujo 1: Cancelación por Token (si viene en la URL) */}
        {token && appointment && !error && !showRutForm && (
          <div className="space-y-6">
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 space-y-3">
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Paciente</p>
                <p className="font-semibold text-gray-900">{appointment.patient_name}</p>
              </div>
              {appointment.date && appointment.start_time && (
                <div>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Fecha y Hora</p>
                  <p className="font-semibold text-gray-900 capitalize">
                    {format(parseISO(appointment.date), "EEEE d 'de' MMMM", { locale: es })}
                    <span className="font-bold text-blue-600 ml-2">
                      {appointment.start_time.substring(0, 5)} hrs
                    </span>
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link to="/" className="w-full sm:w-1/2 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-all text-center">
                No, mantener cita
              </Link>
              <button 
                onClick={handleCancel}
                disabled={canceling}
                className={`
                  w-full sm:w-1/2 py-3 text-white font-bold rounded-xl shadow-lg transition-all
                  ${canceling ? 'bg-red-300 cursor-not-allowed shadow-none' : 'bg-red-600 hover:bg-red-700 hover:-translate-y-0.5 shadow-red-200'}
                `}
              >
                {canceling ? 'Procesando...' : 'Sí, cancelar cita'}
              </button>
            </div>

            <div className="pt-4 border-t border-gray-100 text-center">
              <button 
                onClick={() => setShowRutForm(true)} 
                className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                ¿No tienes tu link de cancelación? Anula con tu RUT y email
              </button>
            </div>
          </div>
        )}

        {/* Flujo 2: Cancelación por RUT + Email (si no hay token, falló, o hicieron clic en el enlace) */}
        {((!token || !appointment || error || showRutForm) && multipleAppointments.length === 0) && (
          <div className="space-y-6">
            <div className="border-b border-gray-100 pb-4 mb-4 text-center">
              <p className="text-sm text-gray-600">Ingresa tus datos para buscar y anular tus citas pendientes.</p>
            </div>

            <form onSubmit={handleRutSearch} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">RUT del Paciente</label>
                <input 
                  type="text" required
                  value={rut} onChange={handleRutChange}
                  className={`w-full px-4 py-3 rounded-xl border ${rutFormError ? 'border-red-500 focus:ring-red-500' : 'border-gray-200 focus:ring-blue-500'} focus:ring-2 focus:border-transparent transition-all outline-none`} 
                  placeholder="Ej. 12.345.678-5"
                />
                {rutFormError && (
                  <p className="text-xs text-red-600 mt-1 font-medium">{rutFormError}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico</label>
                <input 
                  type="email" required
                  value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" 
                  placeholder="ejemplo@correo.com"
                />
              </div>

              <button 
                type="submit"
                disabled={cancelingRut}
                className={`w-full py-4 text-white font-bold rounded-xl shadow-lg transition-all mt-4 flex items-center justify-center space-x-2 ${
                  cancelingRut ? 'bg-blue-400 cursor-not-allowed shadow-none' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
                }`}
              >
                {cancelingRut ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Buscando...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    <span>Buscar Cita</span>
                  </>
                )}
              </button>
            </form>

            {token && appointment && (
              <div className="pt-2 text-center">
                <button 
                  onClick={() => { setShowRutForm(false); setError(null); }} 
                  className="text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Volver al flujo de cancelación por link
                </button>
              </div>
            )}
          </div>
        )}

        {/* Listado de Citas Múltiples encontradas por RUT + Email */}
        {multipleAppointments.length > 0 && (
          <div className="space-y-6">
            <div className="border-b border-gray-100 pb-4 text-center">
              <p className="text-sm text-gray-600">Encontramos múltiples citas activas. Selecciona cuál deseas cancelar:</p>
            </div>

            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {multipleAppointments.map((appt) => (
                <label 
                  key={appt.id} 
                  className={`flex items-start p-4 rounded-xl border cursor-pointer transition-all ${
                    selectedAppointmentId === appt.id 
                      ? 'border-blue-500 bg-blue-50/50 shadow-sm' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input 
                    type="radio" 
                    name="selected_appt" 
                    value={appt.id}
                    checked={selectedAppointmentId === appt.id}
                    onChange={() => setSelectedAppointmentId(appt.id)}
                    className="mt-1.5 mr-3 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="text-sm">
                    <p className="font-bold text-gray-900 capitalize">
                      {format(parseISO(appt.date), "EEEE d 'de' MMMM, yyyy", { locale: es })}
                    </p>
                    <p className="text-blue-600 font-bold mt-0.5">{appt.start_time.substring(0, 5)} hrs</p>
                    <p className="text-xs text-gray-500 mt-1 font-medium">Tipo: {appt.appointment_type}</p>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button 
                onClick={() => { setMultipleAppointments([]); setSelectedAppointmentId(''); setError(null); }}
                className="w-full sm:w-1/2 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-all text-center"
              >
                Volver a buscar
              </button>
              <button 
                onClick={handleRutCancelSpecific}
                disabled={cancelingRut}
                className={`
                  w-full sm:w-1/2 py-3 text-white font-bold rounded-xl shadow-lg transition-all
                  ${cancelingRut ? 'bg-red-300 cursor-not-allowed shadow-none' : 'bg-red-600 hover:bg-red-700 hover:-translate-y-0.5 shadow-red-200'}
                `}
              >
                {cancelingRut ? 'Cancelando...' : 'Confirmar Cancelación'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
