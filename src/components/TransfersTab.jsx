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
import TransferStats from './TransferStats';

const TransferLogRow = ({ transfer, members, onEdit, onDelete, userRole }) => {
    const buyerUsername = members[transfer.buyerId]?.username;
    const sellerUsername = members[transfer.sellerId]?.username;
    return (
        <div className="p-4 bg-gray-50 rounded-lg border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-grow">
                <p className="font-bold text-gray-800">{transfer.playerName}</p>
                <p className="text-sm text-gray-600"><Link to={`/profile/${buyerUsername}`} className="font-semibold text-emerald-600 hover:underline">{transfer.buyerName}</Link>{' ← '}{transfer.sellerId === 'market' ? <span className="text-red-600">{transfer.sellerName}</span> : <Link to={`/profile/${sellerUsername}`} className="font-semibold text-red-600 hover:underline">{transfer.sellerName}</Link>}</p>
                <p className="text-xs text-gray-500 mt-1 capitalize">{transfer.timestamp ? formatDistanceToNow(transfer.timestamp.toDate(), { addSuffix: true, locale: es }) : ''} • {transfer.type}</p>
            </div>
            <div className="flex items-center gap-4">
                <p className="text-lg font-bold text-gray-900">{formatCurrency(transfer.price)}</p>
                {userRole === 'admin' && (<div className="flex items-center gap-2 border-l pl-4"><button onClick={() => onEdit(transfer)} className="text-gray-500 hover:text-blue-600"><Edit size={18} /></button><button onClick={() => onDelete(transfer.id)} className="text-gray-500 hover:text-red-600"><Trash2 size={18} /></button></div>)}
            </div>
        </div>
    );
};

export default function TransfersTab({ league }) {
    const [allTransfers, setAllTransfers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTransfer, setEditingTransfer] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);
    const [activeSubTab, setActiveSubTab] = useState('history');

    useEffect(() => {
        const transfersRef = collection(db, 'leagues', league.id, 'transfers');
        const q = query(transfersRef, orderBy('timestamp', 'desc'));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const transfersList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAllTransfers(transfersList);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [league.id]);

    const handleOpenModalForEdit = (transfer) => { setEditingTransfer(transfer); setIsModalOpen(true); };
    const handleOpenModalForCreate = () => { setEditingTransfer(null); setIsModalOpen(true); };
    const handleDeleteTransfer = async (transferId) => {
        if (!window.confirm("¿Estás seguro de que quieres eliminar este fichaje de forma permanente?")) return;
        const loadingToast = toast.loading('Eliminando fichaje...');
        try {
            await deleteDoc(doc(db, 'leagues', league.id, 'transfers', transferId));
            toast.success('Fichaje eliminado', { id: loadingToast });
        } catch (error) { toast.error('No se pudo eliminar el fichaje.', { id: loadingToast }); }
    };

    const { currentTransfers, totalPages } = useMemo(() => {
        const indexOfLastItem = currentPage * itemsPerPage;
        const indexOfFirstItem = indexOfLastItem - itemsPerPage;
        const currentItems = allTransfers.slice(indexOfFirstItem, indexOfLastItem);
        const totalPages = Math.ceil(allTransfers.length / itemsPerPage);
        return { currentTransfers: currentItems, totalPages };
    }, [allTransfers, currentPage, itemsPerPage]);

    if (loading) return <p>Cargando datos de fichajes...</p>;

    return (
        <div className="space-y-6">
            {league.userRole === 'admin' && (<RegisterTransferModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} league={league} onTransferRegistered={() => {}} existingTransfer={editingTransfer}/>)}
            
            <div className="flex border-b">
                <button onClick={() => setActiveSubTab('history')} className={`flex items-center gap-2 px-4 py-2 font-semibold ${activeSubTab === 'history' ? 'border-b-2 border-emerald-500 text-emerald-500' : 'text-gray-500'}`}><History size={18}/> Historial</button>
                <button onClick={() => setActiveSubTab('stats')} className={`flex items-center gap-2 px-4 py-2 font-semibold ${activeSubTab === 'stats' ? 'border-b-2 border-emerald-500 text-emerald-500' : 'text-gray-500'}`}><BarChart2 size={18}/> Estadísticas</button>
            </div>

            {activeSubTab === 'history' && (
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
                        <div className="flex items-baseline gap-2"><h3 className="text-lg font-semibold text-gray-800">Historial de Movimientos</h3><span className="font-bold text-emerald-600">{allTransfers.length}</span></div>
                        {league.userRole === 'admin' && (<button onClick={handleOpenModalForCreate} className="btn-primary flex items-center gap-2"><span className="text-xl font-light">+</span>Registrar Fichaje</button>)}
                    </div>
                    
                    {allTransfers.length > 0 && (
                        <div className="flex flex-wrap justify-between items-center mb-4 gap-4 text-sm">
                            <div className="flex items-center gap-2">
                                <span>Mostrar</span>
                                <select value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} className="input !py-1 !px-2 !w-auto">
                                    <option value={10}>10</option>
                                    <option value={20}>20</option>
                                    <option value={50}>50</option>
                                </select>
                                <span>fichajes por página.</span>
                            </div>
                            {totalPages > 1 && (
                                <div className="flex items-center gap-2">
                                    <button onClick={() => setCurrentPage(c => Math.max(1, c - 1))} disabled={currentPage === 1} className="p-1 disabled:opacity-50"><ChevronLeft/></button>
                                    <span>Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong></span>
                                    <button onClick={() => setCurrentPage(c => Math.min(totalPages, c + 1))} disabled={currentPage === totalPages} className="p-1 disabled:opacity-50"><ChevronRight/></button>
                                </div>
                            )}
                        </div>
                    )}
                    
                    <div className="space-y-4">
                        {currentTransfers.length > 0 ? (
                            currentTransfers.map(t => <TransferLogRow key={t.id} transfer={t} members={league.members} userRole={league.userRole} onEdit={handleOpenModalForEdit} onDelete={handleDeleteTransfer} />)
                        ) : (
                            <p className="text-center text-gray-500 py-8">No hay fichajes registrados todavía.</p>
                        )}
                    </div>
                </div>
            )}
            
            {activeSubTab === 'stats' && <TransferStats transfers={allTransfers} members={league.members} />}
        </div>
    );
}