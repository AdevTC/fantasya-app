import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { auth } from '../config/firebase';
import { sendEmailVerification } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { createProfile } from '../services/admin-api';
import {
    getUsernameValidationError,
    normalizeUsername,
} from '../config/username';
import { requiresEmailVerification } from '../config/email-verification';

export default function CompleteProfilePage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleProfileComplete = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const validationError = getUsernameValidationError(username);
        if (validationError) {
            setError(validationError);
            toast.error(validationError);
            setLoading(false);
            return;
        }

        try {
            await createProfile(normalizeUsername(username));

            toast.success('¡Perfil completado! Bienvenido a Fantasya.');
            if (requiresEmailVerification(user)) {
                try {
                    await sendEmailVerification(user);
                    toast.success('Te hemos enviado el correo de verificación.');
                    await auth.signOut();
                } catch (verificationError) {
                    console.error(verificationError);
                    toast.error(
                        'El perfil está guardado. Reintenta el correo desde la pantalla de acceso.',
                    );
                }
                navigate('/login');
                return;
            }
            navigate('/dashboard');

        } catch (err) {
            console.error(err);
            const message = err.code === 'functions/already-exists'
                ? 'Este nombre de usuario ya está en uso.'
                : (err.message || 'No se pudo completar el perfil.');
            setError(message);
            toast.error(message);
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
