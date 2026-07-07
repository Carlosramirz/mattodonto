import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  ArrowLeft, Edit, Save, Trash2, User, Phone, Mail, 
  MapPin, Calendar, Heart, Shield, Loader2, AlertCircle, 
  CheckCircle, Plus, ChevronDown, ChevronUp, BookOpen, X
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

// Palabras de alerta para la anamnesis
const ALERT_KEYWORDS = [
  'alérgico', 'alergia', 'diabetes', 'diabético', 
  'hipertensión', 'hipertenso', 'anticoagulante', 
  'embarazo', 'embarazada', 'asma', 'epilepsia', 'marcapasos'
];

// Helper para normalizar caracteres removiendo acentos y pasando a minúscula
function normalizeNFD(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Genera una expresión regular insensible a acentos/tildes para las palabras clave
function getAccentInsensitiveRegex(words) {
  const vowelMap = {
    'a': '[aáàäâ]',
    'e': '[eéèëê]',
    'i': '[iíìïî]',
    'o': '[oóòöô]',
    'u': '[uúùüû]',
    'n': '[nñ]'
  };

  const patterns = words.map(word => {
    const normalized = normalizeNFD(word);
    return Array.from(normalized).map(char => vowelMap[char] || char).join('');
  });

  return new RegExp(`(${patterns.join('|')})`, 'gi');
}

// Función auxiliar para formatear RUT chileno
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

export default function PatientDetails() {
  const { id } = useParams();
  const { apiFetch, role } = useAuth();
  const navigate = useNavigate();

  const isAssistant = role === 'assistant';

  // Estados del paciente
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // Estado del Formulario del Paciente
  const [formData, setFormData] = useState({
    full_name: '',
    rut: '',
    phone: '',
    email: '',
    address: '',
    birth_date: '',
    sex: '',
    gender_identity: '',
    prevision: '',
    prevision_detail: ''
  });
  const [rutError, setRutError] = useState(null);

  // Estados del Catálogo de Alertas Médicas (solo clínico)
  const [alertsCatalog, setAlertsCatalog] = useState([]);
  const [newAlertText, setNewAlertText] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  
  // Alertas con peticiones PUT en curso (optimistic locks)
  const [pendingAlerts, setPendingAlerts] = useState([]);

  // Estados del Historial Clínico (solo clínico)
  const [records, setRecords] = useState([]);
  const [catalog, setCatalog] = useState({});
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [expandedRecordId, setExpandedRecordId] = useState(null);
  
  // Estados de Modal de Sesión (Crear/Editar)
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [recordFormLoading, setRecordFormLoading] = useState(false);
  const [recordFormError, setRecordFormError] = useState(null);
  
  const [recordForm, setRecordForm] = useState({
    session_date: new Date().toISOString().split('T')[0],
    chief_complaint: '',
    anamnesis: '',
    exploration: '',
    diagnosis: '',
    diagnosis_codes: [],
    procedure_performed: ''
  });

  // Estados de Alertas médicas integradas en la Anamnesis
  const [showInlineAlertForm, setShowInlineAlertForm] = useState(false);
  const [inlineAlertText, setInlineAlertText] = useState('');
  const [confirmDeselectAlert, setConfirmDeselectAlert] = useState(null);

  useEffect(() => {
    fetchPatientDetails();
    if (!isAssistant) {
      fetchRecords();
      fetchCatalog();
      fetchAlertsCatalog();
    } else {
      setRecordsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, role]);

  const fetchPatientDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/dentist/patients/${id}`);
      const data = await res.json();
      if (res.ok) {
        setPatient(data);
        setFormData({
          full_name: data.full_name || '',
          rut: data.rut || '',
          phone: data.phone || '',
          email: data.email || '',
          address: data.address || '',
          birth_date: data.birth_date || '',
          sex: data.sex || 'Masculino',
          gender_identity: data.gender_identity || '',
          prevision: data.prevision || 'Particular',
          prevision_detail: data.prevision_detail || ''
        });
      } else {
        setError(data.error || 'Error al obtener los datos del paciente.');
      }
    } catch (err) {
      console.error('Error en fetchPatientDetails:', err);
      setError('Error al conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  const fetchRecords = async () => {
    setRecordsLoading(true);
    try {
      const res = await apiFetch(`/api/dentist/patients/${id}/records`);
      const data = await res.json();
      if (res.ok) {
        setRecords(data || []);
      } else {
        console.error('Error al obtener registros clínicos:', data.error);
      }
    } catch (err) {
      console.error('Error en fetchRecords:', err);
    } finally {
      setRecordsLoading(false);
    }
  };

  const fetchCatalog = async () => {
    try {
      const res = await apiFetch('/api/dentist/diagnosis-catalog');
      const data = await res.json();
      if (res.ok) {
        setCatalog(data || {});
      } else {
        console.error('Error al obtener catálogo de diagnósticos:', data.error);
      }
    } catch (err) {
      console.error('Error en fetchCatalog:', err);
    }
  };

  const fetchAlertsCatalog = async () => {
    try {
      const res = await apiFetch('/api/dentist/medical-alerts-catalog');
      const data = await res.json();
      if (res.ok) {
        setAlertsCatalog(data || []);
      } else {
        console.error('Error al obtener catálogo de alertas:', data.error);
      }
    } catch (err) {
      console.error('Error en fetchAlertsCatalog:', err);
    }
  };

  const handleRutChange = (e) => {
    const formatted = formatRut(e.target.value);
    setFormData({ ...formData, rut: formatted });
    setRutError(null);
  };

  // Guardar cambios en los datos generales del paciente
  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setError(null);
    setRutError(null);
    setSaveSuccess(false);

    // Validar RUT
    if (!validateChileanRut(formData.rut)) {
      setRutError('El RUT ingresado no es válido. Verifica e intenta nuevamente.');
      return;
    }

    setSaveLoading(true);
    try {
      const res = await apiFetch(`/api/dentist/patients/${id}`, {
        method: 'PUT',
        body: JSON.stringify(formData)
      });
      const data = await res.json();

      if (res.ok) {
        setPatient(data);
        setIsEditing(false);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setError(data.error || 'Error al actualizar los datos del paciente.');
      }
    } catch (err) {
      console.error('Error al editar paciente:', err);
      setError('Ocurrió un error en el servidor al intentar actualizar los datos.');
    } finally {
      setSaveLoading(false);
    }
  };

  // Función de actualización optimista con reversión quirúrgica
  const updatePatientAlertsOptimistic = async (alertAffected, isAdding) => {
    if (isAssistant) return; // Asistente no tiene permitido editar alertas médicas
    if (pendingAlerts.includes(alertAffected)) return;

    // Agregar a pendientes
    setPendingAlerts(prev => [...prev, alertAffected]);

    // Calcular el listado esperado de alertas
    const currentSnapshot = patient?.medical_alerts || [];
    const calculatedAlerts = isAdding
      ? [...currentSnapshot.filter(a => normalizeNFD(a) !== normalizeNFD(alertAffected)), alertAffected]
      : currentSnapshot.filter(a => a !== alertAffected);

    // Actualizar estado local inmediatamente
    setPatient(prev => ({
      ...prev,
      medical_alerts: calculatedAlerts
    }));

    try {
      // Ejecutar PUT en segundo plano al endpoint específico de alertas médicas
      const res = await apiFetch(`/api/dentist/patients/${id}/medical-alerts`, {
        method: 'PUT',
        body: JSON.stringify({
          medical_alerts: calculatedAlerts
        })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al actualizar las alertas médicas.');
      }

      // Éxito: solo sacamos de pendientes
    } catch (err) {
      console.error('Error al actualizar alertas:', err);

      // Reversión quirúrgica sobre el estado actual en caso de fallo
      setPatient(prev => {
        const current = prev.medical_alerts || [];
        let revertedAlerts;
        if (isAdding) {
          revertedAlerts = current.filter(a => a !== alertAffected);
        } else {
          const exists = current.some(a => normalizeNFD(a) === normalizeNFD(alertAffected));
          revertedAlerts = exists ? current : [...current, alertAffected];
        }
        return { ...prev, medical_alerts: revertedAlerts };
      });

      alert('No se pudo guardar la alerta, intenta de nuevo');
    } finally {
      setPendingAlerts(prev => prev.filter(a => a !== alertAffected));
    }
  };

  // Agregar Alerta Médica permanente
  const handleAddAlert = async (alertText) => {
    if (isAssistant) return;
    const trimmed = alertText.trim();
    if (!trimmed) return;

    // Validación rápida de duplicado local
    const currentAlerts = patient?.medical_alerts || [];
    const exists = currentAlerts.some(a => normalizeNFD(a) === normalizeNFD(trimmed));
    if (exists) {
      setNewAlertText('');
      setInlineAlertText('');
      return;
    }

    setNewAlertText('');
    setInlineAlertText('');
    await updatePatientAlertsOptimistic(trimmed, true);
  };

  // Remover Alerta Médica permanente
  const handleRemoveAlert = async (alertToRemove) => {
    if (isAssistant) return;
    await updatePatientAlertsOptimistic(alertToRemove, false);
  };

  // Determinar si una alerta es personalizada (no existe en el catálogo)
  const isCustomAlert = (alertName) => {
    return !alertsCatalog.some(
      c => normalizeNFD(c.name) === normalizeNFD(alertName)
    );
  };

  // Toggle de Alertas de Riesgo en la Anamnesis (marcar/desmarcar)
  const handleToggleRiskAlert = (alertName, isCurrentlySelected) => {
    if (isAssistant) return;
    if (pendingAlerts.includes(alertName)) return;

    if (isCurrentlySelected) {
      setConfirmDeselectAlert(alertName);
    } else {
      handleAddAlert(alertName);
    }
  };

  // Filtrado de catálogo para la búsqueda autocompletable
  const normSearch = normalizeNFD(newAlertText);
  const filteredCatalog = alertsCatalog.filter(item => {
    const alreadySelected = (patient?.medical_alerts || []).some(
      a => normalizeNFD(a) === normalizeNFD(item.name)
    );
    if (alreadySelected) return false;

    if (!newAlertText) return true;
    return normalizeNFD(item.name).includes(normSearch);
  });

  const exactMatch = alertsCatalog.some(
    item => normalizeNFD(item.name) === normSearch
  );
  const showCustomOption = newAlertText.trim() !== '' && !exactMatch;
  const totalDropdownItems = filteredCatalog.length + (showCustomOption ? 1 : 0);

  // Manejo de eventos del teclado en el combobox
  const handleKeyDown = (e) => {
    if (!showDropdown) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setShowDropdown(true);
        setFocusedIndex(0);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(prev => (prev + 1) % totalDropdownItems);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex(prev => (prev - 1 + totalDropdownItems) % totalDropdownItems);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < totalDropdownItems) {
        if (focusedIndex < filteredCatalog.length) {
          handleAddAlert(filteredCatalog[focusedIndex].name);
        } else if (showCustomOption) {
          handleAddAlert(newAlertText);
        }
        setShowDropdown(false);
        setNewAlertText('');
        setFocusedIndex(-1);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowDropdown(false);
      setFocusedIndex(-1);
    }
  };

  // Destacar palabras clave tolerando tildes y mayúsculas
  const highlightKeywords = (text) => {
    if (!text) return 'Sin anamnesis registrada.';
    const regex = getAccentInsensitiveRegex(ALERT_KEYWORDS);
    const normalizedKeywords = ALERT_KEYWORDS.map(kw => normalizeNFD(kw));
    
    return text.split(regex).map((part, i) => {
      const normPart = normalizeNFD(part);
      const isMatch = normalizedKeywords.includes(normPart);
      
      return isMatch ? (
        <mark key={i} className="bg-yellow-200 px-1 rounded font-semibold text-gray-900">
          {part}
        </mark>
      ) : (
        part
      );
    });
  };

  const handleBackNavigation = () => {
    navigate('/dentist/patients');
  };

  // Abrir modal de nueva sesión clínica
  const openNewRecordModal = () => {
    setEditingRecord(null);
    setRecordForm({
      session_date: new Date().toISOString().split('T')[0],
      chief_complaint: '',
      anamnesis: '',
      exploration: '',
      diagnosis: '',
      diagnosis_codes: [],
      procedure_performed: ''
    });
    setRecordFormError(null);
    setShowRecordModal(true);
  };

  // Abrir modal de edición de sesión clínica existente
  const openEditRecordModal = (record) => {
    setEditingRecord(record);
    setRecordForm({
      session_date: record.session_date || new Date().toISOString().split('T')[0],
      chief_complaint: record.chief_complaint || '',
      anamnesis: record.anamnesis || '',
      exploration: record.exploration || '',
      diagnosis: record.diagnosis || '',
      diagnosis_codes: record.diagnosis_codes || [],
      procedure_performed: record.procedure_performed || ''
    });
    setRecordFormError(null);
    setShowRecordModal(true);
  };

  // Enviar formulario de sesión clínica (crear o editar)
  const handleRecordFormSubmit = async (e) => {
    e.preventDefault();
    setRecordFormLoading(true);
    setRecordFormError(null);

    try {
      const url = editingRecord
        ? `/api/dentist/patients/${id}/records/${editingRecord.id}`
        : `/api/dentist/patients/${id}/records`;
      const method = editingRecord ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(recordForm)
      });
      const data = await res.json();

      if (res.ok) {
        setShowRecordModal(false);
        setEditingRecord(null);
        await fetchRecords();
      } else {
        setRecordFormError(data.error || 'Error al guardar la sesión clínica.');
      }
    } catch (err) {
      console.error('Error en handleRecordFormSubmit:', err);
      setRecordFormError('Error al conectar con el servidor.');
    } finally {
      setRecordFormLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6 flex flex-col items-center justify-center min-h-[400px] text-gray-500">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
        <p className="font-medium">Cargando ficha del paciente...</p>
      </div>
    );
  }

  if (error && !patient) {
    return (
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <button onClick={handleBackNavigation} className="flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver a pacientes
        </button>
        <div className="bg-red-50 text-red-700 p-6 rounded-3xl border border-red-100 flex items-start">
          <AlertCircle className="w-6 h-6 mr-4 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-lg">Error</h3>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Barra de Retorno y Notificaciones */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <button 
          onClick={handleBackNavigation} 
          className="flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
          disabled={saveLoading}
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver a pacientes
        </button>
        
        {saveSuccess && (
          <div className="bg-green-50 text-green-700 px-4 py-2 rounded-xl flex items-center text-sm border border-green-100 animate-in fade-in duration-300">
            <CheckCircle className="w-4 h-4 mr-2" />
            <span>Cambios guardados con éxito.</span>
          </div>
        )}
      </div>

      {/* Banner Rojo de Alertas Médicas (Si existen y no es asistente) */}
      {!isAssistant && patient && patient.medical_alerts && patient.medical_alerts.length > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-2xl flex items-start text-red-800 shadow-sm animate-in slide-in-from-top duration-300">
          <AlertCircle className="w-5 h-5 mr-3 text-red-600 shrink-0 mt-0.5" />
          <span className="font-bold text-sm">
            ⚠ Alertas Médicas: {patient.medical_alerts.join(', ')}
          </span>
        </div>
      )}

      {/* Tarjeta Principal Ficha */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Banner Superior */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 sm:p-8 text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/20 shrink-0">
              <User className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{patient.full_name}</h1>
              <p className="text-blue-100 text-sm mt-1 font-mono">RUT: {patient.rut}</p>
            </div>
          </div>
          
          {!isEditing && (
            <button 
              onClick={() => setIsEditing(true)}
              className="bg-white hover:bg-gray-50 text-blue-700 font-bold px-5 py-3 rounded-2xl flex items-center justify-center space-x-2 transition-all shadow-md shadow-black/5 hover:-translate-y-0.5"
            >
              <Edit className="w-4 h-4" />
              <span>Editar Datos</span>
            </button>
          )}
        </div>

        {/* Sección Editable de Alertas Médicas Permanentes (OCULTADA PARA ROL ASSISTANT) */}
        {!isAssistant && (
          <div className="bg-red-50/20 border-b border-gray-100 p-6 sm:p-8 space-y-4">
            <div className="flex items-center space-x-2 text-red-700">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-sm uppercase tracking-wider">Alertas Médicas del Paciente</h3>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {!patient.medical_alerts || patient.medical_alerts.length === 0 ? (
                <span className="text-xs text-gray-500 italic">No hay alertas médicas registradas. Agrega condiciones críticas de salud.</span>
              ) : (
                patient.medical_alerts.map((alert, idx) => {
                  const isCustom = isCustomAlert(alert);
                  const isPending = pendingAlerts.includes(alert);
                  return (
                    <span 
                      key={idx} 
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border shadow-sm animate-in zoom-in-95 transition-all ${
                        isCustom ? 'border-dashed border-red-400' : 'border-red-200'
                      } ${isPending ? 'opacity-50 pointer-events-none' : ''}`}
                      title={isCustom ? 'Alerta personalizada (borde punteado)' : 'Alerta del catálogo'}
                    >
                      <span>{alert}</span>
                      <button 
                        type="button"
                        onClick={() => handleRemoveAlert(alert)}
                        className="ml-2 hover:bg-red-200 text-red-900 rounded-full p-0.5 transition-colors"
                        disabled={isPending}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })
              )}
            </div>

            {/* Combobox con Catálogo Autocompletable + Teclado */}
            <div className="relative max-w-md pt-1">
              <div className="flex gap-2">
                <input 
                  type="text"
                  value={newAlertText}
                  onChange={(e) => {
                    setNewAlertText(e.target.value);
                    setShowDropdown(true);
                    setFocusedIndex(0);
                  }}
                  onFocus={() => {
                    setShowDropdown(true);
                    setFocusedIndex(0);
                  }}
                  onBlur={() => {
                    setTimeout(() => {
                      setShowDropdown(false);
                      setFocusedIndex(-1);
                    }, 200);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Busca o escribe una alerta médica..."
                  maxLength="100"
                  className="flex-1 px-4 py-2 text-xs rounded-xl border border-gray-200 focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none bg-white text-gray-800 transition-all"
                />
                <button 
                  type="button"
                  onClick={() => handleAddAlert(newAlertText)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs shadow-sm transition-all"
                >
                  + Agregar
                </button>
              </div>

              {/* Dropdown de opciones */}
              {showDropdown && (
                <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-2xl shadow-xl z-50 py-1 divide-y divide-gray-50">
                  {filteredCatalog.map((item, idx) => {
                    const isPending = pendingAlerts.includes(item.name);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onMouseDown={() => {
                          handleAddAlert(item.name);
                          setNewAlertText('');
                          setShowDropdown(false);
                        }}
                        disabled={isPending}
                        className={`w-full text-left px-4 py-2 text-xs transition-colors font-semibold flex items-center justify-between ${
                          idx === focusedIndex 
                            ? 'bg-blue-50 text-blue-700' 
                            : 'text-gray-700 hover:bg-gray-50'
                        } ${isPending ? 'opacity-50 pointer-events-none' : ''}`}
                      >
                        <span>{item.name}</span>
                        <span className="text-[9px] text-gray-400 font-normal">Catálogo</span>
                      </button>
                    );
                  })}

                  {showCustomOption && (
                    <button
                      type="button"
                      onMouseDown={() => {
                        handleAddAlert(newAlertText);
                        setNewAlertText('');
                        setShowDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-xs transition-colors font-bold flex items-center justify-between ${
                        focusedIndex === filteredCatalog.length 
                          ? 'bg-red-50 text-red-700' 
                          : 'text-red-600 hover:bg-red-50/50'
                      }`}
                    >
                      <span>Agregar "{newAlertText}" como alerta personalizada</span>
                      <span className="text-[9px] font-normal italic">Manual</span>
                    </button>
                  )}

                  {filteredCatalog.length === 0 && !showCustomOption && (
                    <div className="px-4 py-3 text-xs text-gray-400 italic text-center">
                      No se encontraron coincidencias en el catálogo.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Contenido / Formulario */}
        <div className="p-6 sm:p-8">
          {error && isEditing && (
            <div className="bg-red-50 text-red-700 p-4 rounded-xl mb-6 flex items-start border border-red-100 text-sm">
              <AlertCircle className="w-5 h-5 mr-3 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {isEditing ? (
            <form onSubmit={handleSave} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Nombre */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo *</label>
                  <input 
                    type="text" required
                    value={formData.full_name} onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                  />
                </div>

                {/* RUT */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">RUT *</label>
                  <input 
                    type="text" required
                    value={formData.rut} onChange={handleRutChange}
                    className={`w-full px-4 py-3 rounded-xl border ${rutError ? 'border-red-500 focus:ring-red-500' : 'border-gray-200 focus:ring-blue-500'} focus:ring-2 focus:border-transparent transition-all outline-none`}
                  />
                  {rutError && (
                    <p className="text-xs text-red-600 mt-1 font-medium">{rutError}</p>
                  )}
                </div>

                {/* Fecha de Nacimiento */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Nacimiento</label>
                  <input 
                    type="date"
                    value={formData.birth_date} onChange={e => setFormData({ ...formData, birth_date: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                  />
                </div>

                {/* Sexo */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sexo *</label>
                  <select 
                    value={formData.sex} onChange={e => setFormData({ ...formData, sex: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none bg-white"
                  >
                    <option value="Masculino">Masculino</option>
                    <option value="Femenino">Femenino</option>
                    <option value="Intersex">Intersex</option>
                  </select>
                </div>

                {/* Identidad Género */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">¿Cómo se identifica?</label>
                  <input 
                    type="text"
                    value={formData.gender_identity} onChange={e => setFormData({ ...formData, gender_identity: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                  />
                </div>

                {/* Previsión */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Previsión *</label>
                    <select 
                      value={formData.prevision} onChange={e => setFormData({ ...formData, prevision: e.target.value, prevision_detail: '' })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none bg-white"
                    >
                      <option value="FONASA">FONASA</option>
                      <option value="ISAPRE">ISAPRE</option>
                      <option value="Particular">Particular</option>
                      <option value="Otro">Otro</option>
                    </select>
                  </div>
                  
                  {(formData.prevision === 'ISAPRE' || formData.prevision === 'Otro') && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Detalle Previsión *</label>
                      <input 
                        type="text" required
                        value={formData.prevision_detail} onChange={e => setFormData({ ...formData, prevision_detail: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                      />
                    </div>
                  )}
                </div>

                {/* Teléfono */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                  <input 
                    type="tel"
                    value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                  />
                </div>

                {/* Correo */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico</label>
                  <input 
                    type="email"
                    value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                  />
                </div>

                {/* Dirección */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                  <input 
                    type="text"
                    value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                  />
                </div>
              </div>

              <div className="flex space-x-3 pt-4 border-t border-gray-100">
                <button 
                  type="button" 
                  onClick={() => { setIsEditing(false); setError(null); setRutError(null); }}
                  className="w-1/2 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl transition-all"
                  disabled={saveLoading}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={saveLoading}
                  className="w-1/2 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl shadow-lg shadow-blue-200 transition-all flex items-center justify-center space-x-2"
                >
                  {saveLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      <span>Guardar Cambios</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
              {/* Información Personal */}
              <div className="space-y-4">
                <h3 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2">Información Personal</h3>
                
                <div className="grid grid-cols-2 gap-y-3">
                  <span className="text-gray-500">Sexo biológico:</span>
                  <span className="font-semibold text-gray-800">{patient.sex}</span>
                  
                  <span className="text-gray-500">Identidad de género:</span>
                  <span className="font-semibold text-gray-800">{patient.gender_identity || 'No especificada'}</span>

                  <span className="text-gray-500">Fecha de Nacimiento:</span>
                  <span className="font-semibold text-gray-800">{patient.birth_date || 'No registrada'}</span>
                </div>
              </div>

              {/* Información de Salud y Contacto */}
              <div className="space-y-4">
                <h3 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2">Salud y Contacto</h3>
                
                <div className="grid grid-cols-2 gap-y-3">
                  <span className="text-gray-500">Previsión:</span>
                  <div className="flex items-center space-x-1.5">
                    {patient.prevision === 'FONASA' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 uppercase">
                        FONASA
                      </span>
                    ) : (
                      <span className="font-semibold text-gray-800 uppercase">
                        {patient.prevision} {patient.prevision_detail && `(${patient.prevision_detail})`}
                      </span>
                    )}
                  </div>

                  <span className="text-gray-500">Teléfono:</span>
                  <span className="font-semibold text-gray-800 flex items-center space-x-1.5">
                    <Phone className="w-3.5 h-3.5 text-gray-400" />
                    <span>{patient.phone || 'No registrado'}</span>
                  </span>

                  <span className="text-gray-500">Correo Electrónico:</span>
                  <span className="font-semibold text-gray-800 flex items-center space-x-1.5">
                    <Mail className="w-3.5 h-3.5 text-gray-400" />
                    <span>{patient.email || 'No registrado'}</span>
                  </span>

                  <span className="text-gray-500 col-span-2 mt-1">Dirección:</span>
                  <span className="font-semibold text-gray-800 col-span-2 flex items-start space-x-1.5">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                    <span>{patient.address || 'No registrada'}</span>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sección Historial Clínico (OCULTADA PARA ROL ASSISTANT) */}
      {!isAssistant && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between border-b border-gray-100 pb-4">
            <h2 className="text-xl font-bold text-gray-900 flex items-center">
              <Heart className="w-5 h-5 mr-3 text-red-500" />
              Historial Clínico
            </h2>
            <button 
              onClick={openNewRecordModal}
              className="flex items-center space-x-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold px-4 py-2 rounded-xl transition-all text-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Nueva Sesión</span>
            </button>
          </div>

          {recordsLoading ? (
            <div className="py-12 text-center text-gray-400">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600 mb-2" />
              Cargando historial clínico...
            </div>
          ) : records.length === 0 ? (
            <div className="py-12 text-center text-gray-400 space-y-2">
              <BookOpen className="w-10 h-10 mx-auto text-gray-300" />
              <p className="font-semibold text-base text-gray-600">No hay sesiones clínicas registradas</p>
              <p className="text-sm">Registra una nueva atención presionando el botón "Nueva Sesión".</p>
            </div>
          ) : (
            <div className="space-y-4">
              {records.map((rec) => {
                const isExpanded = expandedRecordId === rec.id;
                
                // Determinar fecha bonita
                let formattedDate = rec.session_date;
                try {
                  formattedDate = format(parseISO(rec.session_date), "EEEE d 'de' MMMM, yyyy", { locale: es });
                } catch (e) {
                  console.error(e);
                }

                return (
                  <div 
                    key={rec.id} 
                    className={`border rounded-2xl transition-all duration-200 bg-white ${
                      isExpanded ? 'border-blue-200 shadow-sm ring-1 ring-blue-100' : 'border-gray-100 hover:border-gray-200 shadow-sm/5'
                    }`}
                  >
                    {/* Cabecera Colapsada */}
                    <div 
                      onClick={() => setExpandedRecordId(isExpanded ? null : rec.id)}
                      className="p-5 flex items-start justify-between gap-4 cursor-pointer select-none"
                    >
                      <div className="space-y-2 flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <span className="text-sm font-bold text-gray-900 capitalize">
                            {formattedDate}
                          </span>
                          <span className="text-xs text-gray-400 font-medium">
                            Atendido por: {rec.dentist?.full_name || 'Odontólogo'}
                          </span>
                        </div>
                        
                        {!isExpanded && (
                          <>
                            {rec.chief_complaint && (
                              <p className="text-sm text-gray-600 truncate max-w-xl">
                                Motivo: {rec.chief_complaint}
                              </p>
                            )}
                            
                            {/* Diagnósticos en chips */}
                            {rec.diagnosis_codes && rec.diagnosis_codes.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {rec.diagnosis_codes.map((code, idx) => (
                                  <span 
                                    key={idx} 
                                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600 uppercase border border-blue-100"
                                  >
                                    {code}
                                  </span>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      
                      <button className="text-gray-400 hover:text-gray-600 p-1 rounded-lg">
                        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </button>
                    </div>

                    {/* Detalle Expandido */}
                    {isExpanded && (
                      <div className="p-5 pt-0 border-t border-gray-50 space-y-5 animate-in fade-in duration-200">
                        
                        {/* Las 5 áreas obligatorias de sesión */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm pt-4">
                          
                          {/* 1. Motivo de Consulta */}
                          <div className="space-y-1">
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Motivo de Consulta</h4>
                            <p className="text-gray-700 whitespace-pre-wrap">{rec.chief_complaint || 'No especificado.'}</p>
                          </div>

                          {/* 2. Anamnesis con resaltado de palabras clave */}
                          <div className="space-y-1">
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Anamnesis</h4>
                            <p className="text-gray-700 whitespace-pre-wrap">{highlightKeywords(rec.anamnesis)}</p>
                          </div>

                          {/* 3. Exploración */}
                          <div className="space-y-1">
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Exploración</h4>
                            <p className="text-gray-700 whitespace-pre-wrap">{rec.exploration || 'Sin registro de exploración.'}</p>
                          </div>

                          {/* 4. Diagnóstico (chips catalog + libre) */}
                          <div className="space-y-2">
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Diagnóstico</h4>
                            
                            {rec.diagnosis_codes && rec.diagnosis_codes.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mb-2">
                                {rec.diagnosis_codes.map((code, idx) => (
                                  <span 
                                    key={idx} 
                                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600 uppercase border border-blue-100"
                                  >
                                    {code}
                                  </span>
                                ))}
                              </div>
                            )}

                            <p className="text-gray-700 whitespace-pre-wrap">{rec.diagnosis || 'Sin notas adicionales de diagnóstico.'}</p>
                          </div>

                          {/* 5. Procedimiento Realizado */}
                          <div className="space-y-1 md:col-span-2">
                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Procedimiento Realizado</h4>
                            <p className="text-gray-700 whitespace-pre-wrap">{rec.procedure_performed || 'Sin registro de procedimiento.'}</p>
                          </div>

                        </div>

                        <div className="flex justify-end pt-3 border-t border-gray-50">
                          <button 
                            onClick={() => openEditRecordModal(rec)}
                            className="flex items-center space-x-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-3 py-1.5 rounded-lg text-xs transition-all"
                          >
                            <Edit className="w-3.5 h-3.5" />
                            <span>Editar Sesión</span>
                          </button>
                        </div>

                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL REGISTRO CLÍNICO (NUEVO/EDITAR) (SOLO CLÍNICO) */}
      {!isAssistant && showRecordModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 sm:p-8 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button 
              onClick={() => setShowRecordModal(false)}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-all"
              disabled={recordFormLoading}
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center">
              <BookOpen className="w-6 h-6 mr-3 text-blue-600" />
              {editingRecord ? 'Editar Sesión Clínica' : 'Registrar Sesión Clínica'}
            </h2>
            <p className="text-gray-500 mb-6 text-sm">Ingresa los antecedentes clínicos y procedimientos realizados.</p>

            {recordFormError && (
              <div className="bg-red-50 text-red-700 p-4 rounded-xl mb-6 flex items-start border border-red-100 text-sm">
                <AlertCircle className="w-5 h-5 mr-3 shrink-0 mt-0.5" />
                <span>{recordFormError}</span>
              </div>
            )}

            <form onSubmit={handleRecordFormSubmit} className="space-y-5">
              
              {/* Fecha de Sesión */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Sesión *</label>
                <input 
                  type="date" required
                  value={recordForm.session_date} 
                  onChange={e => setRecordForm({ ...recordForm, session_date: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                />
              </div>

              {/* 1. Motivo de Consulta */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motivo de Consulta</label>
                <textarea 
                  rows="2"
                  value={recordForm.chief_complaint}
                  onChange={e => setRecordForm({ ...recordForm, chief_complaint: e.target.value })}
                  placeholder="Ej. Paciente refiere dolor punzante en molar inferior izquierdo al masticar"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                />
              </div>

              {/* 2. Anamnesis con listado de riesgos de ficha permanente */}
              <div className="space-y-4">
                
                {/* Caja de chips de antecedentes de riesgo permanente */}
                <div className="bg-red-50/10 border border-gray-100 p-4 rounded-2xl space-y-3">
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    Antecedentes de riesgo — se guardan en la ficha permanente del paciente
                  </label>
                  
                  <div className="flex flex-wrap gap-1.5">
                    {/* Renderizar catálogo completo como chips seleccionables */}
                    {alertsCatalog.map((item) => {
                      const isSelected = (patient?.medical_alerts || []).includes(item.name);
                      const isPending = pendingAlerts.includes(item.name);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleToggleRiskAlert(item.name, isSelected)}
                          disabled={isPending}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                            isSelected
                              ? 'bg-red-600 text-white border-red-600 shadow-sm shadow-red-100'
                              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                          } ${isPending ? 'opacity-50 pointer-events-none' : ''}`}
                        >
                          {item.name}
                        </button>
                      );
                    })}

                    {/* Renderizar alertas personalizadas del paciente (no catálogo) */}
                    {(patient?.medical_alerts || []).filter(isCustomAlert).map((customAlert, idx) => {
                      const isPending = pendingAlerts.includes(customAlert);
                      return (
                        <button
                          key={`custom-${idx}`}
                          type="button"
                          onClick={() => handleToggleRiskAlert(customAlert, true)}
                          disabled={isPending}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-600 text-white border border-dashed border-red-400 shadow-sm shadow-red-100 transition-all ${
                            isPending ? 'opacity-50 pointer-events-none' : ''
                          }`}
                        >
                          {customAlert}
                        </button>
                      );
                    })}

                    {/* Botón "+ Otro..." */}
                    {!showInlineAlertForm ? (
                      <button
                        type="button"
                        onClick={() => setShowInlineAlertForm(true)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-600 border border-transparent transition-all"
                      >
                        + Otro...
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 animate-in zoom-in-95">
                        <input
                          type="text"
                          value={inlineAlertText}
                          onChange={(e) => setInlineAlertText(e.target.value)}
                          placeholder="Nueva alerta..."
                          maxLength="100"
                          className="px-3 py-1 text-xs rounded-xl border border-gray-200 focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none bg-white text-gray-800"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            await handleAddAlert(inlineAlertText);
                            setInlineAlertText('');
                            setShowInlineAlertForm(false);
                          }}
                          className="px-3 py-1 bg-red-600 text-white font-bold rounded-xl text-xs hover:bg-red-700 transition-colors"
                        >
                          Agregar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setInlineAlertText('');
                            setShowInlineAlertForm(false);
                          }}
                          className="p-1 text-gray-400 hover:text-gray-600 rounded-full transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Notas de Anamnesis (Textarea Libre) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notas de anamnesis</label>
                  <textarea 
                    rows="3"
                    value={recordForm.anamnesis}
                    onChange={e => setRecordForm({ ...recordForm, anamnesis: e.target.value })}
                    placeholder="Ej. Paciente declara tabaquismo desde los 15 años. Controlado de su cardiopatía."
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                  />
                </div>

              </div>

              {/* 3. Exploración */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Exploración</label>
                <textarea 
                  rows="3"
                  value={recordForm.exploration}
                  onChange={e => setRecordForm({ ...recordForm, exploration: e.target.value })}
                  placeholder="Ej. Se observa lesión de caries activa profunda en pieza 3.6 oclusal. Sensible a percusión."
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                />
              </div>

              {/* 4. Diagnóstico */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Diagnóstico (Detalle Libre)</label>
                  <textarea 
                    rows="2"
                    value={recordForm.diagnosis}
                    onChange={e => setRecordForm({ ...recordForm, diagnosis: e.target.value })}
                    placeholder="Ej. Caries dentinaria profunda con sospecha de compromiso pulpar en pieza 3.6"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                  />
                </div>

                {/* Multiselect del catálogo agrupado por categoría */}
                {Object.keys(catalog).length > 0 && (
                  <div className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100 space-y-3">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Diagnósticos Sugeridos (Selecciona todos los que correspondan)
                    </label>
                    <div className="space-y-3">
                      {Object.entries(catalog).map(([category, items]) => (
                        <div key={category} className="space-y-1.5">
                          <span className="text-xs font-bold text-gray-400 capitalize">{category}</span>
                          <div className="flex flex-wrap gap-1.5">
                            {items.map((item) => {
                              const isSelected = recordForm.diagnosis_codes.includes(item.name);
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => {
                                    const current = recordForm.diagnosis_codes;
                                    if (isSelected) {
                                      setRecordForm({
                                        ...recordForm,
                                        diagnosis_codes: current.filter(code => code !== item.name)
                                      });
                                    } else {
                                      setRecordForm({
                                        ...recordForm,
                                        diagnosis_codes: [...current, item.name]
                                      });
                                    }
                                  }}
                                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                                    isSelected
                                      ? 'bg-blue-600 text-white shadow-sm'
                                      : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                                  }`}
                                >
                                  {item.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 5. Procedimiento Realizado */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Procedimiento Realizado</label>
                <textarea 
                  rows="2"
                  value={recordForm.procedure_performed}
                  onChange={e => setRecordForm({ ...recordForm, procedure_performed: e.target.value })}
                  placeholder="Ej. Eliminación de caries con fresa de carburo. Cavidad compatible. Obturación temporal."
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowRecordModal(false)}
                  className="w-1/2 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-all"
                  disabled={recordFormLoading}
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={recordFormLoading}
                  className="w-1/2 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-200 transition-all flex items-center justify-center space-x-2"
                >
                  {recordFormLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>{editingRecord ? 'Guardar Cambios' : 'Registrar Sesión'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN PERSONALIZADO PARA QUITAR ALERTA (Deselección) (SOLO CLÍNICO) */}
      {!isAssistant && confirmDeselectAlert && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl relative animate-in zoom-in-95 duration-200 text-center space-y-4">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-gray-900">Quitar Alerta Médica</h3>
              <p className="text-xs text-gray-500 px-4">
                ¿Quitar <span className="font-bold text-gray-900">"{confirmDeselectAlert}"</span> de la ficha permanente del paciente?
              </p>
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeselectAlert(null)}
                className="w-1/2 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  await handleRemoveAlert(confirmDeselectAlert);
                  setConfirmDeselectAlert(null);
                }}
                className="w-1/2 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition-all"
              >
                Quitar alerta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
