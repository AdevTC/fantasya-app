import React from 'react';
import { Flame, ArrowUp, Zap, Crown, Gem } from 'lucide-react';

export const eventAchievementsConfig = {
    // --- HAZAÑAS DE RENDIMIENTO ---
    RACHA_IMPARABLE: {
        id: 'RACHA_IMPARABLE',
        name: 'Racha Imparable',
        description: 'Gana 3 jornadas de forma consecutiva en la misma temporada.',
        icon: ({ className }) => <Flame className={className} />,
        color: 'text-orange-500'
    },
    REY_DE_LA_REMONTADA: {
        id: 'REY_DE_LA_REMONTADA',
        name: 'Rey de la Remontada',
        description: 'Gana una jornada habiendo quedado fuera del podio (4º o peor) en la jornada anterior.',
        icon: ({ className }) => <ArrowUp className={className} />,
        color: 'text-green-500'
    },
    DOMINIO_ABSOLUTO: {
        id: 'DOMINIO_ABSOLUTO',
        name: 'Dominio Absoluto',
        description: 'Gana una jornada con más de 20 puntos de ventaja sobre el segundo clasificado.',
        icon: ({ className }) => <Crown className={className} />,
        color: 'text-yellow-500'
    },

    // --- HAZAÑAS DE MERCADO ---
    FICHAJE_GALACTICO: {
        id: 'FICHAJE_GALACTICO',
        name: 'Fichaje Galáctico',
        description: 'Ficha a uno de los 5 jugadores con el valor de mercado más alto de la liga.',
        icon: ({ className }) => <Gem className={className} />,
        color: 'text-purple-500'
    },
    OJO_DE_HALCON: {
        id: 'OJO_DE_HALCON',
        name: 'Ojo de Halcón',
        description: 'Ficha a un jugador por menos de 5M y consigue que puntúe más de 10 puntos en la siguiente jornada.',
        icon: ({ className }) => <Zap className={className} />,
        color: 'text-blue-500'
    }
};