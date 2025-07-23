import React, { useState, useEffect } from 'react';
import { doc, getDoc, getDocs, collection, query, where, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { X, Send } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import { useNavigate } from 'react-router-dom';

export default function RequestJoinModal({ isOpen, onClose, league }) {
    const [admins, setAdmins] = useState([]);
    const [loading, setLoading] = useState(true);
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
        }
    }, [isOpen, league]);

    const startChat = async (targetAdmin) => {
        if (!currentUser || !targetAdmin) return;

        const chatId = [currentUser.uid, targetAdmin.id].sort().join('_');
        const chatRef = doc(db, 'chats', chatId);
        
        try {
            const chatSnap = await getDoc(chatRef);
            if (!chatSnap.exists()) {
                await setDoc(chatRef, {
                    participants: [currentUser.uid, targetAdmin.id],
                    createdAt: serverTimestamp(),
                    lastMessage: ''
                });
            }
            navigate(`/chat/${chatId}`);
            onClose();
        } catch (error) {
            console.error("Error al iniciar el chat:", error);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bento-card w-full max-w-md">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-200">Contactar Administradores</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                        <X size={24} />
                    </button>
                </div>

                {loading ? (
                    <LoadingSpinner text="Buscando admins..." />
                ) : admins.length > 0 ? (
                    <div className="space-y-4">
                        <p className="text-center text-gray-700 dark:text-gray-300">
                            Para unirte a la liga <span className="font-bold">{league.name}</span>, envía un mensaje a uno de sus administradores:
                        </p>
                        <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                           {admins.map(admin => (
                               <button key={admin.id} onClick={() => startChat(admin)} className="w-full flex items-center gap-3 p-3 rounded-lg bg-gray-100 dark:bg-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                                   <img src={admin.photoURL || `https://ui-avatars.com/api/?name=${admin.username}&background=random`} alt={admin.username} className="w-10 h-10 rounded-full object-cover"/>
                                   <span className="font-bold text-gray-800 dark:text-gray-200">{admin.username}</span>
                                   <Send size={16} className="ml-auto text-emerald-500"/>
                               </button>
                           ))}
                        </div>
                    </div>
                ) : (
                    <p className="text-center text-red-500">No se pudo encontrar ningún administrador para esta liga.</p>
                )}

                <div className="flex justify-end mt-8 pt-4 border-t dark:border-gray-700">
                    <button onClick={onClose} className="btn-secondary w-full">
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}