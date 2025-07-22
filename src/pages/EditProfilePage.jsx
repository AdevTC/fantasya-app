import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { db, storage } from '../config/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Save, Home, Camera, Trash2 } from 'lucide-react';

export default function EditProfilePage() {
    const { user, profile } = useAuth();
    const navigate = useNavigate();
    const [bio, setBio] = useState('');
    const [profileImage, setProfileImage] = useState(null);
    const [previewImage, setPreviewImage] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (profile) {
            setBio(profile.bio || '');
            setPreviewImage(profile.photoURL || null);
        }
    }, [profile]);

    const handleImageChange = (e) => {
        if (e.target.files[0]) {
            setProfileImage(e.target.files[0]);
            setPreviewImage(URL.createObjectURL(e.target.files[0]));
        }
    };

    // --- NUEVA FUNCIÓN PARA ELIMINAR LA FOTO ---
    const handleRemoveImage = async () => {
        if (!window.confirm("¿Estás seguro de que quieres eliminar tu foto de perfil?")) return;
        
        setLoading(true);
        const loadingToast = toast.loading('Eliminando foto...');
        try {
            const userRef = doc(db, 'users', user.uid);
            
            // Eliminar la foto de Firebase Storage
            const imageRef = ref(storage, `profile-pictures/${user.uid}`);
            await deleteObject(imageRef);

            // Actualizar el perfil en Firestore para quitar la URL
            await updateDoc(userRef, {
                photoURL: null
            });

            setProfileImage(null);
            setPreviewImage(null);
            toast.success('Foto de perfil eliminada', { id: loadingToast });

        } catch (error) {
            // Manejar el caso en que el archivo no exista en Storage pero sí en el perfil
            if (error.code === 'storage/object-not-found') {
                const userRef = doc(db, 'users', user.uid);
                await updateDoc(userRef, { photoURL: null });
                setProfileImage(null);
                setPreviewImage(null);
                toast.success('Foto de perfil eliminada', { id: loadingToast });
            } else {
                console.error("Error al eliminar la foto:", error);
                toast.error('No se pudo eliminar la foto.', { id: loadingToast });
            }
        } finally {
            setLoading(false);
        }
    };

    const handleProfileUpdate = async (e) => {
        e.preventDefault();
        if (bio.length > 150) {
            toast.error('La biografía no puede tener más de 150 caracteres.');
            return;
        }
        setLoading(true);
        const loadingToast = toast.loading('Actualizando perfil...');

        try {
            const userRef = doc(db, 'users', user.uid);
            let photoURL = profile.photoURL || null;

            if (profileImage) {
                const imageRef = ref(storage, `profile-pictures/${user.uid}`);
                await uploadBytes(imageRef, profileImage);
                photoURL = await getDownloadURL(imageRef);
            }

            await updateDoc(userRef, {
                bio: bio,
                photoURL: photoURL
            });

            toast.success('¡Perfil actualizado!', { id: loadingToast });
            navigate(`/profile/${profile.username}`);
        } catch (error) {
            console.error("Error al actualizar el perfil:", error);
            toast.error('No se pudo actualizar el perfil.', { id: loadingToast });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
             <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-200">Editar Perfil</h1>
                {profile?.username && (
                    <Link to={`/profile/${profile.username}`} className="text-deep-blue dark:text-blue-400 hover:underline font-semibold">Volver al Perfil</Link>
                )}
            </div>
            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-8">
                <form onSubmit={handleProfileUpdate}>
                    <div className="flex flex-col items-center mb-4">
                        <div className="relative">
                             <img 
                                src={previewImage || `https://ui-avatars.com/api/?name=${profile?.username}&background=random`} 
                                alt="Foto de perfil"
                                className="w-32 h-32 rounded-full object-cover border-4 border-emerald-500"
                            />
                            <label htmlFor="profileImageInput" className="absolute -bottom-2 -right-2 bg-emerald-500 hover:bg-emerald-600 p-2 rounded-full cursor-pointer transition-colors">
                                <Camera size={20} className="text-white"/>
                            </label>
                            <input 
                                id="profileImageInput"
                                type="file" 
                                accept="image/*"
                                onChange={handleImageChange}
                                className="hidden"
                            />
                        </div>
                    </div>
                    
                    {/* --- NUEVO BOTÓN DE ELIMINAR FOTO --- */}
                    {previewImage && (
                        <div className="text-center mb-8">
                             <button type="button" onClick={handleRemoveImage} disabled={loading} className="text-sm text-red-500 hover:underline flex items-center gap-1 mx-auto">
                                <Trash2 size={14}/> Eliminar foto actual
                            </button>
                        </div>
                    )}


                    <div className="mb-6">
                        <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Biografía</label>
                        <textarea
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            className="input h-32 dark:bg-gray-700 dark:border-gray-600"
                            placeholder="Cuéntale al mundo un poco sobre ti..."
                            maxLength="150"
                        />
                        <p className="text-right text-xs text-gray-500 mt-1">{bio.length}/150</p>
                    </div>
                    <button type="submit" disabled={loading} className="w-full btn-primary flex items-center justify-center gap-2">
                        <Save size={18} /> {loading ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                </form>
            </div>
        </div>
    );
}