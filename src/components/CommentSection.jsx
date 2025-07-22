import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../hooks/useAuth';
import Comment from './Comment';
import toast from 'react-hot-toast';
import LoadingSpinner from './LoadingSpinner';

export default function CommentSection({ postId }) {
    const { user, profile } = useAuth();
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const commentsRef = collection(db, 'posts', postId, 'comments');
        const q = query(commentsRef, orderBy('createdAt', 'asc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setComments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });

        return () => unsubscribe();
    }, [postId]);

    const handleAddComment = async (e) => {
        e.preventDefault();
        if (newComment.trim().length < 1) return;

        try {
            await addDoc(collection(db, 'posts', postId, 'comments'), {
                content: newComment.trim(),
                authorId: user.uid,
                authorUsername: profile.username,
                authorPhotoURL: profile.photoURL || null,
                createdAt: serverTimestamp(),
                likes: [],
            });
            setNewComment('');
        } catch (error) {
            console.error("Error al añadir comentario:", error);
            toast.error("No se pudo añadir el comentario.");
        }
    };

    return (
        <div className="mt-4 pt-4 border-t dark:border-gray-700">
            {loading && <LoadingSpinner text="Cargando comentarios..." />}
            
            <div className="space-y-4 mb-4">
                {comments.map(comment => <Comment key={comment.id} comment={comment} postId={postId} />)}
            </div>

            <form onSubmit={handleAddComment} className="flex items-start gap-3">
                 <img 
                    src={profile?.photoURL || `https://ui-avatars.com/api/?name=${profile?.username}&background=random`}
                    alt="Tu foto de perfil"
                    className="w-8 h-8 rounded-full object-cover"
                />
                <textarea
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    className="input flex-1 !py-2 text-sm dark:bg-gray-700 dark:border-gray-600"
                    placeholder="Escribe un comentario..."
                    rows="1"
                />
                <button type="submit" className="btn-primary !py-2 text-sm">Comentar</button>
            </form>
        </div>
    );
}