// src/utils/formationLayouts.js

// Posiciones para cada formación en HORIZONTAL.
export const formationLayouts = {
    '3-3-4': {
        GK: [{ top: '45%', left: '5%' }],
        DF: [{ top: '25%', left: '25%' }, { top: '45%', left: '25%' }, { top: '65%', left: '25%' }],
        MF: [{ top: '25%', left: '50%' }, { top: '45%', left: '50%' }, { top: '65%', left: '50%' }],
        FW: [{ top: '15%', left: '75%' }, { top: '35%', left: '75%' }, { top: '55%', left: '75%' }, { top: '75%', left: '75%' }]
    },
    '3-4-3': {
        GK: [{ top: '45%', left: '5%' }],
        DF: [{ top: '25%', left: '25%' }, { top: '45%', left: '25%' }, { top: '65%', left: '25%' }],
        MF: [{ top: '15%', left: '50%' }, { top: '35%', left: '50%' }, { top: '55%', left: '50%' }, { top: '75%', left: '50%' }],
        FW: [{ top: '25%', left: '75%' }, { top: '45%', left: '75%' }, { top: '65%', left: '75%' }]
    },
    '3-5-2': {
        GK: [{ top: '45%', left: '5%' }],
        DF: [{ top: '25%', left: '25%' }, { top: '45%', left: '25%' }, { top: '65%', left: '25%' }],
        MF: [{ top: '10%', left: '50%' }, { top: '28%', left: '50%' }, { top: '45%', left: '50%' }, { top: '62%', left: '50%' }, { top: '80%', left: '50%' }],
        FW: [{ top: '35%', left: '75%' }, { top: '55%', left: '75%' }]
    },
    '3-6-1': {
        GK: [{ top: '45%', left: '5%' }],
        DF: [{ top: '25%', left: '25%' }, { top: '45%', left: '25%' }, { top: '65%', left: '25%' }],
        MF: [{ top: '5%', left: '50%' }, { top: '20.8%', left: '50%' }, { top: '36.6%', left: '50%' }, { top: '52.4%', left: '50%' }, { top: '68.2%', left: '50%' }, { top: '84%', left: '50%' }],
        FW: [{ top: '45%', left: '75%' }]
    },
    '4-2-4': {
        GK: [{ top: '45%', left: '5%' }],
        DF: [{ top: '15%', left: '25%' }, { top: '35%', left: '25%' }, { top: '55%', left: '25%' }, { top: '75%', left: '25%' }],
        MF: [{ top: '35%', left: '50%' }, { top: '55%', left: '50%' }],
        FW: [{ top: '15%', left: '75%' }, { top: '35%', left: '75%' }, { top: '55%', left: '75%' }, { top: '75%', left: '75%' }]
    },
    '4-3-3': {
        GK: [{ top: '45%', left: '5%' }],
        DF: [{ top: '15%', left: '25%' }, { top: '35%', left: '25%' }, { top: '55%', left: '25%' }, { top: '75%', left: '25%' }],
        MF: [{ top: '25%', left: '50%' }, { top: '45%', left: '50%' }, { top: '65%', left: '50%' }],
        FW: [{ top: '25%', left: '75%' }, { top: '45%', left: '75%' }, { top: '65%', left: '75%' }]
    },
    '4-4-2': {
        GK: [{ top: '45%', left: '5%' }],
        DF: [{ top: '15%', left: '25%' }, { top: '35%', left: '25%' }, { top: '55%', left: '25%' }, { top: '75%', left: '25%' }],
        MF: [{ top: '15%', left: '50%' }, { top: '35%', left: '50%' }, { top: '55%', left: '50%' }, { top: '75%', left: '50%' }],
        FW: [{ top: '35%', left: '75%' }, { top: '55%', left: '75%' }]
    },
    '4-5-1': {
        GK: [{ top: '45%', left: '5%' }],
        DF: [{ top: '15%', left: '25%' }, { top: '35%', left: '25%' }, { top: '55%', left: '25%' }, { top: '75%', left: '25%' }],
        MF: [{ top: '10%', left: '50%' }, { top: '28%', left: '50%' }, { top: '45%', left: '50%' }, { top: '62%', left: '50%' }, { top: '80%', left: '50%' }],
        FW: [{ top: '45%', left: '75%' }]
    },
    '4-6-0': {
        GK: [{ top: '45%', left: '5%' }],
        DF: [{ top: '15%', left: '25%' }, { top: '35%', left: '25%' }, { top: '55%', left: '25%' }, { top: '75%', left: '25%' }],
        MF: [{ top: '5%', left: '55%' }, { top: '20.8%', left: '55%' }, { top: '36.6%', left: '55%' }, { top: '52.4%', left: '55%' }, { top: '68.2%', left: '55%' }, { top: '84%', left: '55%' }],
        FW: []
    },
    '5-2-3': {
        GK: [{ top: '45%', left: '5%' }],
        DF: [{ top: '10%', left: '25%' }, { top: '28%', left: '25%' }, { top: '45%', left: '25%' }, { top: '62%', left: '25%' }, { top: '80%', left: '25%' }],
        MF: [{ top: '35%', left: '50%' }, { top: '55%', left: '50%' }],
        FW: [{ top: '25%', left: '75%' }, { top: '45%', left: '75%' }, { top: '65%', left: '75%' }]
    },
    '5-3-2': {
        GK: [{ top: '45%', left: '5%' }],
        DF: [{ top: '10%', left: '25%' }, { top: '28%', left: '25%' }, { top: '45%', left: '25%' }, { top: '62%', left: '25%' }, { top: '80%', left: '25%' }],
        MF: [{ top: '25%', left: '50%' }, { top: '45%', left: '50%' }, { top: '65%', left: '50%' }],
        FW: [{ top: '35%', left: '75%' }, { top: '55%', left: '75%' }]
    },
    '5-4-1': {
        GK: [{ top: '45%', left: '5%' }],
        DF: [{ top: '10%', left: '25%' }, { top: '28%', left: '25%' }, { top: '45%', left: '25%' }, { top: '62%', left: '25%' }, { top: '80%', left: '25%' }],
        MF: [{ top: '15%', left: '50%' }, { top: '35%', left: '50%' }, { top: '55%', left: '50%' }, { top: '75%', left: '50%' }],
        FW: [{ top: '45%', left: '75%' }]
    },
};

// Posiciones para cada formación en VERTICAL (para móviles), usando CSS Grid.
// El grid tiene 6 filas y 5 columnas.
export const verticalFormationLayouts = {
    '3-4-3': {
        FW: [{ gridRow: 2, gridColumn: '2 / span 1' }, { gridRow: 2, gridColumn: '3 / span 1' }, { gridRow: 2, gridColumn: '4 / span 1' }],
        MF: [{ gridRow: 3, gridColumn: '1 / span 1' }, { gridRow: 3, gridColumn: '2 / span 1' }, { gridRow: 3, gridColumn: '4 / span 1' }, { gridRow: 3, gridColumn: '5 / span 1' }],
        DF: [{ gridRow: 4, gridColumn: '2 / span 1' }, { gridRow: 4, gridColumn: '3 / span 1' }, { gridRow: 4, gridColumn: '4 / span 1' }],
        GK: [{ gridRow: 5, gridColumn: '3 / span 1' }]
    },
    '3-5-2': {
        FW: [{ gridRow: 2, gridColumn: '2 / span 1' }, { gridRow: 2, gridColumn: '4 / span 1' }],
        MF: [{ gridRow: 3, gridColumn: '1 / span 1' }, { gridRow: 3, gridColumn: '2 / span 1' }, { gridRow: 3, gridColumn: '3 / span 1' }, { gridRow: 3, gridColumn: '4 / span 1' }, { gridRow: 3, gridColumn: '5 / span 1' }],
        DF: [{ gridRow: 4, gridColumn: '2 / span 1' }, { gridRow: 4, gridColumn: '3 / span 1' }, { gridRow: 4, gridColumn: '4 / span 1' }],
        GK: [{ gridRow: 5, gridColumn: '3 / span 1' }]
    },
    '4-3-3': {
        FW: [{ gridRow: 2, gridColumn: '2 / span 1' }, { gridRow: 2, gridColumn: '3 / span 1' }, { gridRow: 2, gridColumn: '4 / span 1' }],
        MF: [{ gridRow: 3, gridColumn: '2 / span 1' }, { gridRow: 3, gridColumn: '3 / span 1' }, { gridRow: 3, gridColumn: '4 / span 1' }],
        DF: [{ gridRow: 4, gridColumn: '1 / span 1' }, { gridRow: 4, gridColumn: '2 / span 1' }, { gridRow: 4, gridColumn: '4 / span 1' }, { gridRow: 4, gridColumn: '5 / span 1' }],
        GK: [{ gridRow: 5, gridColumn: '3 / span 1' }]
    },
    '4-4-2': {
        FW: [{ gridRow: 2, gridColumn: '2 / span 1' }, { gridRow: 2, gridColumn: '4 / span 1' }],
        MF: [{ gridRow: 3, gridColumn: '1 / span 1' }, { gridRow: 3, gridColumn: '2 / span 1' }, { gridRow: 3, gridColumn: '4 / span 1' }, { gridRow: 3, gridColumn: '5 / span 1' }],
        DF: [{ gridRow: 4, gridColumn: '1 / span 1' }, { gridRow: 4, gridColumn: '2 / span 1' }, { gridRow: 4, gridColumn: '4 / span 1' }, { gridRow: 4, gridColumn: '5 / span 1' }],
        GK: [{ gridRow: 5, gridColumn: '3 / span 1' }]
    },
    '4-5-1': {
        FW: [{ gridRow: 2, gridColumn: '3 / span 1' }],
        MF: [{ gridRow: 3, gridColumn: '1 / span 1' }, { gridRow: 3, gridColumn: '2 / span 1' }, { gridRow: 3, gridColumn: '3 / span 1' }, { gridRow: 3, gridColumn: '4 / span 1' }, { gridRow: 3, gridColumn: '5 / span 1' }],
        DF: [{ gridRow: 4, gridColumn: '1 / span 1' }, { gridRow: 4, gridColumn: '2 / span 1' }, { gridRow: 4, gridColumn: '4 / span 1' }, { gridRow: 4, gridColumn: '5 / span 1' }],
        GK: [{ gridRow: 5, gridColumn: '3 / span 1' }]
    },
    '5-3-2': {
        FW: [{ gridRow: 2, gridColumn: '2 / span 1' }, { gridRow: 2, gridColumn: '4 / span 1' }],
        MF: [{ gridRow: 3, gridColumn: '2 / span 1' }, { gridRow: 3, gridColumn: '3 / span 1' }, { gridRow: 3, gridColumn: '4 / span 1' }],
        DF: [{ gridRow: 4, gridColumn: '1 / span 1' }, { gridRow: 4, gridColumn: '2 / span 1' }, { gridRow: 4, gridColumn: '3 / span 1' }, { gridRow: 4, gridColumn: '4 / span 1' }, { gridRow: 4, gridColumn: '5 / span 1' }],
        GK: [{ gridRow: 5, gridColumn: '3 / span 1' }]
    },
    '5-4-1': {
        FW: [{ gridRow: 2, gridColumn: '3 / span 1' }],
        MF: [{ gridRow: 3, gridColumn: '1 / span 1' }, { gridRow: 3, gridColumn: '2 / span 1' }, { gridRow: 3, gridColumn: '4 / span 1' }, { gridRow: 3, gridColumn: '5 / span 1' }],
        DF: [{ gridRow: 4, gridColumn: '1 / span 1' }, { gridRow: 4, gridColumn: '2 / span 1' }, { gridRow: 4, gridColumn: '3 / span 1' }, { gridRow: 4, gridColumn: '4 / span 1' }, { gridRow: 4, gridColumn: '5 / span 1' }],
        GK: [{ gridRow: 5, gridColumn: '3 / span 1' }]
    },
    '3-3-4': {
        FW: [{ gridRow: 2, gridColumn: '1 / span 1' }, { gridRow: 2, gridColumn: '2 / span 1' }, { gridRow: 2, gridColumn: '4 / span 1' }, { gridRow: 2, gridColumn: '5 / span 1' }],
        MF: [{ gridRow: 3, gridColumn: '2 / span 1' }, { gridRow: 3, gridColumn: '3 / span 1' }, { gridRow: 3, gridColumn: '4 / span 1' }],
        DF: [{ gridRow: 4, gridColumn: '2 / span 1' }, { gridRow: 4, gridColumn: '3 / span 1' }, { gridRow: 4, gridColumn: '4 / span 1' }],
        GK: [{ gridRow: 5, gridColumn: '3 / span 1' }]
    },
    '3-6-1': {
        FW: [{ gridRow: 2, gridColumn: '3 / span 1' }],
        MF: [{ gridRow: 3, gridColumn: '1 / span 1' }, { gridRow: 3, gridColumn: '2 / span 1' }, { gridRow: 3, gridColumn: '3 / span 1' }, { gridRow: 3, gridColumn: '4 / span 1' }, { gridRow: 3, gridColumn: '5 / span 1' }, { gridRow: 4, gridColumn: '3 / span 1' }],
        DF: [{ gridRow: 5, gridColumn: '2 / span 1' }, { gridRow: 5, gridColumn: '3 / span 1' }, { gridRow: 5, gridColumn: '4 / span 1' }],
        GK: [{ gridRow: 6, gridColumn: '3 / span 1' }]
    },
    '4-2-4': {
        FW: [{ gridRow: 2, gridColumn: '1 / span 1' }, { gridRow: 2, gridColumn: '2 / span 1' }, { gridRow: 2, gridColumn: '4 / span 1' }, { gridRow: 2, gridColumn: '5 / span 1' }],
        MF: [{ gridRow: 3, gridColumn: '2 / span 1' }, { gridRow: 3, gridColumn: '4 / span 1' }],
        DF: [{ gridRow: 4, gridColumn: '1 / span 1' }, { gridRow: 4, gridColumn: '2 / span 1' }, { gridRow: 4, gridColumn: '4 / span 1' }, { gridRow: 4, gridColumn: '5 / span 1' }],
        GK: [{ gridRow: 5, gridColumn: '3 / span 1' }]
    },
    '4-6-0': {
        FW: [],
        MF: [{ gridRow: 2, gridColumn: '1 / span 1' }, { gridRow: 2, gridColumn: '2 / span 1' }, { gridRow: 2, gridColumn: '3 / span 1' }, { gridRow: 3, gridColumn: '2 / span 1' }, { gridRow: 3, gridColumn: '3 / span 1' }, { gridRow: 3, gridColumn: '4 / span 1' }],
        DF: [{ gridRow: 4, gridColumn: '1 / span 1' }, { gridRow: 4, gridColumn: '2 / span 1' }, { gridRow: 4, gridColumn: '4 / span 1' }, { gridRow: 4, gridColumn: '5 / span 1' }],
        GK: [{ gridRow: 5, gridColumn: '3 / span 1' }]
    },
    '5-2-3': {
        FW: [{ gridRow: 2, gridColumn: '2 / span 1' }, { gridRow: 2, gridColumn: '3 / span 1' }, { gridRow: 2, gridColumn: '4 / span 1' }],
        MF: [{ gridRow: 3, gridColumn: '2 / span 1' }, { gridRow: 3, gridColumn: '4 / span 1' }],
        DF: [{ gridRow: 4, gridColumn: '1 / span 1' }, { gridRow: 4, gridColumn: '2 / span 1' }, { gridRow: 4, gridColumn: '3 / span 1' }, { gridRow: 4, gridColumn: '4 / span 1' }, { gridRow: 4, gridColumn: '5 / span 1' }],
        GK: [{ gridRow: 5, gridColumn: '3 / span 1' }]
    },
};