import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail } from 'firebase/auth'; // Added sendPasswordResetEmail
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Mail, Lock, Eye, EyeOff, UserPlus, ArrowLeft } from 'lucide-react'; // Added ArrowLeft
import toast from 'react-hot-toast';

export default function LoginPage() {
    const [isLogin, setIsLogin] = useState(true);
    const [isResetPassword, setIsResetPassword] = useState(false); // New state for reset password mode
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [username, setUsername] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        setError('');
    }, [isLogin, isResetPassword]);

    const handleGoogleSignIn = async () => {
        setLoading(true);
        setError('');
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            
            const userDocRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userDocRef);

            if (!userDoc.exists() || !userDoc.data().username) {
                navigate('/complete-profile');
            } else {
                navigate('/dashboard');
            }
        } catch (error) {
            toast.error(error.message || 'No se pudo iniciar sesión con Google.');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        if (!email) {
            setError('Por favor, introduce tu correo electrónico.');
            setLoading(false);
            return;
        }

        try {
            await sendPasswordResetEmail(auth, email);
            toast.success('Correo de restablecimiento enviado. Revisa tu bandeja de entrada.');
            setIsResetPassword(false); // Go back to login
        } catch (error) {
            console.error(error);
            if (error.code === 'auth/user-not-found') {
                toast.error('No existe ninguna cuenta con este correo.');
            } else {
                toast.error('Error al enviar el correo. Inténtalo de nuevo.');
            }
        } finally {
            setLoading(false);
        }
    };
    
    const handleAuthSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        if (isLogin) {
            // Lógica de Inicio de Sesión
            try {
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                // --- LÓGICA DE FECHA DE CORTE RESTAURADA ---
                const verificationCutoffDate = new Date('2025-07-17T00:00:00Z');
                const userCreationDate = new Date(user.metadata.creationTime);

                if (!user.emailVerified && userCreationDate > verificationCutoffDate) {
                    toast.error('Debes verificar tu correo electrónico para poder iniciar sesión.');
                    await auth.signOut();
                    setLoading(false);
                    return;
                }
                
                toast.success('¡Bienvenido de vuelta!');
                navigate('/dashboard');

            } catch (err) {
                toast.error('Correo o contraseña incorrectos.');
            } finally {
                setLoading(false);
            }
        } else {
            // Lógica de Registro con el nuevo flujo híbrido
            if (password !== confirmPassword) {
                setError('Las contraseñas no coinciden.');
                toast.error('Las contraseñas no coinciden.');
                setLoading(false);
                return;
            }

            try {
                // 1. Crear usuario en Auth (desde el cliente)
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                // 2. Llamar a la Cloud Function para crear los documentos en Firestore
                const functions = getFunctions();
                const createProfileDocuments = httpsCallable(functions, 'createProfileDocuments');
                await createProfileDocuments({ username });
                
                // 3. Enviar correo de verificación (desde el cliente)
                await sendEmailVerification(user);
                
                toast.success('¡Registro completado!');
                toast(
                    (t) => (
                        <span className="text-center">
                            Te hemos enviado un correo. Por favor, <b>revisa tu bandeja de entrada (y spam)</b> para verificar tu cuenta.
                            <button className="w-full mt-2 btn-primary text-sm" onClick={() => toast.dismiss(t.id)}>
                                Entendido
                            </button>
                        </span>
                    ),
                    { duration: 10000, icon: '📧' }
                );

                await auth.signOut();
                setIsLogin(true);
                
            } catch (err) {
                // Borrar el usuario de Auth si la creación del perfil en Firestore falla (ej. nombre de usuario duplicado)
                if (auth.currentUser) {
                    try {
                        await auth.currentUser.delete();
                    } catch (deleteError) {
                        console.error("No se pudo eliminar el usuario de Auth:", deleteError);
                        // El usuario quedará huérfano, pero el flujo continúa
                    }
                }

                if (err.code === 'auth/email-already-in-use') {
                    toast.error('Este correo electrónico ya está en uso.');
                } else if (err.code === 'functions/already-exists' || err.message?.includes('already exists')) {
                    toast.error('Este nombre de usuario ya está cogido.');
                } else if (err.code === 'auth/user-token-expired') {
                    toast.error('La sesión expiró. Por favor, intenta registrarte de nuevo.');
                } else {
                    toast.error(err.message || 'Ha ocurrido un error inesperado.');
                }
                console.error("Error de registro:", err);
            } finally {
                setLoading(false);
            }
        }
    };
    
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4">
            <div className="max-w-md w-full bg-white dark:bg-gray-800 shadow-xl rounded-2xl p-8">
                <div className="text-center mb-8">
                    <div className="flex justify-center mb-4">
                         <img src="/logoFantasya_v0.png" alt="Fantasya Logo" className="w-24 h-24" />
                    </div>
                    <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                        {isResetPassword ? 'Recuperar Contraseña' : (isLogin ? 'Bienvenido de nuevo' : 'Crea tu cuenta')}
                    </h2>
                    <p className="text-gray-500 dark:text-gray-400 mt-2">
                        {isResetPassword 
                            ? 'Introduce tu correo para recibir un enlace de recuperación' 
                            : (isLogin ? 'Inicia sesión para continuar' : 'Únete a la comunidad de mánagers')}
                    </p>
                </div>

                {isResetPassword ? (
                    <form onSubmit={handleResetPassword} className="space-y-6">
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                            <input
                                type="email"
                                placeholder="Correo electrónico"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="input pl-10"
                            />
                        </div>
                        {error && <p className="text-sm text-red-500 text-center">{error}</p>}
                        
                        <button type="submit" disabled={loading} className="w-full btn-primary">
                            {loading ? 'Enviando...' : 'Enviar enlace de recuperación'}
                        </button>

                        <button 
                            type="button" 
                            onClick={() => setIsResetPassword(false)} 
                            className="w-full text-center text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center justify-center gap-2"
                        >
                            <ArrowLeft size={16} /> Volver al inicio de sesión
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleAuthSubmit} className="space-y-6">
                        {!isLogin && (
                             <div className="relative">
                                <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                <input
                                    type="text"
                                    placeholder="Nombre de usuario"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    required
                                    className="input pl-10"
                                />
                            </div>
                        )}
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                            <input
                                type="email"
                                placeholder="Correo electrónico"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="input pl-10"
                            />
                        </div>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Contraseña"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="input pl-10"
                            />
                             <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                        </div>
                        {!isLogin && (
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="Confirmar contraseña"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    className="input pl-10"
                                />
                            </div>
                        )}
                        
                        {isLogin && (
                            <div className="text-right">
                                <button 
                                    type="button"
                                    onClick={() => setIsResetPassword(true)}
                                    className="text-sm text-emerald-600 hover:text-emerald-500 font-medium"
                                >
                                    ¿Olvidaste tu contraseña?
                                </button>
                            </div>
                        )}

                        {error && <p className="text-sm text-red-500 text-center">{error}</p>}

                        <div>
                            <button type="submit" disabled={loading} className="w-full btn-primary">
                                {loading ? 'Cargando...' : (isLogin ? 'Iniciar Sesión' : 'Registrarse')}
                            </button>
                        </div>
                    </form>
                )}

                {!isResetPassword && (
                    <div className="mt-6">
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-gray-300 dark:border-gray-600" />
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">O</span>
                            </div>
                        </div>
                        <div className="mt-6">
                            <button onClick={handleGoogleSignIn} disabled={loading} className="w-full btn-secondary flex items-center justify-center">
                                <svg className="w-5 h-5 mr-2" viewBox="0 0 48 48">
                                    <path fill="#4285F4" d="M24 9.5c3.2 0 6.1 1.1 8.4 3.2l6.3-6.3C34.9 2.8 29.8 1 24 1 14.9 1 7.4 6.6 4.1 14.5l7.9 6.2C13.6 13.5 18.4 9.5 24 9.5z"></path>
                                    <path fill="#34A853" d="M46.2 25.4c0-1.7-.2-3.4-.5-5H24v9.3h12.5c-.5 3-2.1 5.6-4.5 7.3l7.4 5.7c4.3-4 6.8-9.8 6.8-16.3z"></path>
                                    <path fill="#FBBC05" d="M12 20.7C11.5 19.2 11.2 17.6 11.2 16S11.5 12.8 12 11.3l-7.9-6.2C1.5 10.5 0 15.1 0 20s1.5 9.5 4.1 14.9l7.9-6.2z"></path>
                                    <path fill="#EA4335" d="M24 47c5.8 0 10.9-1.9 14.5-5.2l-7.4-5.7c-1.9 1.3-4.3 2.1-7.1 2.1-5.6 0-10.4-4-12.2-9.5l-7.9 6.2C7.4 41.4 14.9 47 24 47z"></path>
                                    <path fill="none" d="M0 0h48v48H0z"></path>
                                </svg>
                                Continuar con Google
                            </button>
                        </div>
                    </div>
                )}

                {!isResetPassword && (
                    <p className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
                        {isLogin ? '¿No tienes cuenta?' : '¿Ya tienes una cuenta?'}
                        <button onClick={() => setIsLogin(!isLogin)} className="font-semibold text-emerald-600 hover:text-emerald-500 ml-1">
                            {isLogin ? 'Regístrate' : 'Inicia Sesión'}
                        </button>
                    </p>
                )}
            </div>
        </div>
    );
}