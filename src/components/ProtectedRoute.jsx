// src/components/ProtectedRoute.jsx
import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { requiresEmailVerification } from '../config/email-verification';

export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    // Muestra una pantalla de carga mientras se verifica la autenticación
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
        <p className="text-xl">Cargando...</p>
      </div>
    );
  }

  if (!user) {
    // <-- CAMBIO CLAVE AQUÍ: Redirigir a "/" en lugar de "/login"
    return <Navigate to="/" />;
  }
  
  if (location.pathname === '/complete-profile') {
    return <Outlet />;
  }

  if (requiresEmailVerification(user)) {
    // Lo redirigimos a la página de login con un mensaje.
    return <Navigate to="/login" />;
  }

  // Si hay un usuario y pasa la comprobación de verificación, se muestra el contenido protegido.
  return <Outlet />;
}
