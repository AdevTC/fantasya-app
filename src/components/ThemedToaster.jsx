import React from 'react';
import { Toaster } from 'react-hot-toast';
import { useTheme } from '../context/ThemeContext';

export default function ThemedToaster() {
    const { theme } = useTheme();

    return (
        <Toaster
            position="top-center"
            reverseOrder={false}
            toastOptions={{
                success: {
                    duration: 3000,
                    iconTheme: {
                        primary: '#10B981', // emerald-500
                        secondary: theme === 'dark' ? '#1F2937' : 'white',
                    },
                },
                error: {
                    duration: 5000,
                    iconTheme: {
                        primary: '#EF4444', // red-500
                        secondary: theme === 'dark' ? '#1F2937' : 'white',
                    },
                },
                style: {
                    background: theme === 'dark' ? '#1F2937' : '#FFFFFF', // gray-800 or white
                    color: theme === 'dark' ? '#F3F4F6' : '#1F2937', // gray-100 or gray-800
                    border: theme === 'dark' ? '1px solid #374151' : '1px solid #E5E7EB', // gray-700 or gray-200
                },
            }}
        />
    );
}
