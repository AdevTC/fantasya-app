import React, { useState, useEffect, useCallback, useRef } from 'react';
import { collection, query, orderBy, limit, getDocs, startAfter } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Link } from 'react-router-dom';
import CreatePost from '../components/CreatePost';
import Post from '../components/Post';
import PostSkeleton from '../components/PostSkeleton';
import { Home } from 'lucide-react';

const POSTS_PER_PAGE = 5;

export default function FeedPage() {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [lastDoc, setLastDoc] = useState(null);
    const [hasMore, setHasMore] = useState(true);
    const observer = useRef();

    const fetchInitialPosts = useCallback(async () => {
        setLoading(true);
        const postsRef = collection(db, 'posts');
        const q = query(postsRef, orderBy('createdAt', 'desc'), limit(POSTS_PER_PAGE));
        
        const documentSnapshots = await getDocs(q);
        const newPosts = documentSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        setPosts(newPosts);
        setLastDoc(documentSnapshots.docs[documentSnapshots.docs.length - 1]);
        setHasMore(newPosts.length === POSTS_PER_PAGE);
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchInitialPosts();
    }, [fetchInitialPosts]);
    
    const fetchMorePosts = useCallback(async () => {
        if (!hasMore || !lastDoc || loadingMore) return;
        
        setLoadingMore(true);
        const postsRef = collection(db, 'posts');
        const q = query(postsRef, orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(POSTS_PER_PAGE));
        
        const documentSnapshots = await getDocs(q);
        const newPosts = documentSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        setPosts(prevPosts => [...prevPosts, ...newPosts]);
        setLastDoc(documentSnapshots.docs[documentSnapshots.docs.length - 1]);
        setHasMore(newPosts.length === POSTS_PER_PAGE);
        setLoadingMore(false);
    }, [lastDoc, hasMore, loadingMore]);

    const lastPostElementRef = useCallback(node => {
        if (loading || loadingMore) return;
        if (observer.current) observer.current.disconnect();
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMore) {
                fetchMorePosts();
            }
        });
        if (node) observer.current.observe(node);
    }, [loading, loadingMore, hasMore, fetchMorePosts]);


    return (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-200">Feed de la Comunidad</h1>
                <Link to="/dashboard" className="text-deep-blue dark:text-blue-400 hover:underline font-semibold flex items-center gap-2">
                    <Home size={18} /> Volver al Dashboard
                </Link>
            </div>

            <CreatePost />

            <div className="mt-8">
                {loading ? (
                    <div className="space-y-6">
                        {[...Array(3)].map((_, i) => <PostSkeleton key={i} />)}
                    </div>
                ) : (
                    <div className="space-y-6">
                        {posts.map((post, index) => {
                            if (posts.length === index + 1) {
                                return <div ref={lastPostElementRef} key={post.id}><Post post={post} /></div>;
                            } else {
                                return <Post key={post.id} post={post} />;
                            }
                        })}
                    </div>
                )}
                
                {loadingMore && (
                     <div className="space-y-6 mt-6">
                        {[...Array(2)].map((_, i) => <PostSkeleton key={i} />)}
                    </div>
                )}

                {!loading && !hasMore && posts.length > 0 && (
                     <p className="text-center text-gray-500 mt-8 py-4">Has llegado al final del feed.</p>
                )}
                
                {!loading && posts.length === 0 && (
                     <div className="bento-card text-center p-12">
                        <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300">¡El feed está muy tranquilo!</h3>
                        <p className="text-gray-500 dark:text-gray-400 mt-2">Sé el primero en compartir algo con la comunidad.</p>
                    </div>
                )}
            </div>
        </div>
    );
}