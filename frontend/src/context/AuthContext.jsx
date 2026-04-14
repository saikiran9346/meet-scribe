import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged, signOut,
  signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { auth, googleProvider } from "../firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); });
    return unsub;
  }, []);

  const loginGoogle  = ()         => signInWithPopup(auth, googleProvider);
  const loginEmail   = (e, p)     => signInWithEmailAndPassword(auth, e, p);
  const signupEmail  = (e, p)     => createUserWithEmailAndPassword(auth, e, p);
  const logout       = ()         => signOut(auth);
  const getToken     = async ()   => user ? await user.getIdToken() : null;

  return (
    <AuthContext.Provider value={{ user, loading, loginGoogle, loginEmail, signupEmail, logout, getToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);