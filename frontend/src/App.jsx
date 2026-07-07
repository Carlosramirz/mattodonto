import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import Availability from './pages/dentist/Availability';
import Dashboard from './pages/dentist/Dashboard';
import BookingWizard from './pages/public/BookingWizard';
import CancelAppointment from './pages/public/CancelAppointment';
import Login from './pages/auth/Login';
import AdminDashboard from './pages/admin/AdminDashboard';
import Patients from './pages/dentist/Patients';
import PatientDetails from './pages/dentist/PatientDetails';
import AssistantDashboard from './pages/assistant/AssistantDashboard';
import AssistantAvailability from './pages/assistant/AssistantAvailability';
import { AuthProvider, useAuth } from './context/AuthContext';

function PrivateRoute({ children, requiredRole, requiredRoles }) {
  const { user, role, loading } = useAuth();

  if (loading) return <div className="p-10 text-center">Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (requiredRole && role !== requiredRole) return <Navigate to="/login" replace />;
  if (requiredRoles && !requiredRoles.includes(role)) return <Navigate to="/login" replace />;

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
                    <>
                      <Link to="/admin/dashboard" className="text-gray-600 hover:text-blue-600 font-medium">
                        Panel Admin
                      </Link>
                    </>
                  )}
                  {role === 'dentist' && (
                    <>
                      <Link to="/dentist/dashboard" className="text-gray-600 hover:text-blue-600 font-medium">
                        Dashboard
                      </Link>
                      <Link to="/dentist/patients" className="text-gray-600 hover:text-blue-600 font-medium">
                        Pacientes
                      </Link>
                      <Link to="/dentist/availability" className="text-gray-600 hover:text-blue-600 font-medium">
                        Disponibilidad
                      </Link>
                    </>
                  )}
                  {role === 'assistant' && (
                    <>
                      <Link to="/assistant/dashboard" className="text-gray-600 hover:text-blue-600 font-medium">
                        Agenda
                      </Link>
                      <Link to="/assistant/availability" className="text-gray-600 hover:text-blue-600 font-medium">
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
            <Route path="/dentist/patients" element={
              <PrivateRoute requiredRole="dentist"><Patients /></PrivateRoute>
            } />
            <Route path="/dentist/patients/:id" element={
              <PrivateRoute requiredRole="dentist"><PatientDetails /></PrivateRoute>
            } />

            {/* Rutas de Asistente */}
            <Route path="/assistant/dashboard" element={
              <PrivateRoute requiredRole="assistant"><AssistantDashboard /></PrivateRoute>
            } />
            <Route path="/assistant/availability" element={
              <PrivateRoute requiredRole="assistant"><AssistantAvailability /></PrivateRoute>
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
