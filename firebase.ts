
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCvDaoXA3PMpdLZfLKp85UjJWLlss9zmcY",
  authDomain: "tidehotelsreceipt.firebaseapp.com",
  projectId: "tidehotelsreceipt",
  storageBucket: "tidehotelsreceipt.firebasestorage.app",
  messagingSenderId: "452552005353",
  appId: "1:452552005353:web:4572ee47d3042ac1424278"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
