import React, { useState } from 'react';
import { GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification } from 'firebase/auth';
import { auth, db } from '../config/firebase';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, writeBatch, query, collection, where, getDocs } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { FaFutbol } from 'react-icons/fa';
import { Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
    const navigate = useNavigate();
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [username, setUsername] = useState('');
    const [loginIdentifier, setLoginIdentifier] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const validateUsername = (username) => {
        if (username.length < 3 || username.length > 16) return "El nombre de usuario debe tener entre 3 y 16 caracteres.";
        if (!/^[a-z0-9_.]+$/.test(username)) return "Solo se permiten letras minúsculas del alfabeto inglés, números, '_' y '.'";
        if (username.startsWith('.') || username.endsWith('.')) return "No puede empezar o acabar con un punto.";
        if (username.includes('..')) return "No puede contener dos puntos seguidos.";
        if (/^\d/.test(username)) return "No puede empezar con un número.";
        return null;
    };

    const validatePassword = (password) => {
        if (password.length < 8 || password.length > 24) return "La contraseña debe tener entre 8 y 24 caracteres.";
        if (!/[a-z]/.test(password)) return "Debe contener al menos una letra minúscula.";
        if (!/[A-Z]/.test(password)) return "Debe contener al menos una letra mayúscula.";
        if (!/\d/.test(password)) return "Debe contener al menos un número.";
        if (!/[@$!%*?&]/.test(password)) return "Debe contener al menos un símbolo (@, $, !, %, *, ?, &).";
        return null;
    };

    const handlePasswordReset = async () => {
        if (!loginIdentifier) {
            toast.error("Por favor, introduce tu email en el campo 'Email o Nombre de Usuario' para restablecer la contraseña.");
            return;
        }
        if (!loginIdentifier.includes('@')) {
            toast.error("El restablecimiento de contraseña solo funciona con el email, no con el nombre de usuario.");
            return;
        }
        setLoading(true);
        try {
            await sendPasswordResetEmail(auth, loginIdentifier);
            toast.success("Se ha enviado un correo para restablecer tu contraseña.");
        } catch (error) {
            toast.error("No se pudo enviar el correo. Asegúrate de que el email es correcto y está registrado.");
        }
        setLoading(false);
    };

    const handleAuthSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        if (!isLogin) { // Lógica de Registro
            const passwordError = validatePassword(password);
            if (passwordError) {
                setError(passwordError);
                toast.error(passwordError);
                setLoading(false);
                return;
            }

            if (password !== confirmPassword) {
                const err = "Las contraseñas no coinciden.";
                setError(err);
                toast.error(err);
                setLoading(false);
                return;
            }

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
                
                await sendEmailVerification(user);

                const batch = writeBatch(db);
                const userDocRef = doc(db, 'users', user.uid);
                batch.set(userDocRef, { 
                    username, 
                    email, 
                    createdAt: new Date(),
                    followers: [],
                    following: [],
                    xp: 0, // Inicia el XP en 0
                });
                batch.set(usernameRef, { uid: user.uid });
                
                await batch.commit();
                toast.success('¡Cuenta creada! Revisa tu correo para verificar tu cuenta.');
                navigate('/login');

            } catch (error) {
                const friendlyError = error.code.includes('email-already-in-use') ? 'Este correo ya está registrado.' : 'Error al crear la cuenta.';
                setError(friendlyError);
                toast.error(friendlyError);
            }
        
        } else { // Lógica de Login
            try {
                let userEmail = loginIdentifier.toLowerCase();
                if (!loginIdentifier.includes('@')) {
                    const q = query(collection(db, "users"), where("username", "==", loginIdentifier));
                    const querySnapshot = await getDocs(q);
                    if (!querySnapshot.empty) {
                        userEmail = querySnapshot.docs[0].data().email;
                    } else {
                        throw new Error("User not found");
                    }
                }

                const userCredential = await signInWithEmailAndPassword(auth, userEmail, password);
                const user = userCredential.user;
                
                const verificationCutoffDate = new Date('2025-07-17T00:00:00Z');
                const userCreationDate = new Date(user.metadata.creationTime);

                if (!user.emailVerified && userCreationDate > verificationCutoffDate) {
                    toast.error('Debes verificar tu correo electrónico para iniciar sesión.');
                    await auth.signOut();
                    setLoading(false);
                    return;
                }
                
                toast.success('¡Bienvenido de nuevo!');
                navigate('/dashboard');

            } catch (error) {
                const friendlyError = 'Usuario o contraseña incorrectos.';
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
                        <label className="block text-white/80 text-sm font-bold mb-2">{isLogin ? 'Email o Nombre de Usuario' : 'Email'}</label>
                        <input 
                            type="text"
                            value={isLogin ? loginIdentifier : email} 
                            onChange={(e) => isLogin ? setLoginIdentifier(e.target.value) : setEmail(e.target.value)} 
                            className="input" 
                            placeholder={isLogin ? "tu@email.com o tu_usuario" : "tu@email.com"}
                            autoCapitalize="none"
                        />
                    </div>
                    <div className="mb-1 relative">
                        <label className="block text-white/80 text-sm font-bold mb-2">Contraseña</label>
                        <input 
                            type={showPassword ? "text" : "password"} 
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)} 
                            className="input" 
                            placeholder="••••••••"
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 top-7 pr-3 flex items-center text-sm leading-5">
                            {showPassword ? <EyeOff className="h-5 w-5 text-gray-500" /> : <Eye className="h-5 w-5 text-gray-500" />}
                        </button>
                    </div>
                    {isLogin && (
                        <div className="text-right mb-4">
                            <button type="button" onClick={handlePasswordReset} className="text-sm text-emerald-300 hover:text-emerald-200">
                                ¿Olvidaste la contraseña?
                            </button>
                        </div>
                    )}
                    {!isLogin && (
                        <div className="mb-6 relative">
                            <label className="block text-white/80 text-sm font-bold mb-2">Confirmar Contraseña</label>
                            <input 
                                type={showPassword ? "text" : "password"}
                                value={confirmPassword} 
                                onChange={(e) => setConfirmPassword(e.target.value)} 
                                className="input" 
                                placeholder="••••••••"
                            />
                        </div>
                    )}
                    
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