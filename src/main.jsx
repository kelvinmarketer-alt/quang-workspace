import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "./lib/auth.jsx";
import { DataProvider } from "./lib/store.jsx";
import Login from "./pages/Login.jsx";
import App from "./App.jsx";
import "./index.css";

function Gate() {
  const { loading, session } = useAuth();
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 text-slate-400">
        <Loader2 size={28} className="animate-spin" />
      </div>
    );
  }
  if (!session) return <Login />;
  return (
    <DataProvider key={session.user.id}>
      <App />
    </DataProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// App mở lâu qua 1 lần cập nhật → file trang cũ đã bị thay → tải lại 1 lần (thay vì màn trắng)
window.addEventListener("vite:preloadError", (e) => {
  try { if (sessionStorage.getItem("qws-chunk-reload")) return; sessionStorage.setItem("qws-chunk-reload", "1"); } catch { /* bỏ qua */ }
  e.preventDefault();
  window.location.reload();
});
// Mở ổn định 10 giây → cho phép lần sau tự tải lại tiếp
setTimeout(() => { try { sessionStorage.removeItem("qws-chunk-reload"); } catch { /* bỏ qua */ } }, 10000);

// Đăng ký Service Worker (Web Push nền + mở app khi mất mạng)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
