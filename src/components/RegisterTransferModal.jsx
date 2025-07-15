import React, { useState, useEffect } from 'react';
import { db } from '../config/firebase';
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import PlayerAutocomplete from './PlayerAutocomplete';

export default function RegisterTransferModal({ isOpen, onClose, league, onTransferRegistered, existingTransfer }) {
    const [player, setPlayer] = useState(null);
    const [price, setPrice] = useState('');
    const [buyerId, setBuyerId] = useState('');
    const [sellerId, setSellerId] = useState('market');
    const [transferType, setTransferType] = useState('puja');
    const [loading, setLoading] = useState(false);
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');

    useEffect(() => {
        if (isOpen) {
            if (existingTransfer) {
                setPlayer({ name: existingTransfer.playerName, id: existingTransfer.playerId });
                setPrice(existingTransfer.price);
                setBuyerId(existingTransfer.buyerId);
                setSellerId(existingTransfer.sellerId);
                setTransferType(existingTransfer.type);
                if (existingTransfer.timestamp) {
                    const existingDate = existingTransfer.timestamp.toDate();
                    setDate(existingDate.toISOString().split('T')[0]);
                    setTime(existingDate.toTimeString().slice(0, 5));
                }
            } else {
                const now = new Date();
                setPlayer(null);
                setPrice('');
                setBuyerId(Object.keys(league.members)[0] || '');
                setSellerId('market');
                setTransferType('puja');
                setDate(now.toISOString().split('T')[0]);
                setTime(now.toTimeString().slice(0, 5));
            }
        }
    }, [isOpen, existingTransfer, league.members]);

    // --- LÓGICA DE Fichajes (Vendedor y Comprador) ---
    useEffect(() => {
        // Si es una puja, el vendedor siempre es el mercado.
        if (transferType === 'puja') {
            setSellerId('market');
        }
        // Si el mercado compra, es siempre un acuerdo.
        if (buyerId === 'market') {
            setTransferType('acuerdo');
        }
    }, [transferType, buyerId]);


    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!player || !price || !buyerId || !sellerId || !date || !time) {
            toast.error("Debes seleccionar un jugador de la lista y rellenar todos los campos.");
            return;
        }
        setLoading(true);
        const loadingToast = toast.loading(existingTransfer ? 'Actualizando fichaje...' : 'Registrando fichaje...');
        const combinedDateTime = new Date(`${date}T${time}`);
        if (isNaN(combinedDateTime.getTime())) {
            toast.error("La fecha o la hora no son válidas.", { id: loadingToast }); setLoading(false); return;
        }

        const transferData = {
            playerId: player.id,
            playerName: player.name,
            price: parseFloat(String(price).replace(',', '.')) || 0,
            buyerId,
            buyerName: buyerId === 'market' ? 'Mercado' : league.members[buyerId]?.teamName,
            sellerId,
            sellerName: sellerId === 'market' ? 'Mercado' : league.members[sellerId]?.teamName,
            type: transferType,
            timestamp: combinedDateTime,
        };

        try {
            if (existingTransfer) {
                const transferRef = doc(db, 'leagues', league.id, 'transfers', existingTransfer.id);
                await updateDoc(transferRef, transferData);
                toast.success('Fichaje actualizado correctamente', { id: loadingToast });
            } else {
                const transfersRef = collection(db, 'leagues', league.id, 'transfers');
                await addDoc(transfersRef, transferData);
                toast.success('Fichaje registrado correctamente', { id: loadingToast });
            }
            onTransferRegistered();
            onClose();
        } catch (error) {
            console.error("Error al registrar el fichaje:", error);
            toast.error("No se pudo completar la operación.", { id: loadingToast });
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-8 w-full max-w-lg shadow-lg">
                <h3 className="text-2xl font-bold text-gray-800 mb-6">{existingTransfer ? 'Editar Fichaje' : 'Registrar Nuevo Fichaje'}</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div><label className="label">Jugador</label><PlayerAutocomplete onPlayerSelect={setPlayer} initialValue={player?.name}/></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label className="label">Fecha del Fichaje</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className="input" /></div>
                        <div><label className="label">Hora del Fichaje</label><input type="time" value={time} onChange={e => setTime(e.target.value)} className="input" /></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="label">Comprador</label>
                            {/* --- Opción de Mercado añadida al comprador --- */}
                            <select value={buyerId} onChange={e => setBuyerId(e.target.value)} className="input">
                                <option value="market">Mercado</option>
                                {Object.entries(league.members).map(([uid, member]) => (<option key={uid} value={uid}>{member.teamName}</option>))}
                            </select>
                        </div>
                        <div>
                            <label className="label">Vendedor</label>
                            {/* El selector de vendedor se deshabilita si el tipo es 'puja' */}
                            <select value={sellerId} onChange={e => setSellerId(e.target.value)} className="input" disabled={transferType === 'puja'}>
                                <option value="market">Mercado</option>
                                {Object.entries(league.members).map(([uid, member]) => (<option key={uid} value={uid}>{member.teamName}</option>))}
                            </select>
                        </div>
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div><label className="label">Precio (€)</label><input type="text" value={price} onChange={e => setPrice(e.target.value)} className="input" placeholder="Ej: 120000000,50" /></div>
                        <div>
                            <label className="label">Tipo de Movimiento</label>
                             {/* El selector de tipo se deshabilita si el comprador es el mercado */}
                            <select value={transferType} onChange={e => setTransferType(e.target.value)} className="input capitalize" disabled={buyerId === 'market'}>
                                <option value="puja">Puja</option>
                                <option value="clausulazo">Clausulazo</option>
                                <option value="acuerdo">Acuerdo</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex justify-end gap-4 pt-4"><button type="button" onClick={onClose} className="btn-secondary">Cancelar</button><button type="submit" disabled={loading} className="btn-primary disabled:opacity-50">{loading ? 'Guardando...' : (existingTransfer ? 'Guardar Cambios' : 'Registrar Fichaje')}</button></div>
                </form>
            </div>
        </div>
    );
}
