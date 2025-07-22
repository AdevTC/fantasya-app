// src/components/SuperAdminRoute.jsx
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import LoadingSpinner from './LoadingSpinner';

export default function SuperAdminRoute() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner fullScreen text="Verificando permisos..." />;
  }

  // Si no hay usuario, perfil, o el rol no es 'superadmin', redirige al dashboard.
  if (!user || !profile || profile.appRole !== 'superadmin') {
    return <Navigate to="/dashboard" />;
  }

  // Si todas las comprobaciones son correctas, muestra el contenido protegido.
  return <Outlet />;
}