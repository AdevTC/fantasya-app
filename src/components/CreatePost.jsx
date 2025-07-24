import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import { Image as ImageIcon, X, Tag } from 'lucide-react';
import { grantXp } from '../utils/xp';

export default function CreatePost() {
    const { user, profile } = useAuth();
    const [content, setContent] = useState('');
    const [image, setImage] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [loading, setLoading] = useState(false);
    const [tags, setTags] = useState([]);
    const [currentTag, setCurrentTag] = useState('');

    const handleImageChange = (e) => {
        if (e.target.files[0]) {
            setImage(e.target.files[0]);
            setImagePreview(URL.createObjectURL(e.target.files[0]));
        }
    };

    const handleTagInput = (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            const newTag = currentTag.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
            if (newTag && !tags.includes(newTag) && tags.length < 5) {
                setTags([...tags, newTag]);
            }
            setCurrentTag('');
        }
    };

    const removeTag = (tagToRemove) => {
        setTags(tags.filter(tag => tag !== tagToRemove));
    };

    const handleCreatePost = async (e) => {
        e.preventDefault();
        if (content.trim().length < 1 && !image) {
            toast.error('La publicación debe tener texto o una imagen.');
            return;
        }
        if (!user || !profile) {
            toast.error('Debes estar autenticado para publicar.');
            return;
        }
        setLoading(true);
        const loadingToast = toast.loading('Publicando...');

        try {
            let imageURL = null;
            if (image) {
                const imageRef = ref(storage, `posts/${user.uid}/${Date.now()}_${image.name}`);
                await uploadBytes(imageRef, image);
                imageURL = await getDownloadURL(imageRef);
                await grantXp(user.uid, 'POST_WITH_IMAGE');
            } else {
                await grantXp(user.uid, 'POST');
            }

            await addDoc(collection(db, 'posts'), {
                content: content.trim(),
                imageURL: imageURL,
                tags: tags,
                authorId: user.uid,
                authorUsername: profile.username,
                authorPhotoURL: profile.photoURL || null,
                createdAt: serverTimestamp(),
                likes: [],
            });
            setContent('');
            setImage(null);
            setImagePreview(null);
            setTags([]);
            setCurrentTag('');
            toast.success('¡Publicación creada!', { id: loadingToast });
        } catch (error) {
            console.error("Error al crear el post:", error);
            toast.error('No se pudo crear la publicación.', { id: loadingToast });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bento-card">
            <form onSubmit={handleCreatePost}>
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="w-full h-24 p-0 text-base bg-transparent border-none focus:ring-0 resize-none placeholder-gray-500 dark:placeholder-gray-400 dark:text-gray-200"
                    placeholder={`¿Qué está pasando, ${profile?.username}?`}
                    maxLength="280"
                />
                
                <div className="mt-4">
                    <div className="flex items-center gap-2">
                        <Tag size={16} className="text-gray-400"/>
                        <input 
                            type="text"
                            value={currentTag}
                            onChange={(e) => setCurrentTag(e.target.value)}
                            onKeyDown={handleTagInput}
                            className="input !w-auto flex-grow !py-1 text-sm bg-gray-100/50 dark:bg-gray-700/50"
                            placeholder="Añade hasta 5 etiquetas (pulsa espacio)"
                            disabled={tags.length >= 5}
                        />
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                        {tags.map(tag => (
                            <div key={tag} className="flex items-center gap-1 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 text-xs font-bold px-2 py-1 rounded-full">
                                <span>#{tag}</span>
                                <button type="button" onClick={() => removeTag(tag)}>
                                    <X size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {imagePreview && (
                    <div className="mt-4 relative">
                        <img src={imagePreview} alt="Vista previa" className="rounded-lg max-h-80 w-auto" />
                        <button 
                            type="button" 
                            onClick={() => { setImage(null); setImagePreview(null); }}
                            className="absolute top-2 right-2 bg-black/50 p-1 rounded-full text-white hover:bg-black/75"
                        >
                            <X size={16} />
                        </button>
                    </div>
                )}

                <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-200 dark:border-gray-700/50">
                    <div className="flex items-center gap-4">
                        <label htmlFor="imageUpload" className="cursor-pointer text-emerald-500 hover:text-emerald-600">
                            <ImageIcon size={24} />
                        </label>
                        <input id="imageUpload" type="file" accept="image/*" onChange={handleImageChange} className="hidden"/>
                        <p className="text-xs text-gray-500">{content.length}/280</p>
                    </div>
                    <button type="submit" disabled={loading} className="btn-primary">
                        {loading ? 'Publicando...' : 'Publicar'}
                    </button>
                </div>
            </form>
        </div>
    );
}