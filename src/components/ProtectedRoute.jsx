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

  // Si no está cargando y no hay usuario, redirige a /login
  if (!user) {
    return <Navigate to="/login" />;
  }

  // Si hay un usuario, muestra el contenido de la ruta protegida
  return <Outlet />;
}