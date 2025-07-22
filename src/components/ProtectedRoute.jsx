// src/components/ProtectedRoute.jsx
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    // Muestra una pantalla de carga mientras se verifica la autenticación
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
        <p className="text-xl">Cargando...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }
  
  // Las cuentas antiguas creadas antes de esta fecha no requieren verificación de email.
  const verificationCutoffDate = new Date('2025-07-17T00:00:00Z');
  const userCreationDate = new Date(user.metadata.creationTime);

  // Si el email del usuario no está verificado Y su cuenta fue creada después de la fecha de corte, se le bloquea.
  if (!user.emailVerified && userCreationDate > verificationCutoffDate) {
    return <Navigate to="/login" />;
  }

  // Si hay un usuario y pasa la comprobación de verificación, se muestra el contenido protegido.
  return <Outlet />;
}