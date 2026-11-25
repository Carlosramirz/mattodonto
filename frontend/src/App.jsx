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
import Footer from './components/Footer';
import { AuthProvider, useAuth } from './context/AuthContext';

function PrivateRoute({ children, requiredRole, requiredRoles }) {
  const { user, role, loading } = useAuth();

  if (loading) return <div className="p-10 text-center text-ink-muted">Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (requiredRole && role !== requiredRole) return <Navigate to="/login" replace />;
  if (requiredRoles && !requiredRoles.includes(role)) return <Navigate to="/login" replace />;

  return children;
}

// Un solo estilo de link de navegación en toda la barra (sistema: .nav a)
const navLink = "text-ink-muted hover:text-secondary font-medium transition-colors";

function AppRoutes() {
  const { user, role, logout } = useAuth();

  return (
    <Router>
      {/* `bg-background` es el único nombre del ground (antes: bg-background-site) */}
      <div className="min-h-screen bg-background text-ink flex flex-col font-sans">
        {/* Barra de navegación dinámica — sistema: .nav */}
        <nav className="bg-surface border-b border-primary/10 px-6 py-3 shadow-sm">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-6">
            <Link to="/" className="font-heading text-2xl font-semibold text-primary flex items-center gap-2 tracking-tight hover:text-primary-700 transition-colors">
              {/* Icono de diente — trazos desde los tokens, no hex sueltos */}
              <svg className="w-7 h-7 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C8.5 2 6 4.5 6 8C6 11.5 8 13.5 8 16C8 18 7.5 19 8.5 21C9.5 23 11 22 12 22C13 22 14.5 23 15.5 21C16.5 19 16 18 16 16C16 13.5 18 11.5 18 8C18 4.5 15.5 2 12 2Z" className="stroke-primary" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 2V22" className="stroke-silver" strokeWidth="1.5" strokeDasharray="3 3" />
                <path d="M9.5 7.5C9.5 7.5 10.5 7 12 7C13.5 7 14.5 7.5 14.5 7.5" className="stroke-secondary" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span>Mattodonto</span>
            </Link>

            <div className="flex items-center gap-6">
              {user ? (
                <>
                  {role === 'admin' && (
                    <Link to="/admin/dashboard" className={navLink}>Panel Admin</Link>
                  )}
                  {role === 'dentist' && (
                    <>
                      <Link to="/dentist/dashboard" className={navLink}>Dashboard</Link>
                      <Link to="/dentist/patients" className={navLink}>Pacientes</Link>
                      <Link to="/dentist/availability" className={navLink}>Disponibilidad</Link>
                    </>
                  )}
                  {role === 'assistant' && (
                    <>
                      <Link to="/assistant/dashboard" className={navLink}>Agenda</Link>
                      <Link to="/assistant/availability" className={navLink}>Disponibilidad</Link>
                    </>
                  )}
                  {/* Cerrar sesión no es destructivo: neutral, no rojo.
                      (antes: bg-red-50 text-red-650 — paso inexistente en Tailwind) */}
                  <button
                    onClick={logout}
                    className="min-h-touch bg-silver-200 hover:bg-silver-300 text-ink px-4 py-2 rounded-full text-sm font-medium transition-colors cursor-pointer"
                  >
                    Cerrar Sesión
                  </button>
                </>
              ) : (
                <>
                  <Link to="/cancel" className={navLink}>Anular Cita</Link>
                  <Link to="/login" className={navLink}>Ingreso Personal</Link>
                  {/* La acción principal de la barra: pill sólido azul marino */}
                  <Link
                    to="/"
                    className="min-h-touch inline-flex items-center bg-primary hover:bg-primary-700 active:bg-primary-800 text-white px-4 py-2 rounded-full text-sm font-medium shadow-sm hover:shadow-md transition-all"
                  >
                    Reservar hora
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

        {/* Footer Global de Mattodonto */}
        <Footer />
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
