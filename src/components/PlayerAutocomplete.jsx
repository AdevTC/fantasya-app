import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '../config/firebase';

export default function PlayerAutocomplete({ onPlayerSelect, initialValue = '' }) {
    const [inputValue, setInputValue] = useState(initialValue);
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [allPlayers, setAllPlayers] = useState([]); // <-- El estado ahora vive dentro del componente
    const wrapperRef = useRef(null);
    
    useEffect(() => { setInputValue(initialValue || ''); }, [initialValue]);

    // --- LÓGICA CORREGIDA: Se ejecuta cada vez que el componente se hace visible ---
    useEffect(() => {
        const fetchPlayers = async () => {
            setLoading(true);
            const playersRef = collection(db, "players");
            const q = query(playersRef, orderBy("name"));
            const querySnapshot = await getDocs(q);
            const playerList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAllPlayers(playerList);
            setLoading(false);
        };
        fetchPlayers();
    }, []);
    
    useEffect(() => {
        function handleClickOutside(event) { if (wrapperRef.current && !wrapperRef.current.contains(event.target)) { setSuggestions([]); } }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);

    const handleChange = (e) => {
        const value = e.target.value;
        setInputValue(value);
        if (value.length > 1) {
            const filteredSuggestions = allPlayers.filter(player => player.name.toLowerCase().includes(value.toLowerCase()));
            setSuggestions(filteredSuggestions);
        } else {
            setSuggestions([]);
        }
    };

    const handleSelectSuggestion = (player) => {
        setInputValue(player.name);
        onPlayerSelect(player);
        setSuggestions([]);
    };

    return (
        <div ref={wrapperRef} className="relative">
            <input type="text" value={inputValue} onChange={handleChange} placeholder={loading ? "Cargando jugadores..." : "Busca por nombre..."} className="input" disabled={loading} />
            {suggestions.length > 0 && (
                <ul className="absolute z-10 w-full bg-white border border-gray-300 rounded-lg mt-1 max-h-48 overflow-y-auto shadow-lg">
                    {suggestions.map((player) => (
                        <li key={player.id} onClick={() => handleSelectSuggestion(player)} className="px-4 py-2 hover:bg-emerald-50 cursor-pointer">{player.name}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}