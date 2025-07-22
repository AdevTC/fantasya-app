import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore'; // <-- CAMBIO: Se importa onSnapshot
import { auth, db } from '../config/firebase';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile = () => {}; // Función para limpiar el listener

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      // Limpiar el listener de perfil anterior al cambiar de usuario
      unsubscribeProfile();

      if (user) {
        setUser(user);
        const userDocRef = doc(db, 'users', user.uid);
        
        // --- LÓGICA DE TIEMPO REAL AÑADIDA ---
        // Ahora escuchamos los cambios en el perfil en tiempo real
        unsubscribeProfile = onSnapshot(userDocRef, (userDocSnap) => {
          if (userDocSnap.exists()) {
            setProfile(userDocSnap.data());
          } else {
            setProfile(null);
          }
          setLoading(false);
        }, (error) => {
            console.error("Error al obtener el perfil en tiempo real:", error);
            setLoading(false);
        });
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeProfile(); // Asegurarse de limpiar ambos listeners
    };
  }, []);

  return { user, profile, loading };
}