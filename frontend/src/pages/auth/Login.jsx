import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { LogIn, AlertCircle } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loadingLocal, setLoadingLocal] = useState(false);
  
  const { login, user, role } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (user && role) {
      if (role === 'admin') navigate('/admin/dashboard');
      else if (role === 'assistant') navigate('/assistant/dashboard');
      else navigate('/dentist/dashboard');
    }
  }, [user, role, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoadingLocal(true);

    try {
      await login(email, password);
      // Navigation is handled by the useEffect watching user and role
    } catch (err) {
      setError('Credenciales inválidas. Por favor intenta nuevamente.');
    } finally {
      setLoadingLocal(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-gray-100">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <LogIn className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Ingreso a Mattodonto</h1>
          <p className="text-gray-500 mt-2">Panel exclusivo para personal médico y administrativo.</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-xl mb-6 flex items-center text-sm border border-red-100">
            <AlertCircle className="w-5 h-5 mr-2 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico</label>
            <input 
              type="email" required
              value={email} onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" 
              placeholder="correo@mattodonto.com"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
            <input 
              type="password" required
              value={password} onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none" 
            />
          </div>

          <button 
            type="submit" 
            disabled={loadingLocal}
            className={`
              w-full py-4 text-white font-bold rounded-xl shadow-lg transition-all mt-4
              ${loadingLocal ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:-translate-y-0.5 shadow-blue-200'}
            `}
          >
            {loadingLocal ? 'Ingresando...' : 'Iniciar Sesión'}
          </button>
        </form>
      </div>
    </div>
  );
}
