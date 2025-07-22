import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Heart, MessageCircle, Trash2, Bookmark } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { db, storage } from '../config/firebase';
import { doc, updateDoc, deleteDoc, arrayUnion, arrayRemove, collection, onSnapshot, query } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import CommentSection from './CommentSection';
import toast from 'react-hot-toast';

export default function Post({ post }) {
    const { user, profile } = useAuth();
    const [postData, setPostData] = useState(post);
    const { id, authorId, authorUsername, authorPhotoURL, content, imageURL, createdAt, likes, tags } = postData;
    
    const [showComments, setShowComments] = useState(false);
    const [commentCount, setCommentCount] = useState(0);
    
    const isLiked = user && likes ? likes.includes(user.uid) : false;
    const isSaved = profile?.savedPosts ? profile.savedPosts.includes(id) : false;
    const canDelete = user?.uid === authorId || profile?.appRole === 'superadmin';

    useEffect(() => {
        const postRef = doc(db, 'posts', id);
        const unsubscribePost = onSnapshot(postRef, (doc) => {
            if (doc.exists()) {
                setPostData({ id: doc.id, ...doc.data() });
            }
        });

        const commentsRef = collection(db, 'posts', id, 'comments');
        const q = query(commentsRef);
        const unsubscribeComments = onSnapshot(q, (snapshot) => {
            setCommentCount(snapshot.size);
        });

        return () => {
            unsubscribePost();
            unsubscribeComments();
        };
    }, [id]);

    const handleLike = async () => {
        if (!user) { toast.error("Debes iniciar sesión para dar me gusta."); return; }
        const postRef = doc(db, 'posts', id);
        await updateDoc(postRef, { likes: isLiked ? arrayRemove(user.uid) : arrayUnion(user.uid) });
    };
    
    const handleSave = async () => {
        if (!user) { toast.error("Debes iniciar sesión para guardar publicaciones."); return; }
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, { savedPosts: isSaved ? arrayRemove(id) : arrayUnion(id) });
    };

    const handleDelete = async () => {
        if (!window.confirm("¿Estás seguro de que quieres eliminar esta publicación?")) return;
        const loadingToast = toast.loading('Eliminando...');
        try {
            if (imageURL) {
                const imageRef = ref(storage, imageURL);
                await deleteObject(imageRef);
            }
            await deleteDoc(doc(db, 'posts', id));
            toast.success('Publicación eliminada', { id: loadingToast });
        } catch (error) {
            toast.error('No se pudo eliminar la publicación.', { id: loadingToast });
        }
    };
    
    return (
        <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6">
            <div className="flex items-start gap-4">
                <Link to={`/profile/${authorUsername}`}>
                     <img 
                        src={authorPhotoURL || `https://ui-avatars.com/api/?name=${authorUsername}&background=random`}
                        alt={`Foto de ${authorUsername}`}
                        className="w-12 h-12 rounded-full object-cover"
                    />
                </Link>
                <div className="flex-1">
                    <div className="flex justify-between items-start">
                        <div>
                            <Link to={`/profile/${authorUsername}`} className="font-bold text-gray-800 dark:text-gray-200 hover:underline">
                                {authorUsername}
                            </Link>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                {createdAt ? formatDistanceToNow(createdAt.toDate(), { addSuffix: true, locale: es }) : 'hace un momento'}
                            </p>
                        </div>
                        {canDelete && (
                            <button onClick={handleDelete} className="text-gray-400 hover:text-red-500">
                                <Trash2 size={16} />
                            </button>
                        )}
                    </div>

                    {content && <p className="mt-2 text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{content}</p>}
                    
                    {imageURL && (
                        <div className="mt-4">
                            <img src={imageURL} alt="Contenido de la publicación" className="rounded-lg max-h-96 w-auto border dark:border-gray-700" />
                        </div>
                    )}

                    {/* --- NUEVA SECCIÓN PARA MOSTRAR ETIQUETAS --- */}
                    {tags && tags.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                            {tags.map(tag => (
                                <Link key={tag} to={`/search?tag=${tag}`} className="text-blue-500 hover:underline text-sm font-semibold">
                                    #{tag}
                                </Link>
                            ))}
                        </div>
                    )}

                    <div className="flex items-center justify-between mt-4">
                        <div className="flex items-center gap-4">
                            <button onClick={handleLike} className={`flex items-center gap-1.5 transition-colors ${isLiked ? 'text-red-500' : 'text-gray-500 hover:text-red-500'}`}>
                                <Heart size={18} fill={isLiked ? 'currentColor' : 'none'} />
                                <span className="text-sm font-semibold">{likes.length}</span>
                            </button>
                            <button onClick={() => setShowComments(!showComments)} className="flex items-center gap-1.5 text-gray-500 hover:text-blue-500 transition-colors">
                                <MessageCircle size={18} />
                                <span className="text-sm font-semibold">{commentCount}</span>
                            </button>
                        </div>
                        <button onClick={handleSave} className={`flex items-center gap-1.5 transition-colors ${isSaved ? 'text-yellow-500' : 'text-gray-500 hover:text-yellow-500'}`}>
                            <Bookmark size={18} fill={isSaved ? 'currentColor' : 'none'}/>
                        </button>
                    </div>
                </div>
            </div>
            {showComments && <CommentSection postId={id} />}
        </div>
    );
}