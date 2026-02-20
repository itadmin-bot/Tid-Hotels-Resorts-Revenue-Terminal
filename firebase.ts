
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { 
  initializeFirestore, 
  enableIndexedDbPersistence, 
  CACHE_SIZE_UNLIMITED 
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCvDaoXA3PMpdLZfLKp85UjJWLlss9zmcY",
  authDomain: "tidehotelsreceipt.firebaseapp.com",
  projectId: "tidehotelsreceipt",
  storageBucket: "tidehotelsreceipt.firebasestorage.app",
  messagingSenderId: "452552005353",
  appId: "1:452552005353:web:4572ee47d3042ac1424278"
};

// Singleton Pattern for Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

// Initialize Firestore with specific settings for stability
export const db = initializeFirestore(app, {
  cacheSizeBytes: CACHE_SIZE_UNLIMITED,
  // Force long polling if WebChannel/WebSockets are unstable in this environment
  experimentalForceLongPolling: true,
});

// Enable offline persistence
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn("Firestore Persistence failed: Multiple tabs open");
  } else if (err.code === 'unimplemented') {
    console.warn("Firestore Persistence failed: Browser not supported");
  }
});

export const googleProvider = new GoogleAuthProvider();
