
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
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

// Initialize Firestore with modern persistent cache settings
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
    cacheSizeBytes: CACHE_SIZE_UNLIMITED
  }),
  // Force long polling if WebChannel/WebSockets are unstable in this environment
  experimentalForceLongPolling: true,
});

export const googleProvider = new GoogleAuthProvider();
