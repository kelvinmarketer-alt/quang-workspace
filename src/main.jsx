import React, { lazy, Suspense, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "./lib/auth.jsx";
import { officeOnlyAccount } from "./lib/officeOnly.js";
import { DataProvider } from "./lib/store.jsx";
import Login from "./pages/Login.jsx";
import App, { prefetchRoute } from "./App.jsx";
import { sharedToken } from "./lib/sharedToken.js";
const SharedDoc = lazy(() => import("./pages/SharedDoc.jsx")); // chỉ tải khi mở link chia sẻ
// 28/11: phông Be Vietnam Pro đi kèm app (trước tải từ Google Fonts: chặn hiển thị ~0,6 giây trên 4G + chữ nhảy khi phông về)
// Chỉ bộ chữ latin + vietnamese (bỏ latin-ext: trùng dải ký tự với vietnamese nên trước tải thừa 5 file)
import "@fontsource/be-vietnam-pro/latin-400.css";
import "@fontsource/be-vietnam-pro/vietnamese-400.css";
import "@fontsource/be-vietnam-pro/latin-500.css";
import "@fontsource/be-vietnam-pro/vietnamese-500.css";
import "@fontsource/be-vietnam-pro/latin-600.css";
import "@fontsource/be-vietnam-pro/vietnamese-600.css";
import "@fontsource/be-vietnam-pro/latin-700.css";
import "@fontsource/be-vietnam-pro/vietnamese-700.css";
import "@fontsource/be-vietnam-pro/latin-800.css";
import "@fontsource/be-vietnam-pro/vietnamese-800.css";
import "./index.css";
import "./lib/theme.js"; // áp giao diện sáng/tối đã lưu ngay khi mở app
import { initMotion } from "./lib/motion.js";
initMotion(); // hiệu ứng cuộn tới đâu chạy tới đó (thẻ, biểu đồ, thanh, bảng, số)
if (!sharedToken()) prefetchRoute(); // tải sẵn mã trang đang mở, song song với kiểm đăng nhập

function Gate() {
  const { loading, session } = useAuth();
  // 16/11/2026: tài khoản chỉ thuộc Văn phòng AI → vào /van-phong/ (không tạo Workspace trống)
  const uid = session?.user?.id;
  const [office, setOffice] = useState(null); // null = đang kiểm, false = dùng Workspace
  // 28/11 (đo tốc độ 4G): đã từng xác nhận là tài khoản Workspace trên máy này → vẽ app NGAY, kiểm lại chạy ngầm
  // (trước: mỗi lần mở chờ 1–4 truy vấn mạng rồi mới vẽ). Dữ liệu vẫn do máy chủ chặn theo quyền; đây chỉ là chuyển hướng giao diện.
  const okKey = uid ? `qws_ws_ok_${uid}` : null;
  const known = (() => { try { return !!okKey && localStorage.getItem(okKey) === "1"; } catch { return false; } })();
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    setOffice(null);
    officeOnlyAccount(uid).then((v) => {
      if (!alive) return;
      if (v) { try { localStorage.removeItem(okKey); } catch { /* bỏ qua */ } window.location.replace("/van-phong/"); }
      else { try { localStorage.setItem(okKey, "1"); } catch { /* bỏ qua */ } setOffice(false); }
    }).catch(() => alive && setOffice(false));
    return () => { alive = false; };
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps
  if (loading || (session && office !== false && !known)) {
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
      {/* 09/11: link chia sẻ tài liệu /xem/<mã> — mở KHÔNG cần đăng nhập, không nạp dữ liệu workspace */}
      {sharedToken() ? <Suspense fallback={<div className="grid min-h-screen place-items-center text-slate-400"><Loader2 className="animate-spin" /></div>}><SharedDoc token={sharedToken()} /></Suspense> : (
        <AuthProvider>
          <Gate />
        </AuthProvider>
      )}
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
