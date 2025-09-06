import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import RegisterTransferModal from './RegisterTransferModal';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { Edit, Trash2, ChevronLeft, ChevronRight, BarChart2, History } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency } from '../utils/helpers';
import TransferStats from './TransferStats'; // Asumiendo que este componente también será adaptado
import LoadingSpinner from './LoadingSpinner';

const TransferLogRow = ({ transfer, members, onEdit, onDelete, userRole }) => {
    const buyerUsername = members[transfer.buyerId]?.username;
    const sellerUsername = members[transfer.sellerId]?.username;
    return (
        <div className="p-4 bg-gray-50 dark:bg-gray-800/40 rounded-lg border dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-grow">
                <p className="font-bold text-gray-800 dark:text-gray-200">{transfer.playerName}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    <Link to={`/profile/${buyerUsername}`} className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">{transfer.buyerName}</Link>
                    {' ← '}
                    {transfer.sellerId === 'market' ? <span className="text-red-600 dark:text-red-500">{transfer.sellerName}</span> : <Link to={`/profile/${sellerUsername}`} className="font-semibold text-red-600 dark:text-red-500 hover:underline">{transfer.sellerName}</Link>}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 capitalize">{transfer.timestamp ? formatDistanceToNow(transfer.timestamp.toDate(), { addSuffix: true, locale: es }) : ''} • {transfer.type}</p>
            </div>
            <div className="flex items-center gap-4">
                <p className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(transfer.price)}</p>
                {userRole === 'admin' && (
                    <div className="flex items-center gap-2 border-l border-gray-200 dark:border-gray-600 pl-4">
                        <button onClick={() => onEdit(transfer)} className="text-gray-500 hover:text-blue-600 dark:hover:text-blue-400"><Edit size={18} /></button>
                        <button onClick={() => onDelete(transfer.id)} className="text-gray-500 hover:text-red-600 dark:hover:text-red-500"><Trash2 size={18} /></button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default function TransfersTab({ league, season, userRole }) {
    const [allTransfers, setAllTransfers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTransfer, setEditingTransfer] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [activeSubTab, setActiveSubTab] = useState('history');

    // Filter states
    const [filterUser1, setFilterUser1] = useState(null); // Stores username
    const [filterUser2, setFilterUser2] = useState(null); // Stores username
    const [filterType, setFilterType] = useState(null); // 'compra' or 'venta'
    const [filterPlayer, setFilterPlayer] = useState('');
    const [filterMinCost, setFilterMinCost] = useState('');
    const [filterMaxCost, setFilterMaxCost] = useState('');
    const [filterTransferMethod, setFilterTransferMethod] = useState(null); // 'Clausulazo', 'Acuerdo', 'Puja'

    useEffect(() => {
        if (!league || !season) return;

        const transfersRef = collection(db, 'leagues', league.id, 'seasons', season.id, 'transfers');
        const q = query(transfersRef, orderBy('timestamp', 'desc'));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const transfersList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAllTransfers(transfersList);
            setLoading(false);
        }, (error) => {
            console.error("Error al obtener los fichajes:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [league.id, season.id]);

    const handleOpenModalForEdit = (transfer) => { setEditingTransfer(transfer); setIsModalOpen(true); };
    const handleOpenModalForCreate = () => { setEditingTransfer(null); setIsModalOpen(true); };
    
    const handleDeleteTransfer = async (transferId) => {
        if (!window.confirm("¿Estás seguro de que quieres eliminar este fichaje de forma permanente?")) return;
        const loadingToast = toast.loading('Eliminando fichaje...');
        try {
            await deleteDoc(doc(db, 'leagues', league.id, 'seasons', season.id, 'transfers', transferId));
            toast.success('Fichaje eliminado', { id: loadingToast });
        } catch (error) { toast.error('No se pudo eliminar el fichaje.', { id: loadingToast }); }
    };

    const uniqueTeamNames = useMemo(() => {
        const names = new Set();
        names.add('Mercado'); // Always include Mercado
        allTransfers.forEach(transfer => {
            if (transfer.buyerName) names.add(transfer.buyerName);
            if (transfer.sellerName) names.add(transfer.sellerName);
        });
        return Array.from(names).sort((a, b) => a.localeCompare(b));
    }, [allTransfers]);

    const filteredTransfers = useMemo(() => {
        return allTransfers.filter(transfer => {
            // Normalize names for comparison
            const normalizedBuyerName = transfer.buyerName.toLowerCase();
            const normalizedSellerName = transfer.sellerName.toLowerCase();
            const normalizedFilterUser1 = filterUser1 ? filterUser1.toLowerCase() : null;
            const normalizedFilterUser2 = filterUser2 ? filterUser2.toLowerCase() : null;

            let passesUserFilter = true;

            if (normalizedFilterUser1 && normalizedFilterUser2) {
                // Filter for movements between two specific users
                passesUserFilter = (normalizedBuyerName === normalizedFilterUser1 && normalizedSellerName === normalizedFilterUser2) ||
                                   (normalizedBuyerName === normalizedFilterUser2 && normalizedSellerName === normalizedFilterUser1);
            } else if (normalizedFilterUser1) {
                // Filter for movements involving a single user (as buyer or seller)
                passesUserFilter = (normalizedBuyerName === normalizedFilterUser1 || normalizedSellerName === normalizedFilterUser1);

                // Apply type filter in conjunction with user1 filter
                if (filterType) {
                    if (filterType === 'compra' && normalizedBuyerName !== normalizedFilterUser1) {
                        passesUserFilter = false;
                    }
                    if (filterType === 'venta' && normalizedSellerName !== normalizedFilterUser1) {
                        passesUserFilter = false;
                    }
                }
            } else if (filterType) {
                // Apply type filter globally if no user is selected
                if (filterType === 'compra' && transfer.type.toLowerCase() !== 'compra') {
                    passesUserFilter = false;
                }
                if (filterType === 'venta' && transfer.type.toLowerCase() !== 'venta') {
                    passesUserFilter = false;
                }
            }

            if (!passesUserFilter) {
                return false;
            }

            // Filter by transfer method (Clausulazo, Acuerdo, Puja)
            if (filterTransferMethod) {
                if (transfer.type.toLowerCase() !== filterTransferMethod.toLowerCase()) {
                    return false;
                }
            }

            // Filter by player name
            if (filterPlayer) {
                if (!transfer.playerName.toLowerCase().includes(filterPlayer.toLowerCase())) {
                    return false;
                }
            }

            // Filter by cost range
            if (filterMinCost !== '' && transfer.price < Number(filterMinCost)) {
                return false;
            }
            if (filterMaxCost !== '' && transfer.price > Number(filterMaxCost)) {
                return false;
            }

            return true;
        });
    }, [allTransfers, filterUser1, filterUser2, filterType, filterTransferMethod, filterPlayer, filterMinCost, filterMaxCost]);

    const { currentTransfers, totalPages } = useMemo(() => {
        const indexOfLastItem = currentPage * itemsPerPage;
        const indexOfFirstItem = indexOfLastItem - itemsPerPage;
        const currentItems = filteredTransfers.slice(indexOfFirstItem, indexOfLastItem);
        return { currentTransfers: currentItems, totalPages: Math.ceil(filteredTransfers.length / itemsPerPage) };
    }, [filteredTransfers, currentPage, itemsPerPage]);

    if (loading) return <LoadingSpinner text="Cargando datos de fichajes..." />;

    return (
        <div className="space-y-6">
            <RegisterTransferModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                league={league} 
                season={season}
                onTransferRegistered={() => {}} 
                existingTransfer={editingTransfer}
            />
            
            <div className="flex border-b dark:border-gray-700">
                <button onClick={() => setActiveSubTab('history')} className={`flex items-center gap-2 px-4 py-2 font-semibold ${activeSubTab === 'history' ? 'border-b-2 border-emerald-500 text-emerald-500' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                    <History size={18}/> Historial
                </button>
                <button onClick={() => setActiveSubTab('stats')} className={`flex items-center gap-2 px-4 py-2 font-semibold ${activeSubTab === 'stats' ? 'border-b-2 border-emerald-500 text-emerald-500' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                    <BarChart2 size={18}/> Estadísticas
                </button>
            </div>

            {activeSubTab === 'history' && (
                <div className="bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border dark:border-gray-700 p-6">
                    <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
                        <div className="flex items-baseline gap-2">
                            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Historial de Movimientos</h3>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">{filteredTransfers.length}</span>
                        </div>
                        {userRole === 'admin' && (
                            <button onClick={handleOpenModalForCreate} className="btn-primary flex items-center gap-2">
                                <span className="text-xl font-light">+</span>Registrar Fichaje
                            </button>
                        )}
                    </div>

                    {/* Filter Controls */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-6 p-4 bg-gray-100 dark:bg-gray-800/70 rounded-lg">
                        <div>
                            <label htmlFor="userFilter1" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Usuario 1:</label>
                            <select
                                id="userFilter1"
                                value={filterUser1 || ''}
                                onChange={(e) => setFilterUser1(e.target.value || null)}
                                className="input w-full dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            >
                                <option value="">Todos</option>
                                {uniqueTeamNames.map(name => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="userFilter2" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Usuario 2:</label>
                            <select
                                id="userFilter2"
                                value={filterUser2 || ''}
                                onChange={(e) => setFilterUser2(e.target.value || null)}
                                className="input w-full dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            >
                                <option value="">Todos</option>
                                {uniqueTeamNames.map(name => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="typeFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo:</label>
                            <select
                                id="typeFilter"
                                value={filterType || ''}
                                onChange={(e) => setFilterType(e.target.value || null)}
                                className="input w-full dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            >
                                <option value="">Todos</option>
                                <option value="compra">Compra</option>
                                <option value="venta">Venta</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="transferMethodFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Método:</label>
                            <select
                                id="transferMethodFilter"
                                value={filterTransferMethod || ''}
                                onChange={(e) => setFilterTransferMethod(e.target.value || null)}
                                className="input w-full dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            >
                                <option value="">Todos</option>
                                <option value="clausulazo">Clausulazo</option>
                                <option value="acuerdo">Acuerdo</option>
                                <option value="puja">Puja</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="playerFilter" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Jugador:</label>
                            <input
                                id="playerFilter"
                                type="text"
                                value={filterPlayer}
                                onChange={(e) => setFilterPlayer(e.target.value)}
                                placeholder="Nombre del jugador"
                                className="input w-full dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            />
                        </div>
                        <div className="flex items-end gap-2 col-span-full lg:col-span-2 xl:col-span-1"> {/* Adjusted column span */}
                            <div className="flex-1">
                                <label htmlFor="minCost" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Coste Mín:</label>
                                <input
                                    id="minCost"
                                    type="number"
                                    value={filterMinCost}
                                    onChange={(e) => setFilterMinCost(e.target.value)}
                                    placeholder="Min"
                                    className="input w-full dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                />
                            </div>
                            <div className="flex-1">
                                <label htmlFor="maxCost" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Coste Máx:</label>
                                <input
                                    id="maxCost"
                                    type="number"
                                    value={filterMaxCost}
                                    onChange={(e) => setFilterMaxCost(e.target.value)}
                                    placeholder="Max"
                                    className="input w-full dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                />
                            </div>
                        </div>
                    </div>

                    {filteredTransfers.length > 0 && (
                        <div className="flex flex-wrap justify-between items-center mb-4 gap-4 text-sm text-gray-600 dark:text-gray-400">
                            <div className="flex items-center gap-2">
                                <span>Mostrar</span>
                                <select value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} className="input !py-1 !px-2 !w-auto dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                                    <option value={10}>10</option>
                                    <option value={20}>20</option>
                                    <option value={50}>50</option>
                                </select>
                                <span>fichajes por página.</span>
                            </div>
                            {totalPages > 1 && (
                                <div className="flex items-center gap-2">
                                    <button onClick={() => setCurrentPage(c => Math.max(1, c - 1))} disabled={currentPage === 1} className="p-1 disabled:opacity-50 text-gray-700 dark:text-gray-300"><ChevronLeft/></button>
                                    <span>Página <strong className="text-gray-800 dark:text-white">{currentPage}</strong> de <strong className="text-gray-800 dark:text-white">{totalPages}</strong></span>
                                    <button onClick={() => setCurrentPage(c => Math.min(totalPages, c + 1))} disabled={currentPage === totalPages} className="p-1 disabled:opacity-50 text-gray-700 dark:text-gray-300"><ChevronRight/></button>
                                </div>
                            )}
                        </div>
                    )}
                    
                    <div className="space-y-4">
                        {currentTransfers.length > 0 ? (
                            currentTransfers.map(t => <TransferLogRow key={t.id} transfer={t} members={season.members} userRole={userRole} onEdit={handleOpenModalForEdit} onDelete={handleDeleteTransfer} />)
                        ) : (
                            <p className="text-center text-gray-500 dark:text-gray-400 py-8">No hay fichajes registrados todavía en esta temporada.</p>
                        )}
                    </div>
                </div>
            )}
            
            {activeSubTab === 'stats' && <TransferStats transfers={allTransfers} members={season.members} />}
        </div>
    );
}