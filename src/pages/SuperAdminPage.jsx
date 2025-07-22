import React, { useState, useCallback, useEffect } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, setDoc, orderBy, limit } from 'firebase/firestore';
import { db } from '../config/firebase';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { UserCog, Search, ShieldCheck, ShieldOff } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';

export default function SuperAdminPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);

    const handleSearch = async (e) => {
        e.preventDefault();
        const cleanedSearchTerm = searchTerm.trim().toLowerCase();
        if (cleanedSearchTerm.length < 3) {
            toast.error('El término de búsqueda debe tener al menos 3 caracteres.');
            return;
        }
        setLoading(true);
        setSearched(true);
        setSearchResults([]);

        try {
            const usersRef = collection(db, 'users');
            const isEmailSearch = cleanedSearchTerm.includes('@');

            // --- LÓGICA DE BÚSQUEDA MEJORADA ---
            // Creamos dos queries: una para el nombre de usuario y otra para el email.
            const usernameQuery = query(usersRef, 
                where("username", ">=", cleanedSearchTerm),
                where("username", "<=", cleanedSearchTerm + '\uf8ff'),
                limit(10)
            );
            
            const emailQuery = query(usersRef, 
                where("email", ">=", cleanedSearchTerm), 
                where("email", "<=", cleanedSearchTerm + '\uf8ff'),
                limit(10)
            );

            // Ejecutamos ambas búsquedas en paralelo
            const [usernameSnapshot, emailSnapshot] = await Promise.all([
                getDocs(usernameQuery),
                getDocs(emailQuery)
            ]);

            // Unimos los resultados y eliminamos duplicados
            const usersMap = new Map();
            usernameSnapshot.docs.forEach(doc => usersMap.set(doc.id, { id: doc.id, ...doc.data() }));
            emailSnapshot.docs.forEach(doc => usersMap.set(doc.id, { id: doc.id, ...doc.data() }));

            const users = Array.from(usersMap.values());
            setSearchResults(users);

            if (users.length === 0) {
                toast('No se encontraron usuarios con ese criterio.', { icon: '🤷‍♂️' });
            }

        } catch (error) {
            console.error("Error al buscar usuarios:", error);
            toast.error('No se pudo realizar la búsqueda.');
        } finally {
            setLoading(false);
        }
    };

    const handleRoleChange = async (userId, username, newRole) => {
        if (!window.confirm(`¿Estás seguro de que quieres ${newRole === 'superadmin' ? 'ascender' : 'revocar'} a ${username}?`)) {
            return;
        }
        const loadingToast = toast.loading('Actualizando rol...');
        try {
            const userRef = doc(db, 'users', userId);
            if (newRole === 'superadmin') {
                await updateDoc(userRef, { appRole: 'superadmin' });
            } else {
                await updateDoc(userRef, { appRole: 'user' });
            }
            setSearchResults(prev => prev.map(user => 
                user.id === userId ? { ...user, appRole: newRole } : user
            ));
            toast.success('Rol actualizado con éxito', { id: loadingToast });
        } catch (error) {
            console.error("Error al cambiar el rol:", error);
            toast.error('No se pudo actualizar el rol.', { id: loadingToast });
        }
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-200 flex items-center gap-3">
                    <UserCog size={32} />
                    Panel de Super Administración
                </h1>
                <Link to="/dashboard" className="text-deep-blue dark:text-blue-400 hover:underline font-semibold">Volver al Dashboard</Link>
            </div>

            <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6 mb-8">
                <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-4">Buscar Usuario</h2>
                <form onSubmit={handleSearch} className="flex gap-4">
                    <input 
                        type="text" 
                        value={searchTerm} 
                        onChange={e => setSearchTerm(e.target.value)} 
                        className="input flex-grow dark:bg-gray-700 dark:border-gray-600" 
                        placeholder="Buscar por email o nombre de usuario..."
                    />
                    <button type="submit" disabled={loading} className="btn-primary whitespace-nowrap flex items-center gap-2">
                        <Search size={18}/> {loading ? 'Buscando...' : 'Buscar'}
                    </button>
                </form>
            </div>

            {loading && <LoadingSpinner text="Cargando resultados..." />}
            
            {!loading && searched && searchResults.length === 0 && (
                <div className="text-center bg-white dark:bg-gray-800/50 p-12 rounded-xl border border-dashed dark:border-gray-700">
                    <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Sin resultados</h3>
                    <p className="text-gray-500 dark:text-gray-400 mt-2">No se encontró ningún usuario que coincida con tu búsqueda.</p>
                </div>
            )}

            {!loading && searchResults.length > 0 && (
                <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700">
                    <div className="p-4 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 dark:bg-gray-800">
                                <tr>
                                    <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-300">Nombre de Usuario</th>
                                    <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-300">Email</th>
                                    <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300">Rol Actual</th>
                                    <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-300">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y dark:divide-gray-700">
                                {searchResults.map(user => (
                                    <tr key={user.id}>
                                        <td className="p-3 font-semibold text-gray-800 dark:text-gray-200">{user.username}</td>
                                        <td className="p-3 text-gray-600 dark:text-gray-400">{user.email}</td>
                                        <td className="p-3 text-center">
                                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${user.appRole === 'superadmin' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
                                                {user.appRole === 'superadmin' ? 'Super Admin' : 'Usuario'}
                                            </span>
                                        </td>
                                        <td className="p-3 text-center">
                                            {user.appRole === 'superadmin' ? (
                                                <button onClick={() => handleRoleChange(user.id, user.username, 'user')} className="btn-action bg-red-500 hover:bg-red-600 flex items-center gap-1 mx-auto">
                                                    <ShieldOff size={14}/> Revocar
                                                </button>
                                            ) : (
                                                <button onClick={() => handleRoleChange(user.id, user.username, 'superadmin')} className="btn-action bg-emerald-500 hover:bg-emerald-600 flex items-center gap-1 mx-auto">
                                                   <ShieldCheck size={14}/> Ascender
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}