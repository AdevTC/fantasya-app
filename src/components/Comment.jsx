import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '../hooks/useAuth';
import { db } from '../config/firebase';
import { doc, updateDoc, arrayUnion, arrayRemove, collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { Heart, MessageSquare } from 'lucide-react';
import Reply from './Reply';

export default function Comment({ comment, postId }) {
    const { user, profile } = useAuth();
    const [commentData, setCommentData] = useState(comment);
    const { id, authorUsername, authorPhotoURL, content, createdAt, likes } = commentData;
    
    const [showReplyInput, setShowReplyInput] = useState(false);
    const [replyContent, setReplyContent] = useState('');
    const [replies, setReplies] = useState([]);
    const [loadingReplies, setLoadingReplies] = useState(true);

    const isLiked = user ? likes.includes(user.uid) : false;

    // --- LÓGICA DE TIEMPO REAL PARA LIKES DEL COMENTARIO ---
    useEffect(() => {
        const commentRef = doc(db, 'posts', postId, 'comments', id);
        const unsubscribe = onSnapshot(commentRef, (doc) => {
            if (doc.exists()) {
                setCommentData({ id: doc.id, ...doc.data() });
            }
        });
        return () => unsubscribe();
    }, [postId, id]);


    useEffect(() => {
        const repliesRef = collection(db, 'posts', postId, 'comments', id, 'replies');
        const q = query(repliesRef, orderBy('createdAt', 'asc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setReplies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoadingReplies(false);
        });

        return () => unsubscribe();
    }, [postId, id]);

    const handleLikeComment = async () => {
        if (!user) return toast.error("Debes iniciar sesión para dar me gusta.");
        const commentRef = doc(db, 'posts', postId, 'comments', id);
        try {
            await updateDoc(commentRef, {
                likes: isLiked ? arrayRemove(user.uid) : arrayUnion(user.uid)
            });
        } catch (error) {
            console.error("Error al dar like al comentario:", error);
            toast.error("No se pudo procesar el 'Me gusta'.");
        }
    };

    const handleReply = async (e) => {
        e.preventDefault();
        if (replyContent.trim().length < 1) return;
        
        try {
            await addDoc(collection(db, 'posts', postId, 'comments', id, 'replies'), {
                content: replyContent.trim(),
                authorId: user.uid,
                authorUsername: profile.username,
                authorPhotoURL: profile.photoURL || null,
                createdAt: serverTimestamp(),
            });
            setReplyContent('');
            setShowReplyInput(false);
        } catch (error) {
            console.error("Error al responder:", error);
            toast.error("No se pudo enviar la respuesta.");
        }
    };

    return (
        <div className="flex items-start gap-3">
            <Link to={`/profile/${authorUsername}`}>
                <img 
                    src={authorPhotoURL || `https://ui-avatars.com/api/?name=${authorUsername}&background=random`}
                    alt={`Foto de ${authorUsername}`}
                    className="w-8 h-8 rounded-full object-cover"
                />
            </Link>
            <div className="flex-1">
                <div className="bg-gray-100 dark:bg-gray-700 rounded-lg px-4 py-2">
                    <div className="flex items-baseline gap-2">
                        <Link to={`/profile/${authorUsername}`} className="font-bold text-sm text-gray-800 dark:text-gray-200 hover:underline">
                            {authorUsername}
                        </Link>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            {createdAt ? formatDistanceToNow(createdAt.toDate(), { addSuffix: true, locale: es }) : ''}
                        </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{content}</p>
                </div>
                <div className="flex items-center gap-3 mt-1 px-2">
                     <button onClick={handleLikeComment} className={`flex items-center gap-1 text-xs transition-colors ${isLiked ? 'text-red-500 font-bold' : 'text-gray-500 hover:text-red-500'}`}>
                        <Heart size={12} fill={isLiked ? 'currentColor' : 'none'} />
                        <span>{likes.length}</span>
                    </button>
                    <button onClick={() => setShowReplyInput(!showReplyInput)} className="text-xs text-gray-500 hover:text-blue-500 font-semibold">
                        Responder
                    </button>
                </div>
                
                {showReplyInput && (
                    <form onSubmit={handleReply} className="flex items-start gap-2 mt-2">
                        <img 
                            src={profile?.photoURL || `https://ui-avatars.com/api/?name=${profile?.username}&background=random`}
                            alt="Tu foto de perfil"
                            className="w-6 h-6 rounded-full object-cover"
                        />
                        <input
                            type="text"
                            value={replyContent}
                            onChange={e => setReplyContent(e.target.value)}
                            className="input flex-1 !py-1 !px-2 text-sm dark:bg-gray-600"
                            placeholder="Escribe una respuesta..."
                        />
                    </form>
                )}

                {replies.length > 0 && (
                    <div className="mt-3 space-y-3 pl-6 border-l-2 dark:border-gray-700">
                        {replies.map(reply => <Reply key={reply.id} reply={reply}/>)}
                    </div>
                )}
            </div>
        </div>
    );
}