// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
// La importación de getAnalytics es opcional, la mantenemos por si la usas en el futuro.
import { getAnalytics } from "firebase/analytics";

// Tu configuración de Firebase para el proyecto "tictaktools"
const firebaseConfig = {
  apiKey: "AIzaSyBFljPQlPpoO5TNCKdlDo-xIHVrC_BexYQ",
  authDomain: "tictaktools.firebaseapp.com",
  projectId: "tictaktools",
  storageBucket: "tictaktools.appspot.com",
  messagingSenderId: "950074372501",
  appId: "1:950074372501:web:306aba6f3e0c63cd9b869c",
  measurementId: "G-WQSCDZTHPL"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Inicializar servicios y exportarlos para usarlos en toda la app
const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);