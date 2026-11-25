import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { 
  Search, UserPlus, Phone, CreditCard, Shield, 
  ChevronLeft, ChevronRight, User, Loader2, X, Plus, AlertCircle
} from 'lucide-react';

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

export default function Patients() {
  const { apiFetch } = useAuth();
  const navigate = useNavigate();

  const basePath = 'dentist';

  // Estados
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Estado Modal Formulario
  const [showModal, setShowModal] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState(null);
  const [rutError, setRutError] = useState(null);

  // Estado del Formulario de Creación
  const [formData, setFormData] = useState({
    full_name: '',
    rut: '',
    phone: '+569',
    email: '',
    address: '',
    birth_date: '',
    sex: 'Masculino',
    gender_identity: '',
    prevision: 'Particular',
    prevision_detail: ''
  });

  useEffect(() => {
    fetchPatients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search]);

  const fetchPatients = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/dentist/patients?search=${encodeURIComponent(search)}&page=${page}`);
      const data = await res.json();
      if (res.ok) {
        setPatients(data.patients || []);
        setTotalPages(data.totalPages || 1);
        setTotalCount(data.totalCount || 0);
      } else {
        console.error('Error al obtener pacientes:', data.error);
      }
    } catch (err) {
      console.error('Error en fetchPatients:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setPage(1); // Volver a la primera página ante cambios de búsqueda
  };

  const handleRutChange = (e) => {
    const formatted = formatRut(e.target.value);
    setFormData({ ...formData, rut: formatted });
    setRutError(null);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    setRutError(null);

    // Validar RUT
    if (!validateChileanRut(formData.rut)) {
      setRutError('El RUT ingresado no es válido. Verifica e intenta de nuevo.');
      return;
    }

    setFormLoading(true);
    try {
      const res = await apiFetch('/api/dentist/patients', {
        method: 'POST',
        body: JSON.stringify(formData)
      });
      const data = await res.json();

      if (res.ok) {
        // Cerrar modal y limpiar
        setShowModal(false);
        setFormData({
          full_name: '',
          rut: '',
          phone: '+569',
          email: '',
          address: '',
          birth_date: '',
          sex: 'Masculino',
          gender_identity: '',
          prevision: 'Particular',
          prevision_detail: ''
        });
        fetchPatients(); // Refrescar listado
      } else {
        setFormError(data.error || 'Error al guardar el paciente.');
      }
    } catch (err) {
      console.error('Error al crear paciente:', err);
      setFormError('Ocurrió un error en el servidor al intentar crear el paciente.');
    } finally {
      setFormLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8 font-sans">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-semibold text-ink">Fichas Clínicas</h1>
          <p className="text-ink-subtle mt-1.5 text-sm font-medium">Administración y registro de datos de pacientes.</p>
        </div>
        <button 
          onClick={() => { setShowModal(true); setFormError(null); setRutError(null); }}
          className="flex items-center justify-center space-x-2 bg-primary hover:bg-secondary text-white font-bold px-5 py-3 rounded-2xl shadow-md transition-all cursor-pointer"
        >
          <UserPlus className="w-5 h-5" />
          <span>Nueva Ficha</span>
        </button>
      </div>

      {/* Caja de Búsqueda */}
      <div className="bg-white rounded-2xl border border-silver-300 p-4 shadow-sm flex items-center space-x-3">
        <Search className="w-5 h-5 text-ink-subtle shrink-0" />
        <input 
          type="text" 
          value={search}
          onChange={handleSearchChange}
          placeholder="Buscar paciente por nombre o RUT..."
          className="w-full text-ink outline-none text-sm placeholder:text-ink-subtle bg-transparent"
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-xs text-ink-subtle hover:text-ink-muted font-bold px-2 cursor-pointer">
            Limpiar
          </button>
        )}
      </div>

      {/* Listado */}
      <div className="bg-white rounded-2xl shadow-sm border border-silver-200 overflow-hidden min-h-[400px] flex flex-col justify-between">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-silver-100/50 border-b border-silver-200 text-xs font-semibold text-ink-subtle uppercase tracking-wider">
                <th className="py-4 px-6">Nombre</th>
                <th className="py-4 px-6">RUT</th>
                <th className="py-4 px-6">Teléfono</th>
                <th className="py-4 px-6">Previsión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-silver-200 text-sm">
              {loading ? (
                <tr>
                  <td colSpan="4" className="py-20 text-center text-ink-subtle">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary mb-2" />
                    Cargando listado de pacientes...
                  </td>
                </tr>
              ) : patients.length === 0 ? (
                <tr>
                  <td colSpan="4" className="py-20 text-center">
                    <User className="w-12 h-12 text-silver-400 mx-auto mb-3" />
                    <p className="text-ink-muted font-medium">No se encontraron pacientes registrados.</p>
                    <p className="text-ink-subtle text-xs mt-1">Crea un registro utilizando el botón "Nueva Ficha".</p>
                  </td>
                </tr>
              ) : (
                patients.map((patient) => (
                  <tr 
                    key={patient.id} 
                    onClick={() => navigate(`/${basePath}/patients/${patient.id}`)}
                    className="hover:bg-silver-100/70 cursor-pointer transition-all group"
                  >
                    <td className="py-4 px-6 font-bold text-ink group-hover:text-primary transition-colors">
                      {patient.full_name}
                    </td>
                    <td className="py-4 px-6 text-ink-muted font-mono text-xs">{patient.rut}</td>
                    <td className="py-4 px-6 text-ink-muted">
                      <div className="flex items-center space-x-1.5">
                        <Phone className="w-3.5 h-3.5 text-ink-subtle" />
                        <span>{patient.phone || 'Sin registrar'}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center space-x-2">
                        {patient.prevision === 'FONASA' ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-success-100 text-success-700 uppercase">
                            FONASA
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-silver-200 text-ink-muted uppercase">
                            {patient.prevision}
                            {patient.prevision_detail && ` (${patient.prevision_detail})`}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-silver-200 flex items-center justify-between">
            <span className="text-xs text-ink-subtle font-medium">
              Mostrando página {page} de {totalPages} ({totalCount} pacientes)
            </span>
            <div className="flex space-x-2">
              <button 
                onClick={() => setPage(p => Math.max(p - 1, 1))}
                disabled={page === 1}
                className="p-2 border border-silver-300 rounded-xl hover:bg-silver-100 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                disabled={page === totalPages}
                className="p-2 border border-silver-300 rounded-xl hover:bg-silver-100 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL NUEVA FICHA */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 sm:p-8 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button 
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 p-2 text-ink-subtle hover:text-ink-muted rounded-full hover:bg-silver-200 transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-2xl font-bold text-ink mb-2 flex items-center">
              <UserPlus className="w-6 h-6 mr-3 text-secondary-600" />
              Crear Ficha de Paciente
            </h2>
            <p className="text-ink-subtle mb-6 text-sm">Registra los datos básicos del paciente en el sistema.</p>

            {formError && (
              <div className="bg-danger-100 text-danger-700 p-4 rounded-xl mb-6 flex items-start border border-danger/20 text-sm">
                <AlertCircle className="w-5 h-5 mr-3 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-5">
              {/* Nombre completo */}
              <div>
                <label className="block text-sm font-medium text-ink-muted mb-1">Nombre Completo *</label>
                <input 
                  type="text" required
                  value={formData.full_name} onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="Ej. Constanza Silva"
                  className="w-full px-4 py-3 rounded-xl border border-silver-300 focus:outline-none focus:border-secondary focus:shadow-focus transition-all"
                />
              </div>

              {/* RUT y Fecha de Nacimiento */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ink-muted mb-1">RUT *</label>
                  <input 
                    type="text" required
                    value={formData.rut} onChange={handleRutChange}
                    placeholder="Ej. 12.345.678-5"
                    className={`w-full px-4 py-3 rounded-xl border ${rutError ? 'border-danger' : 'border-silver-300'} focus:outline-none focus:border-secondary focus:shadow-focus transition-all`}
                  />
                  {rutError ? (
                    <p className="text-xs text-danger mt-1 font-medium">{rutError}</p>
                  ) : (
                    <p className="text-xs text-ink-subtle mt-1">Formato: XX.XXX.XXX-X</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-muted mb-1">Fecha de Nacimiento</label>
                  <input 
                    type="date"
                    value={formData.birth_date} onChange={e => setFormData({ ...formData, birth_date: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-silver-300 focus:outline-none focus:border-secondary focus:shadow-focus transition-all"
                  />
                </div>
              </div>

              {/* Sexo e Identidad de Género */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ink-muted mb-1">Sexo *</label>
                  <select 
                    value={formData.sex} onChange={e => setFormData({ ...formData, sex: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-silver-300 focus:outline-none focus:border-secondary focus:shadow-focus transition-all bg-white"
                  >
                    <option value="Masculino">Masculino</option>
                    <option value="Femenino">Femenino</option>
                    <option value="Intersex">Intersex</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-muted mb-1">¿Cómo se identifica?</label>
                  <input 
                    type="text"
                    value={formData.gender_identity} onChange={e => setFormData({ ...formData, gender_identity: e.target.value })}
                    placeholder="Identidad de género (opcional)"
                    className="w-full px-4 py-3 rounded-xl border border-silver-300 focus:outline-none focus:border-secondary focus:shadow-focus transition-all"
                  />
                </div>
              </div>

              {/* Previsión */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ink-muted mb-1">Previsión *</label>
                  <select 
                    value={formData.prevision} onChange={e => setFormData({ ...formData, prevision: e.target.value, prevision_detail: '' })}
                    className="w-full px-4 py-3 rounded-xl border border-silver-300 focus:outline-none focus:border-secondary focus:shadow-focus transition-all bg-white"
                  >
                    <option value="FONASA">FONASA</option>
                    <option value="ISAPRE">ISAPRE</option>
                    <option value="Particular">Particular</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>

                {/* Mostrar el detalle solo si es ISAPRE u Otro */}
                {(formData.prevision === 'ISAPRE' || formData.prevision === 'Otro') && (
                  <div>
                    <label className="block text-sm font-medium text-ink-muted mb-1">
                      {formData.prevision === 'ISAPRE' ? 'Nombre ISAPRE *' : 'Detalle Previsión *'}
                    </label>
                    <input 
                      type="text" required
                      value={formData.prevision_detail} onChange={e => setFormData({ ...formData, prevision_detail: e.target.value })}
                      placeholder={formData.prevision === 'ISAPRE' ? "Ej. Colmena, Banmédica" : "Ej. Convenio Especial"}
                      className="w-full px-4 py-3 rounded-xl border border-silver-300 focus:outline-none focus:border-secondary focus:shadow-focus transition-all"
                    />
                  </div>
                )}
              </div>

              {/* Teléfono y Correo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-ink-muted mb-1">Teléfono</label>
                  <input 
                    type="tel"
                    value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-silver-300 focus:outline-none focus:border-secondary focus:shadow-focus transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink-muted mb-1">Correo Electrónico</label>
                  <input 
                    type="email"
                    value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })}
                    placeholder="ejemplo@correo.com"
                    className="w-full px-4 py-3 rounded-xl border border-silver-300 focus:outline-none focus:border-secondary focus:shadow-focus transition-all"
                  />
                </div>
              </div>

              {/* Dirección */}
              <div>
                <label className="block text-sm font-medium text-ink-muted mb-1">Dirección</label>
                <input 
                  type="text"
                  value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Ej. Calle Falsa 123, depto 40"
                  className="w-full px-4 py-3 rounded-xl border border-silver-300 focus:outline-none focus:border-secondary focus:shadow-focus transition-all"
                />
              </div>

              <div className="flex space-x-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowModal(false)}
                  className="w-1/2 py-3 bg-silver-200 hover:bg-silver-300 text-ink-muted font-bold rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={formLoading}
                  className="w-1/2 py-3 bg-primary hover:bg-primary-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center space-x-2"
                >
                  {formLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>Crear Ficha</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
