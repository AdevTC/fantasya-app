import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { db } from '../config/firebase';
import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function CompleteProfilePage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const validateUsername = (username) => {
        if (username.length < 3 || username.length > 16) return "Debe tener entre 3 y 16 caracteres.";
        if (!/^[a-z0-9_.]+$/.test(username)) return "Solo minúsculas, números, '_' y '.' permitidos.";
        if (username.startsWith('.') || username.endsWith('.')) return "No puede empezar o acabar con un punto.";
        if (/^\d/.test(username)) return "No puede empezar con un número.";
        return null;
    };

    const handleProfileComplete = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const validationError = validateUsername(username);
        if (validationError) {
            setError(validationError);
            toast.error(validationError);
            setLoading(false);
            return;
        }

        try {
            const usernameRef = doc(db, 'usernames', username);
            const usernameSnap = await getDoc(usernameRef);
            if (usernameSnap.exists()) {
                throw new Error("Este nombre de usuario ya está en uso.");
            }

            const batch = writeBatch(db);
            const userDocRef = doc(db, 'users', user.uid);
            batch.set(userDocRef, { username, email: user.email, createdAt: new Date() });
            batch.set(usernameRef, { uid: user.uid });
            await batch.commit();

            toast.success('¡Perfil completado! Bienvenido a Fantasya.');
            navigate('/dashboard');

        } catch (err) {
            console.error(err);
            setError(err.message);
            toast.error(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-lg p-8 shadow-lg">
                <h2 className="text-2xl font-bold text-gray-800 text-center mb-2">¡Un último paso!</h2>
                <p className="text-center text-gray-600 mb-6">Elige tu nombre de usuario único para toda la aplicación.</p>
                <form onSubmit={handleProfileComplete}>
                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2">Nombre de usuario</label>
                        <input 
                            type="text" 
                            value={username}
                            onChange={(e) => setUsername(e.target.value.toLowerCase())}
                            className="input" 
                            placeholder="ej: pepe_123"
                        />
                         <p className="text-xs text-gray-500 mt-2">De 3 a 16 caracteres. Solo minúsculas, números, '_' y '.'.</p>
                    </div>
                    {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}
                    <button type="submit" disabled={loading} className="w-full btn-primary disabled:opacity-50">
                        {loading ? 'Guardando...' : 'Finalizar Registro'}
                    </button>
                </form>
            </div>
        </div>
    );
}