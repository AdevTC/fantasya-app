import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import { Image as ImageIcon, X } from 'lucide-react';

export default function CreatePost() {
    const { user, profile } = useAuth();
    const [content, setContent] = useState('');
    const [image, setImage] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleImageChange = (e) => {
        if (e.target.files[0]) {
            setImage(e.target.files[0]);
            setImagePreview(URL.createObjectURL(e.target.files[0]));
        }
    };

    const handleCreatePost = async (e) => {
        e.preventDefault();
        if (content.trim().length < 5 && !image) {
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
            }

            await addDoc(collection(db, 'posts'), {
                content: content.trim(),
                imageURL: imageURL,
                authorId: user.uid,
                authorUsername: profile.username,
                authorPhotoURL: profile.photoURL || null,
                createdAt: serverTimestamp(),
                likes: [],
            });
            setContent('');
            setImage(null);
            setImagePreview(null);
            toast.success('¡Publicación creada!', { id: loadingToast });
        } catch (error) {
            console.error("Error al crear el post:", error);
            toast.error('No se pudo crear la publicación.', { id: loadingToast });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6">
            <form onSubmit={handleCreatePost}>
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="input h-24 dark:bg-gray-700 dark:border-gray-600"
                    placeholder={`¿Qué está pasando, ${profile?.username}?`}
                    maxLength="280"
                />
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
                <div className="flex justify-between items-center mt-4">
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