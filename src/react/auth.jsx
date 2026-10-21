import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../js/supabase.js";

const AuthContext = createContext({ user: null, loading: true });
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, loading: true });
  useEffect(() => {
    let live = true;
    supabase.auth.getSession().then(({ data }) => {
      if (live) setState({ user: data.session?.user ?? null, loading: false });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (live) setState({ user: session?.user ?? null, loading: false });
    });
    return () => { live = false; sub.subscription.unsubscribe(); };
  }, []);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
