import React, { useState, useEffect } from 'react';
import { collection, doc, getDoc, getDocs, query, where, documentId } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../hooks/useAuth';
import { Link } from 'react-router-dom';
import Post from '../components/Post';
import LoadingSpinner from '../components/LoadingSpinner';
import { Home, Bookmark } from 'lucide-react';

export default function SavedPostsPage() {
    const { profile } = useAuth();
    const [savedPosts, setSavedPosts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSavedPosts = async () => {
            if (!profile || !profile.savedPosts || profile.savedPosts.length === 0) {
                setSavedPosts([]);
                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                const postsRef = collection(db, 'posts');
                // Firestore permite un máximo de 30 elementos en una consulta 'in' en versiones más nuevas.
                // Para evitar errores, lo limitamos a los 30 más recientes.
                const savedPostIds = [...profile.savedPosts].reverse().slice(0, 30);

                if (savedPostIds.length === 0) {
                    setSavedPosts([]);
                    setLoading(false);
                    return;
                }

                const q = query(postsRef, where(documentId(), 'in', savedPostIds));
                const querySnapshot = await getDocs(q);
                
                const postsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                // Ordenar los posts según el orden en que se guardaron (el más reciente primero)
                postsData.sort((a, b) => savedPostIds.indexOf(a.id) - savedPostIds.indexOf(b.id));

                setSavedPosts(postsData);
            } catch (error) {
                console.error("Error al obtener los posts guardados:", error);
            } finally {
                setLoading(false);
            }
        };

        // Se ejecuta cada vez que el perfil (y por tanto, los posts guardados) cambia.
        fetchSavedPosts();
    }, [profile]);

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-200 flex items-center gap-3">
                    <Bookmark /> Publicaciones Guardadas
                </h1>
                <Link to="/dashboard" className="text-deep-blue dark:text-blue-400 hover:underline font-semibold flex items-center gap-2">
                    <Home size={18} /> Volver al Dashboard
                </Link>
            </div>

            {loading ? (
                <LoadingSpinner text="Cargando tus publicaciones guardadas..." />
            ) : savedPosts.length > 0 ? (
                <div className="space-y-6">
                    {savedPosts.map(post => <Post key={post.id} post={post} />)}
                </div>
            ) : (
                <div className="text-center bg-white dark:bg-gray-800/50 p-12 rounded-xl border border-dashed dark:border-gray-700">
                    <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300">No tienes publicaciones guardadas</h3>
                    <p className="text-gray-500 dark:text-gray-400 mt-2">Haz clic en el icono de marcador en una publicación para guardarla aquí.</p>
                </div>
            )}
        </div>
    );
}