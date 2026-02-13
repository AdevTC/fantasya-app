import React, { useState, useEffect } from 'react';
import { doc, getDoc, getDocs, collection, query, where, setDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { X, Send, Loader2 } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function RequestJoinModal({ isOpen, onClose, league }) {
    const [admins, setAdmins] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [step, setStep] = useState('select-admin'); // 'select-admin' | 'form'
    const [selectedAdmin, setSelectedAdmin] = useState(null);
    const [teamName, setTeamName] = useState('');
    const [message, setMessage] = useState('');
    const navigate = useNavigate();
    const currentUser = auth.currentUser;

    useEffect(() => {
        if (isOpen && league?.members) {
            const fetchAdmins = async () => {
                setLoading(true);
                const adminIds = Object.keys(league.members).filter(
                    uid => league.members[uid].role === 'admin'
                );

                if (adminIds.length > 0) {
                    const usersRef = collection(db, 'users');
                    const q = query(usersRef, where('__name__', 'in', adminIds));
                    const adminSnaps = await getDocs(q);
                    setAdmins(adminSnaps.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                }
                setLoading(false);
            };
            fetchAdmins();
            // Reset state when modal opens
            setStep('select-admin');
            setSelectedAdmin(null);
            setTeamName('');
            setMessage('');
        }
    }, [isOpen, league]);

    const handleSelectAdmin = (admin) => {
        setSelectedAdmin(admin);
        setStep('form');
    };

    const handleBack = () => {
        setStep('select-admin');
        setSelectedAdmin(null);
    };

    const submitJoinRequest = async (e) => {
        e.preventDefault();

        if (!teamName.trim()) {
            toast.error("El nombre del equipo es obligatorio");
            return;
        }

        if (!currentUser || !selectedAdmin || !league?.activeSeason) {
            toast.error("Faltan datos para crear la solicitud");
            return;
        }

        setSubmitting(true);
        const loadingToast = toast.loading('Enviando solicitud...');

        try {
            // 1. Create or get the chat with admin
            const chatId = [currentUser.uid, selectedAdmin.id].sort().join('_');
            const chatRef = doc(db, 'chats', chatId);
            const chatSnap = await getDoc(chatRef);

            if (!chatSnap.exists()) {
                await setDoc(chatRef, {
                    participants: [currentUser.uid, selectedAdmin.id],
                    createdAt: serverTimestamp(),
                    lastMessage: ''
                });
            }

            // 2. Create the join request document
            const requestRef = await addDoc(
                collection(db, 'leagues', league.id, 'seasons', league.activeSeason, 'joinRequests'),
                {
                    userId: currentUser.uid,
                    username: currentUser.displayName || currentUser.email?.split('@')[0] || 'Usuario',
                    teamName: teamName.trim(),
                    message: message.trim() || '',
                    status: 'pending',
                    createdAt: serverTimestamp(),
                    chatId: chatId,
                    adminId: selectedAdmin.id
                }
            );

            // 3. Send automatic message in the chat
            const autoMessage = `¡Hola! Me gustaría unirme a la liga "${league.name}" con el equipo "${teamName.trim()}"${message.trim() ? `. Mensaje: ${message.trim()}` : ''}`;
            await addDoc(collection(db, 'chats', chatId, 'messages'), {
                senderId: currentUser.uid,
                text: autoMessage,
                createdAt: serverTimestamp(),
                read: false,
                isJoinRequest: true,
                requestId: requestRef.id,
                leagueId: league.id,
                seasonId: league.activeSeason
            });

            // Update chat last message
            await setDoc(chatRef, {
                lastMessage: autoMessage,
                lastMessageAt: serverTimestamp()
            }, { merge: true });

            toast.success('¡Solicitud enviada correctamente!', { id: loadingToast });
            navigate(`/chat/${chatId}`);
            onClose();
        } catch (error) {
            console.error("Error al enviar la solicitud:", error);
            toast.error("Error al enviar la solicitud. Inténtalo de nuevo.", { id: loadingToast });
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bento-card w-full max-w-md">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                        {step === 'select-admin' ? 'Solicitar Unión' : 'Completar Solicitud'}
                    </h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                        <X size={24} />
                    </button>
                </div>

                {loading ? (
                    <LoadingSpinner text="Cargando..." />
                ) : admins.length === 0 ? (
                    <p className="text-center text-red-500">No se pudo encontrar ningún administrador para esta liga.</p>
                ) : step === 'select-admin' ? (
                    <div className="space-y-4">
                        <p className="text-center text-gray-700 dark:text-gray-300">
                            Para unirte a la liga <span className="font-bold">{league.name}</span>, selecciona un administrador para enviar tu solicitud:
                        </p>
                        <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                            {admins.map(admin => (
                                <button
                                    key={admin.id}
                                    onClick={() => handleSelectAdmin(admin)}
                                    className="w-full flex items-center gap-3 p-3 rounded-lg bg-gray-100 dark:bg-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <img
                                        src={admin.photoURL || `https://ui-avatars.com/api/?name=${admin.username}&background=random`}
                                        alt={admin.username}
                                        className="w-10 h-10 rounded-full object-cover"
                                    />
                                    <span className="font-bold text-gray-800 dark:text-gray-200">{admin.username}</span>
                                    <Send size={16} className="ml-auto text-emerald-500"/>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <form onSubmit={submitJoinRequest} className="space-y-4">
                        {/* Show selected admin */}
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800">
                            <img
                                src={selectedAdmin.photoURL || `https://ui-avatars.com/api/?name=${selectedAdmin.username}&background=random`}
                                alt={selectedAdmin.username}
                                className="w-8 h-8 rounded-full object-cover"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">
                                Enviando solicitud a <span className="font-bold">{selectedAdmin.username}</span>
                            </span>
                        </div>

                        {/* Team Name Field */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Nombre de tu equipo <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={teamName}
                                onChange={(e) => setTeamName(e.target.value)}
                                placeholder="Ej: Los Invencibles FC"
                                className="input dark:bg-gray-700 dark:border-gray-600 w-full"
                                maxLength={30}
                                required
                            />
                        </div>

                        {/* Optional Message Field */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Mensaje (opcional)
                            </label>
                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                placeholder="Cuéntale algo al administrador..."
                                className="input dark:bg-gray-700 dark:border-gray-600 w-full min-h-[80px] resize-none"
                                maxLength={200}
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {message.length}/200 caracteres
                            </p>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                onClick={handleBack}
                                disabled={submitting}
                                className="btn-secondary flex-1"
                            >
                                Atrás
                            </button>
                            <button
                                type="submit"
                                disabled={submitting || !teamName.trim()}
                                className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 size={18} className="animate-spin" />
                                        Enviando...
                                    </>
                                ) : (
                                    <>
                                        <Send size={18} />
                                        Enviar Solicitud
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                )}

                {step === 'select-admin' && (
                    <div className="flex justify-end mt-8 pt-4 border-t dark:border-gray-700">
                        <button onClick={onClose} className="btn-secondary w-full">
                            Cancelar
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
