import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { db, storage } from '../config/firebase';
import { doc, getDoc, collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import LoadingSpinner from '../components/LoadingSpinner';
import { Send, ArrowLeft, Image as ImageIcon, X } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const Message = ({ message, isSender }) => (
    <div className={`flex w-full ${isSender ? 'justify-end' : 'justify-start'}`}>
        <div className={`flex flex-col max-w-xs md:max-w-md lg:max-w-lg ${isSender ? 'items-end' : 'items-start'}`}>
            <div className={`px-4 py-2 rounded-2xl ${isSender ? 'bg-emerald-500 text-white rounded-br-none' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-bl-none'}`}>
                {message.imageUrl && (
                    <img src={message.imageUrl} alt="Imagen adjunta" className="rounded-lg max-w-full h-auto mb-2" />
                )}
                {message.text && (
                    <p className="whitespace-pre-wrap">{message.text}</p>
                )}
            </div>
            <p className={`text-xs mt-1 px-2 ${isSender ? 'text-gray-400' : 'text-gray-500'}`}>
                {message.createdAt ? format(message.createdAt.toDate(), 'HH:mm') : ''}
            </p>
        </div>
    </div>
);


export default function ChatPage() {
    const { chatId } = useParams();
    const { user: currentUser, profile: currentUserProfile } = useAuth();
    const [chatPartner, setChatPartner] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [loading, setLoading] = useState(true);
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);

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
        
        const currentMessage = newMessage;
        const currentImageFile = imageFile;
        setNewMessage('');
        setImageFile(null);
        setImagePreview(null);

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
    };

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
                        <Message key={msg.id} message={msg} isSender={msg.senderId === currentUser.uid} />
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