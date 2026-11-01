import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase.js";

const AuthCtx = createContext(null);

// Xoá mọi bản nhớ dữ liệu trên máy (khoá cache của store.jsx + bản sửa chờ lưu + cache báo cáo trong phiên)
function clearLocalData() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("qws-cache:") || k === "quang-workspace-v4" || k === "quang-workspace-pending") localStorage.removeItem(k);
    sessionStorage.clear();
  } catch { /* chế độ riêng tư */ }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = đang tải

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const api = {
    session,
    user: session?.user || null,
    loading: session === undefined,
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signUp: (email, password) => supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } }), // link xác nhận email quay về đúng app (cần có trong Redirect URLs của Supabase)
    changePassword: (password) => supabase.auth.updateUser({ password }),
    // Đăng xuất = xoá luôn bản nhớ dữ liệu trên máy (máy dùng chung không còn số của người trước)
    signOut: async () => { const r = await supabase.auth.signOut(); clearLocalData(); return r; },
  };
  return <AuthCtx.Provider value={api}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
