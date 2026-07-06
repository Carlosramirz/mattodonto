import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import Availability from './pages/dentist/Availability';
import Dashboard from './pages/dentist/Dashboard';
import BookingWizard from './pages/public/BookingWizard';
import CancelAppointment from './pages/public/CancelAppointment';
import Login from './pages/auth/Login';
import AdminDashboard from './pages/admin/AdminDashboard';
import { AuthProvider, useAuth } from './context/AuthContext';

function PrivateRoute({ children, requiredRole }) {
  const { user, role, loading } = useAuth();

  if (loading) return <div className="p-10 text-center">Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (requiredRole && role !== requiredRole) return <Navigate to="/login" replace />;

  return children;
}

function AppRoutes() {
  const { user, role, logout } = useAuth();

  return (
    <Router>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Barra de navegación dinámica */}
        <nav className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <Link to="/" className="font-bold text-xl text-blue-600">Mattodonto</Link>
            <div className="flex items-center space-x-6">
              {user ? (
                <>
                  {role === 'admin' && (
                    <Link to="/admin/dashboard" className="text-gray-600 hover:text-blue-600 font-medium">
                      Panel Admin
                    </Link>
                  )}
                  {role === 'dentist' && (
                    <>
                      <Link to="/dentist/dashboard" className="text-gray-600 hover:text-blue-600 font-medium">
                        Dashboard
                      </Link>
                      <Link to="/dentist/availability" className="text-gray-600 hover:text-blue-600 font-medium">
                        Disponibilidad
                      </Link>
                    </>
                  )}
                  <button 
                    onClick={logout}
                    className="bg-red-50 hover:bg-red-100 text-red-600 px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer"
                  >
                    Cerrar Sesión
                  </button>
                </>
              ) : (
                <>
                  <Link to="/cancel" className="text-gray-600 hover:text-blue-600 font-medium">
                    Anular Cita
                  </Link>
                  <Link to="/login" className="text-gray-600 hover:text-blue-600 font-medium">
                    Ingreso Personal
                  </Link>
                </>
              )}
            </div>
          </div>
        </nav>

        <main className="flex-1 py-8">
          <Routes>
            <Route path="/" element={<BookingWizard />} />
            <Route path="/cancel/:token" element={<CancelAppointment />} />
            <Route path="/cancel" element={<CancelAppointment />} />
            <Route path="/login" element={<Login />} />
            
            {/* Rutas de Odontólogo */}
            <Route path="/dentist/dashboard" element={
              <PrivateRoute requiredRole="dentist"><Dashboard /></PrivateRoute>
            } />
            <Route path="/dentist/availability" element={
              <PrivateRoute requiredRole="dentist"><Availability /></PrivateRoute>
            } />

            {/* Rutas de Administrador */}
            <Route path="/admin/dashboard" element={
              <PrivateRoute requiredRole="admin"><AdminDashboard /></PrivateRoute>
            } />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;
