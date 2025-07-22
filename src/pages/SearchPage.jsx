import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Home } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import Post from '../components/Post';
import toast from 'react-hot-toast';

export default function SearchPage() {
    const [searchParams] = useSearchParams();
    const tagFromUrl = searchParams.get('tag');

    const [searchTerm, setSearchTerm] = useState(tagFromUrl ? `#${tagFromUrl}` : '');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchType, setSearchType] = useState(tagFromUrl ? 'posts' : 'users');

    const handleSearch = async (e) => {
        if (e) e.preventDefault();
        let currentSearchTerm = searchTerm.trim();
        if (currentSearchTerm.length < 1) return;

        setLoading(true);
        setResults([]);

        try {
            if (currentSearchTerm.startsWith('#')) {
                setSearchType('posts');
                const tag = currentSearchTerm.substring(1).toLowerCase();
                const postsRef = collection(db, 'posts');
                const q = query(postsRef, where("tags", "array-contains", tag), orderBy('createdAt', 'desc'), limit(20));
                const querySnapshot = await getDocs(q);
                const posts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setResults(posts);
            } else {
                setSearchType('users');
                const usersRef = collection(db, 'users');
                const q = query(usersRef, where("username", ">=", currentSearchTerm.toLowerCase()), where("username", "<=", currentSearchTerm.toLowerCase() + '\uf8ff'), limit(15));
                const querySnapshot = await getDocs(q);
                const users = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setResults(users);
            }
        } catch (error) {
            console.error("Error buscando:", error);
            toast.error("No se pudo realizar la búsqueda.");
        } finally {
            setLoading(false);
        }
    };
    
    useEffect(() => {
        if (tagFromUrl) {
            handleSearch();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tagFromUrl]);


    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-200">Buscar</h1>
                <Link to="/dashboard" className="text-deep-blue dark:text-blue-400 hover:underline font-semibold flex items-center gap-2">
                    <Home size={18} /> Volver al Dashboard
                </Link>
            </div>
            
            <form onSubmit={handleSearch} className="flex gap-4 mb-8">
                <input 
                    type="text" 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="input flex-grow dark:bg-gray-700 dark:border-gray-600"
                    placeholder="Buscar usuarios o #hashtags..."
                />
                <button type="submit" className="btn-primary flex items-center gap-2" disabled={loading}>
                    <Search size={18} /> {loading ? 'Buscando...' : 'Buscar'}
                </button>
            </form>

            {loading && <LoadingSpinner />}
            
            {!loading && results.length === 0 && searchTerm && (
                <p className="text-center text-gray-500">No se encontraron resultados para "{searchTerm}".</p>
            )}

            {!loading && results.length > 0 && (
                <div className="space-y-4">
                    {searchType === 'users' ? (
                        results.map(user => (
                            <Link to={`/profile/${user.username}`} key={user.id} className="block bg-white dark:bg-gray-800/50 p-4 rounded-xl shadow-sm border dark:border-gray-700 hover:border-emerald-500 transition-colors">
                                <div className="flex items-center gap-4">
                                    <img 
                                        src={user.photoURL || `https://ui-avatars.com/api/?name=${user.username}&background=random`}
                                        alt={`Foto de ${user.username}`}
                                        className="w-12 h-12 rounded-full object-cover"
                                    />
                                    <div>
                                        <p className="font-bold text-gray-800 dark:text-gray-200">{user.username}</p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                                    </div>
                                </div>
                            </Link>
                        ))
                    ) : (
                        results.map(post => <Post key={post.id} post={post} />)
                    )}
                </div>
            )}
        </div>
    );
}