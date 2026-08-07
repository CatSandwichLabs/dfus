import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAfYNQB0cJobdcNp_ofbaqxr3FIqqquyZQ",
  authDomain: "dfs-system-3d4ba.firebaseapp.com",
  projectId: "dfs-system-3d4ba",
  storageBucket: "dfs-system-3d4ba.firebasestorage.app",
  messagingSenderId: "61490541481",
  appId: "1:61490541481:web:a56d0d0e0851b5ad5d0ab8",
  measurementId: "G-WV1J2YDZ2C"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
