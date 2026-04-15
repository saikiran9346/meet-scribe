import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signOut,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { auth, googleProvider } from "../firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  // ✅ Auth functions
  const loginGoogle = () => signInWithPopup(auth, googleProvider);

  const loginEmail = (email, password) =>
    signInWithEmailAndPassword(auth, email, password);

  const signupEmail = (email, password) =>
    createUserWithEmailAndPassword(auth, email, password);

  const logout = () => signOut(auth);

  const getToken = async () =>
    user ? await user.getIdToken() : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        loginGoogle,
        loginEmail,
        signupEmail,
        logout,
        getToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);