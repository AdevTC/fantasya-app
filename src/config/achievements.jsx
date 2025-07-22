import { Trophy, Calendar, BarChart2, Repeat, MessageSquare, Heart } from 'lucide-react';

export const CAREER_ACHIEVEMENTS = {
    SEASONS_PLAYED_3: {
        id: 'SEASONS_PLAYED_3',
        name: 'Veterano',
        description: 'Participa en 3 temporadas.',
        tiers: [3],
        icon: <Calendar />,
        category: 'participation'
    },
    CHAMPIONSHIPS_WON_3: {
        id: 'CHAMPIONSHIPS_WON_3',
        name: 'Leyenda de la Liga',
        description: 'Gana 3 campeonatos de liga.',
        tiers: [3],
        icon: <Trophy />,
        category: 'performance'
    },
    TOTAL_POINTS_50000: {
        id: 'TOTAL_POINTS_50000',
        name: 'El Estratega',
        description: 'Acumula un total de 50,000 puntos en tu carrera.',
        tiers: [10000, 25000, 50000],
        icon: <BarChart2 />,
        category: 'performance'
    },
    TOTAL_TRANSFERS_100: {
        id: 'TOTAL_TRANSFERS_100',
        name: 'Mercader de Élite',
        description: 'Realiza 100 fichajes en tu carrera.',
        tiers: [25, 50, 100],
        icon: <Repeat />,
        category: 'market'
    },
    POSTS_CREATED_50: {
        id: 'POSTS_CREATED_50',
        name: 'Forofo Fiel',
        description: 'Escribe 50 publicaciones en el feed.',
        tiers: [10, 25, 50],
        icon: <MessageSquare />,
        category: 'social'
    },
    LIKES_RECEIVED_500: {
        id: 'LIKES_RECEIVED_500',
        name: 'Socialité',
        description: 'Recibe un total de 500 "me gusta" en tus publicaciones.',
        tiers: [50, 100, 500],
        icon: <Heart />,
        category: 'social'
    },
};