import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { db } from '../config/firebase';
import { collection, query, where, onSnapshot, getDocs, doc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

const ChatListItem = ({ chat }) => {
    const { user: currentUser } = useAuth();
    const [partner, setPartner] = useState(null);

    useEffect(() => {
        // --- CORRECCIÓN AQUÍ ---
        // Se añade una guarda para asegurar que currentUser no sea nulo
        if (!currentUser) return; 

        const partnerId = chat.participants.find(p => p !== currentUser.uid);
        if (partnerId) {
            const unsub = onSnapshot(doc(db, 'users', partnerId), (doc) => {
                setPartner({ id: doc.id, ...doc.data() });
            });
            return () => unsub();
        }
    }, [chat, currentUser]);

    if (!partner) return null;

    return (
        <Link to={`/chat/${chat.id}`} className="block p-4 bento-card hover:border-emerald-500 transition-colors">
            <div className="flex items-center gap-4">
                <img 
                    src={partner.photoURL || `https://ui-avatars.com/api/?name=${partner.username}&background=random`}
                    alt={partner.username}
                    className="w-14 h-14 rounded-full object-cover"
                />
                <div className="flex-1">
                    <div className="flex justify-between items-start">
                        <h3 className="font-bold text-gray-800 dark:text-gray-200">{partner.username}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            {chat.lastMessageTimestamp ? formatDistanceToNow(chat.lastMessageTimestamp.toDate(), { addSuffix: true, locale: es }) : ''}
                        </p>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 truncate mt-1">
                        {chat.lastMessage || 'Inicia la conversación...'}
                    </p>
                </div>
            </div>
        </Link>
    );
};


export default function ChatListPage() {
    const { user } = useAuth();
    const [chats, setChats] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        setLoading(true);
        const chatsRef = collection(db, 'chats');
        const q = query(chatsRef, where('participants', 'array-contains', user.uid));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const chatsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            chatsData.sort((a, b) => (b.lastMessageTimestamp?.toDate() || 0) - (a.lastMessageTimestamp?.toDate() || 0));
            setChats(chatsData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    return (
        <div className="p-4 sm:p-6 md:p-8 max-w-3xl mx-auto">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-200 mb-8">Mis Chats</h1>
            {loading ? (
                <LoadingSpinner text="Cargando conversaciones..." />
            ) : chats.length > 0 ? (
                <div className="space-y-4">
                    {chats.map(chat => <ChatListItem key={chat.id} chat={chat} />)}
                </div>
            ) : (
                <div className="bento-card text-center p-12">
                     <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300">No tienes conversaciones</h3>
                    <p className="text-gray-500 dark:text-gray-400 mt-2">Busca a otros mánagers en la app para iniciar un chat.</p>
                </div>
            )}
        </div>
    );
}