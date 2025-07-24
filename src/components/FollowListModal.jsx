import React, { useState, useEffect, useCallback, useRef } from 'react';
import { collection, query, where, getDocs, documentId, limit, startAfter } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Link } from 'react-router-dom';
import { X, Search } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';

const USERS_PER_PAGE = 20;

export default function FollowListModal({ isOpen, onClose, title, userIds }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [users, setUsers] = useState([]);
    const [filteredUsers, setFilteredUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const observer = useRef();
    
    const [allUserIds, setAllUserIds] = useState([]);

    useEffect(() => {
        if (isOpen) {
            setAllUserIds(userIds);
            setUsers([]);
            setSearchTerm('');
        }
    }, [isOpen, userIds]);

    useEffect(() => {
        if (isOpen && allUserIds.length > 0) {
            fetchUsers(allUserIds);
        } else if (isOpen && allUserIds.length === 0) {
            setUsers([]);
        }
    }, [isOpen, allUserIds]);

    const fetchUsers = useCallback(async (idsToFetch) => {
        if (idsToFetch.length === 0) return;
        setLoading(true);
        try {
            const usersRef = collection(db, 'users');
            const fetchedUsers = [];
            for (let i = 0; i < idsToFetch.length; i += 30) {
                const chunk = idsToFetch.slice(i, i + 30);
                const q = query(usersRef, where(documentId(), 'in', chunk));
                const querySnapshot = await getDocs(q);
                querySnapshot.forEach(doc => {
                    fetchedUsers.push({ id: doc.id, ...doc.data() });
                });
            }
            fetchedUsers.sort((a, b) => a.username.localeCompare(b.username));
            setUsers(fetchedUsers);
        } catch (error) {
            console.error("Error fetching users:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (searchTerm.trim() === '') {
            setFilteredUsers(users);
        } else {
            const lowercasedFilter = searchTerm.toLowerCase();
            const filtered = users.filter(user =>
                user.username.toLowerCase().includes(lowercasedFilter)
            );
            setFilteredUsers(filtered);
        }
    }, [searchTerm, users]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md shadow-lg flex flex-col max-h-[80vh]">
                <div className="flex justify-between items-center mb-4 flex-shrink-0">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200">{title} ({userIds.length})</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                        <X size={24} />
                    </button>
                </div>

                <div className="relative mb-4 flex-shrink-0">
                    <input
                        type="text"
                        placeholder="Buscar por nombre de usuario..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="input !pl-10"
                    />
                    <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
                
                <div className="flex-grow overflow-y-auto pr-2">
                    {loading ? (
                        <LoadingSpinner text="Cargando usuarios..." />
                    ) : filteredUsers.length > 0 ? (
                        <div className="space-y-3">
                            {filteredUsers.map(user => (
                                <Link
                                    to={`/profile/${user.username}`}
                                    key={user.id}
                                    onClick={onClose}
                                    className="flex items-center gap-4 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50"
                                >
                                    <img
                                        src={user.photoURL || `https://ui-avatars.com/api/?name=${user.username}&background=random`}
                                        alt={user.username}
                                        className="w-10 h-10 rounded-full object-cover"
                                    />
                                    <span className="font-semibold text-gray-800 dark:text-gray-200">{user.username}</span>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <p className="text-center text-gray-500 py-8">
                            {searchTerm ? 'No se encontraron usuarios.' : `Esta lista está vacía.`}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}