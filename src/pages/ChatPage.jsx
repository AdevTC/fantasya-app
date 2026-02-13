import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { db, storage } from '../config/firebase';
import { doc, getDoc, collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, updateDoc, writeBatch, getDocs, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import LoadingSpinner from '../components/LoadingSpinner';
import { Send, ArrowLeft, Image as ImageIcon, X, Check, XCircle, UserPlus, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import toast from 'react-hot-toast';

const Message = ({ message, isSender, onRequestAction, processingRequestId, isAdmin }) => {
    const isJoinRequest = message.isJoinRequest;
    const isProcessing = processingRequestId === message.requestId;

    return (
        <div className={`flex w-full ${isSender ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex flex-col max-w-xs md:max-w-md lg:max-w-lg ${isSender ? 'items-end' : 'items-start'}`}>
                <div className={`px-4 py-2 rounded-2xl ${
                    isJoinRequest
                        ? 'bg-emerald-50 dark:bg-emerald-900/30 border-2 border-emerald-200 dark:border-emerald-700 text-gray-800 dark:text-gray-200'
                        : isSender
                            ? 'bg-emerald-500 text-white rounded-br-none'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-none'
                }`}>
                    {message.imageUrl && (
                        <img src={message.imageUrl} alt="Imagen adjunta" className="rounded-lg max-w-full h-auto mb-2" />
                    )}
                    {message.text && (
                        <p className="whitespace-pre-wrap">{message.text}</p>
                    )}

                    {/* Join Request Actions */}
                    {isJoinRequest && isAdmin && message.requestStatus !== 'approved' && message.requestStatus !== 'rejected' && (
                        <div className="mt-3 pt-3 border-t border-emerald-200 dark:border-emerald-700 flex gap-2">
                            <button
                                onClick={() => onRequestAction(message, 'approve')}
                                disabled={isProcessing}
                                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                            >
                                {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                Aprobar
                            </button>
                            <button
                                onClick={() => onRequestAction(message, 'reject')}
                                disabled={isProcessing}
                                className="flex items-center gap-1 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
                            >
                                {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                                Rechazar
                            </button>
                        </div>
                    )}

                    {/* Show status if already processed */}
                    {isJoinRequest && (message.requestStatus === 'approved' || message.requestStatus === 'rejected') && (
                        <div className={`mt-2 pt-2 border-t border-emerald-200 dark:border-emerald-700 text-xs font-semibold ${
                            message.requestStatus === 'approved' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
                        }`}>
                            {message.requestStatus === 'approved' ? '✓ Solicitud aprobada' : '✗ Solicitud rechazada'}
                        </div>
                    )}
                </div>
                <p className={`text-xs mt-1 px-2 ${isSender ? 'text-gray-400' : 'text-gray-500'}`}>
                    {message.createdAt ? format(message.createdAt.toDate(), 'HH:mm') : ''}
                </p>
            </div>
        </div>
    );
};


export default function ChatPage() {
    const { chatId } = useParams();
    const { user: currentUser, profile: currentUserProfile } = useAuth();
    const [chatPartner, setChatPartner] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [processingRequestId, setProcessingRequestId] = useState(null);
    const [adminLeagues, setAdminLeagues] = useState({});
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);

    // Fetch leagues where current user is admin
    useEffect(() => {
        if (!currentUser) return;

        const fetchAdminLeagues = async () => {
            const leaguesRef = collection(db, 'leagues');
            const leaguesSnap = await getDocs(leaguesRef);

            const adminData = {};
            for (const leagueDoc of leaguesSnap.docs) {
                const seasonsRef = collection(db, 'leagues', leagueDoc.id, 'seasons');
                const seasonsSnap = await getDocs(seasonsRef);

                for (const seasonDoc of seasonsSnap.docs) {
                    const members = seasonDoc.data().members || {};
                    if (members[currentUser.uid]?.role === 'admin') {
                        adminData[`${leagueDoc.id}_${seasonDoc.id}`] = {
                            leagueId: leagueDoc.id,
                            seasonId: seasonDoc.id,
                            leagueName: leagueDoc.data().name,
                            seasonName: seasonDoc.data().name
                        };
                    }
                }
            }
            setAdminLeagues(adminData);
        };

        fetchAdminLeagues();
    }, [currentUser]);

    useEffect(() => {
        if (!chatId || !currentUser) return;

        const fetchChatData = async () => {
            setLoading(true);
            const chatRef = doc(db, 'chats', chatId);
            const chatSnap = await getDoc(chatRef);

            if (chatSnap.exists()) {
                const chatData = chatSnap.data();
                const partnerId = chatData.participants.find(id => id !== currentUser.uid);

                if (partnerId) {
                    const userRef = doc(db, 'users', partnerId);
                    const userSnap = await getDoc(userRef);
                    if (userSnap.exists()) {
                        setChatPartner(userSnap.data());
                    }
                }
            }
            setLoading(false);
        };

        fetchChatData();

        const messagesRef = collection(db, 'chats', chatId, 'messages');
        const q = query(messagesRef, orderBy('createdAt', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        return () => unsubscribe();
    }, [chatId, currentUser]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (newMessage.trim() === '' && !imageFile) return;
        if (!currentUser || !currentUserProfile) {
            toast.error("Usuario no autenticado o perfil no cargado");
            return;
        }

        const currentMessage = newMessage;
        const currentImageFile = imageFile;
        setNewMessage('');
        setImageFile(null);
        setImagePreview(null);

        try {
            let imageUrl = null;
            if (currentImageFile) {
                const imageRef = ref(storage, `chats/${chatId}/${Date.now()}_${currentImageFile.name}`);
                await uploadBytes(imageRef, currentImageFile);
                imageUrl = await getDownloadURL(imageRef);
            }

            const messagesRef = collection(db, 'chats', chatId, 'messages');
            const messageData = {
                text: currentMessage.trim(),
                senderId: currentUser.uid,
                senderUsername: currentUserProfile.username,
                createdAt: serverTimestamp(),
                imageUrl: imageUrl
            };
            await addDoc(messagesRef, messageData);

            const chatRef = doc(db, 'chats', chatId);
            await updateDoc(chatRef, {
                lastMessage: imageUrl ? '📷 Imagen' : currentMessage.trim(),
                lastMessageTimestamp: serverTimestamp()
            });
        } catch (error) {
            console.error("Error al enviar mensaje:", error);
            toast.error("No se pudo enviar el mensaje");
            setNewMessage(currentMessage);
            setImageFile(currentImageFile);
            if (currentImageFile) {
                setImagePreview(URL.createObjectURL(currentImageFile));
            }
        }
    };

    const handleRequestAction = async (message, action) => {
        if (!message.leagueId || !message.seasonId || !message.requestId) {
            toast.error('Datos de solicitud incompletos');
            return;
        }

        // Check if user is admin of this league
        const key = `${message.leagueId}_${message.seasonId}`;
        if (!adminLeagues[key]) {
            toast.error('No tienes permisos para esta acción');
            return;
        }

        setProcessingRequestId(message.requestId);
        const loadingToast = toast.loading(action === 'approve' ? 'Aprobando solicitud...' : 'Rechazando solicitud...');

        try {
            // Get the join request to verify it's still pending
            const requestRef = doc(db, 'leagues', message.leagueId, 'seasons', message.seasonId, 'joinRequests', message.requestId);
            const requestSnap = await getDoc(requestRef);

            if (!requestSnap.exists()) {
                toast.error('La solicitud ya no existe', { id: loadingToast });
                setProcessingRequestId(null);
                return;
            }

            const requestData = requestSnap.data();
            if (requestData.status !== 'pending') {
                toast.error('Esta solicitud ya ha sido procesada', { id: loadingToast });
                setProcessingRequestId(null);
                return;
            }

            if (action === 'approve') {
                const batch = writeBatch(db);

                // Update request status
                batch.update(requestRef, {
                    status: 'approved',
                    reviewedAt: serverTimestamp(),
                    reviewedBy: currentUser.uid
                });

                // Add user to members
                const seasonRef = doc(db, 'leagues', message.leagueId, 'seasons', message.seasonId);
                batch.update(seasonRef, {
                    [`members.${requestData.userId}`]: {
                        teamName: requestData.teamName,
                        username: requestData.username,
                        role: 'member',
                        totalPoints: 0,
                        finances: { budget: 200, teamValue: 0 }
                    }
                });

                await batch.commit();

                // Send notification message
                const notificationMessage = `¡Felicidades! Tu solicitud para unirte a la liga ha sido aprobada. Bienvenido "${requestData.teamName}"!`;
                await addDoc(collection(db, 'chats', chatId, 'messages'), {
                    senderId: currentUser.uid,
                    text: notificationMessage,
                    createdAt: serverTimestamp(),
                    read: false,
                    isSystemMessage: true,
                    relatedRequestId: message.requestId
                });

                toast.success(`¡${requestData.username} ha sido aprobado!`, { id: loadingToast });
            } else {
                // Reject
                await updateDoc(requestRef, {
                    status: 'rejected',
                    reviewedAt: serverTimestamp(),
                    reviewedBy: currentUser.uid
                });

                // Send notification message
                const notificationMessage = `Lo sentimos, tu solicitud para unirte a la liga con el equipo "${requestData.teamName}" ha sido rechazada.`;
                await addDoc(collection(db, 'chats', chatId, 'messages'), {
                    senderId: currentUser.uid,
                    text: notificationMessage,
                    createdAt: serverTimestamp(),
                    read: false,
                    isSystemMessage: true,
                    relatedRequestId: message.requestId
                });

                toast.success('Solicitud rechazada.', { id: loadingToast });
            }

            // Update the message to show the new status
            const messageRef = doc(db, 'chats', chatId, 'messages', message.id);
            await updateDoc(messageRef, {
                requestStatus: action === 'approve' ? 'approved' : 'rejected'
            });

        } catch (error) {
            console.error("Error processing request:", error);
            toast.error('Error al procesar la solicitud.', { id: loadingToast });
        } finally {
            setProcessingRequestId(null);
        }
    };

    // Check if current user is admin for any league mentioned in join requests
    const isAdminForRequest = (message) => {
        if (!message.isJoinRequest || !message.leagueId || !message.seasonId) return false;
        const key = `${message.leagueId}_${message.seasonId}`;
        return !!adminLeagues[key];
    };

    // Fetch request status for join request messages
    useEffect(() => {
        const fetchRequestStatuses = async () => {
            if (messages.length === 0) return;

            const joinRequestMessages = messages.filter(m => m.isJoinRequest && m.requestId && m.leagueId && m.seasonId);
            if (joinRequestMessages.length === 0) return;

            const updatedMessages = [...messages];

            for (const msg of joinRequestMessages) {
                if (msg.requestStatus) continue; // Already has status

                try {
                    const requestRef = doc(db, 'leagues', msg.leagueId, 'seasons', msg.seasonId, 'joinRequests', msg.requestId);
                    const requestSnap = await getDoc(requestRef);

                    if (requestSnap.exists()) {
                        const idx = updatedMessages.findIndex(m => m.id === msg.id);
                        if (idx !== -1) {
                            updatedMessages[idx] = {
                                ...updatedMessages[idx],
                                requestStatus: requestSnap.data().status
                            };
                        }
                    }
                } catch (error) {
                    console.error("Error fetching request status:", error);
                }
            }

            setMessages(updatedMessages);
        };

        fetchRequestStatuses();
    }, [messages.filter(m => m.isJoinRequest).map(m => m.id).join(',')]);

    if (loading) return <LoadingSpinner fullScreen />;

    return (
        <div className="flex flex-col h-[100dvh] bg-gray-50 dark:bg-gray-900">
            <header className="flex-shrink-0 bg-white dark:bg-gray-800/50 backdrop-blur-sm shadow-sm border-b dark:border-gray-700 z-10">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-4">
                    <Link to="/chats" className="p-2 -ml-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                        <ArrowLeft />
                    </Link>
                    {chatPartner && (
                        <Link to={`/profile/${chatPartner.username}`} className="flex items-center gap-3 group">
                            <img src={chatPartner.photoURL || `https://ui-avatars.com/api/?name=${chatPartner.username}&background=random`} alt={chatPartner.username} className="w-10 h-10 rounded-full object-cover"/>
                            <h1 className="text-xl font-bold text-gray-800 dark:text-gray-200 group-hover:text-emerald-500 transition-colors">{chatPartner.username}</h1>
                        </Link>
                    )}
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-4">
                <div className="max-w-4xl mx-auto space-y-4">
                    {messages.map(msg => (
                        <Message
                            key={msg.id}
                            message={msg}
                            isSender={msg.senderId === currentUser.uid}
                            onRequestAction={handleRequestAction}
                            processingRequestId={processingRequestId}
                            isAdmin={isAdminForRequest(msg)}
                        />
                    ))}
                    <div ref={messagesEndRef} />
                </div>
            </main>

            <footer className="flex-shrink-0 bg-white dark:bg-gray-800 border-t dark:border-gray-700">
                <div className="max-w-4xl mx-auto p-2 sm:p-4">
                    {imagePreview && (
                        <div className="relative w-24 h-24 p-2">
                            <img src={imagePreview} alt="Vista previa" className="w-full h-full object-cover rounded-lg" />
                             <button
                                type="button"
                                onClick={() => { setImageFile(null); setImagePreview(null); }}
                                className="absolute top-0 right-0 bg-black/50 p-1 rounded-full text-white hover:bg-black/75"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    )}
                    <form onSubmit={handleSendMessage} className="flex items-center gap-2 sm:gap-4">
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageChange} />
                        <button type="button" onClick={() => fileInputRef.current.click()} className="p-3 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                            <ImageIcon />
                        </button>
                        <input
                            type="text"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            className="input flex-1 !py-3"
                            placeholder="Escribe un mensaje..."
                        />
                        <button type="submit" className="btn-primary p-3 rounded-full">
                            <Send />
                        </button>
                    </form>
                </div>
            </footer>
        </div>
    );
}
