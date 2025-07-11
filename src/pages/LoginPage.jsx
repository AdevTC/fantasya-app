import React, { useState } from 'react';
import { GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../config/firebase';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, writeBatch } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { FaFutbol } from 'react-icons/fa';

export default function LoginPage() {
    const navigate = useNavigate();
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const validateUsername = (username) => {
        if (username.length < 3 || username.length > 16) return "El nombre de usuario debe tener entre 3 y 16 caracteres.";
        if (!/^[a-z0-9_.]+$/.test(username)) return "Solo minúsculas, números, '_' y '.' permitidos.";
        if (username.startsWith('.') || username.endsWith('.')) return "No puede empezar o acabar con un punto.";
        if (/^\d/.test(username)) return "No puede empezar con un número.";
        return null;
    };

    const handleAuthSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        if (!isLogin) { // Lógica de Registro
            const validationError = validateUsername(username);
            if (validationError) {
                setError(validationError);
                toast.error(validationError);
                setLoading(false);
                return;
            }

            const usernameRef = doc(db, 'usernames', username);
            const usernameSnap = await getDoc(usernameRef);
            if (usernameSnap.exists()) {
                const err = "Este nombre de usuario ya está en uso.";
                setError(err);
                toast.error(err);
                setLoading(false);
                return;
            }

            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                const batch = writeBatch(db);
                const userDocRef = doc(db, 'users', user.uid);
                batch.set(userDocRef, { username, email, createdAt: new Date() });
                batch.set(usernameRef, { uid: user.uid });
                
                await batch.commit();
                toast.success('¡Cuenta creada con éxito!');
                navigate('/dashboard');

            } catch (error) {
                const friendlyError = error.code.includes('email-already-in-use') ? 'Este correo ya está registrado.' : 'Error al crear la cuenta.';
                setError(friendlyError);
                toast.error(friendlyError);
            }
        
        } else { // Lógica de Login
            try {
                await signInWithEmailAndPassword(auth, email, password);
                toast.success('¡Bienvenido de nuevo!');
                navigate('/dashboard');
            } catch (error) {
                const friendlyError = 'Email o contraseña incorrectos.';
                setError(friendlyError);
                toast.error(friendlyError);
            }
        }
        setLoading(false);
    };

    const handleGoogleLogin = async () => {
        setLoading(true);
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            const user = result.user;

            const userDocRef = doc(db, 'users', user.uid);
            const docSnap = await getDoc(userDocRef);

            if (docSnap.exists()) {
                toast.success('¡Bienvenido de nuevo!');
                navigate('/dashboard');
            } else {
                toast('¡Hola! Un último paso para completar tu registro.');
                navigate('/complete-profile');
            }
        } catch (error) {
            console.error(error);
            toast.error("No se pudo iniciar sesión con Google.");
        }
        setLoading(false);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-deep-blue via-vibrant-purple to-emerald flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md bg-white/20 backdrop-blur-md rounded-2xl p-8 border border-white/30">
                <div className="flex justify-center items-center space-x-3 mb-6">
                    <div className="w-12 h-12 bg-gradient-to-r from-emerald to-vibrant-purple rounded-xl flex items-center justify-center">
                        <FaFutbol className="text-white text-2xl" />
                    </div>
                    <h1 className="text-3xl font-bold text-white">Fantasya</h1>
                </div>

                <h2 className="text-2xl font-bold text-white text-center mb-4">{isLogin ? 'Iniciar Sesión' : 'Crear Cuenta'}</h2>
                
                <form onSubmit={handleAuthSubmit}>
                    {!isLogin && (
                        <div className="mb-4">
                            <label className="block text-white/80 text-sm font-bold mb-2">Nombre de usuario</label>
                            <input 
                                type="text" 
                                value={username}
                                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                                className="input" 
                                placeholder="ej: pepe_123"
                            />
                        </div>
                    )}
                    <div className="mb-4">
                        <label className="block text-white/80 text-sm font-bold mb-2">Email</label>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="tu@email.com"/>
                    </div>
                    <div className="mb-6">
                        <label className="block text-white/80 text-sm font-bold mb-2">Contraseña</label>
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" placeholder="••••••••"/>
                    </div>
                    
                    {error && <p className="text-red-400 text-sm mb-4 text-center">{error}</p>}
                    
                    <button type="submit" disabled={loading} className="w-full btn-primary disabled:opacity-50">
                        {loading ? 'Cargando...' : (isLogin ? 'Iniciar Sesión' : 'Crear Cuenta')}
                    </button>
                </form>

                <div className="text-center my-4"><span className="text-white/60">o</span></div>
                <button onClick={handleGoogleLogin} disabled={loading} className="w-full bg-white/90 hover:bg-white text-deep-blue font-bold py-3 px-4 rounded-lg flex items-center justify-center disabled:opacity-50">Continuar con Google</button>
                <div className="text-center mt-4">
                    <span className="text-white/80">{isLogin ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}</span>
                    <button onClick={() => { setIsLogin(!isLogin); setError(''); }} className="text-emerald-400 hover:text-emerald-300 font-semibold">
                        {isLogin ? 'Regístrate' : 'Inicia sesión'}
                    </button>
                </div>
            </div>
        </div>
      );
}