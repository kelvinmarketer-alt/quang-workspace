import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
// Trang khác tải KHI MỞ (chunk riêng) → mở app nhanh hơn; Tổng quan tải sẵn vì là trang đầu.
const Customers = lazy(() => import("./pages/Customers.jsx"));
const Ketoan = lazy(() => import("./pages/Ketoan.jsx"));
const Funds = lazy(() => import("./pages/Funds.jsx"));
const Tasks = lazy(() => import("./pages/Tasks.jsx"));
const Coin = lazy(() => import("./pages/Coin.jsx"));
const Ads = lazy(() => import("./pages/Ads.jsx"));
const Vault = lazy(() => import("./pages/Vault.jsx"));
const Resources = lazy(() => import("./pages/Resources.jsx"));
const Settings = lazy(() => import("./pages/Settings.jsx"));
const Web = lazy(() => import("./pages/Web.jsx"));
const Fanpage = lazy(() => import("./pages/Fanpage.jsx"));

const PageLoading = () => (
  <div className="flex items-center justify-center py-24"><div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-500" /></div>
);
import { useData } from "./lib/store.jsx";
import { ROUTE_FEATURE } from "./lib/permissions.js";

function firstAllowed(perms) {
  if (perms.includes("dashboard")) return "/";
  if (perms.includes("customers")) return "/khach-hang";
  if (perms.includes("ketoan")) return "/ke-toan";
  if (perms.includes("tasks")) return "/cong-viec";
  return "/cai-dat";
}

export default function App() {
  const { perms = [] } = useData();
  // Chặn theo quyền: trang có feature mà mình không được cấp → chuyển về trang đầu tiên được phép.
  const g = (path, el) => {
    const feat = ROUTE_FEATURE[path];
    return feat && !perms.includes(feat) ? <Navigate to={firstAllowed(perms)} replace /> : el;
  };
  return (
    <Layout>
      <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/" element={g("/", <Dashboard />)} />
        <Route path="/khach-hang" element={g("/khach-hang", <Customers />)} />
        <Route path="/du-an" element={g("/du-an", <Customers />)} />
        <Route path="/don-hang" element={g("/don-hang", <Customers />)} />
        <Route path="/ke-toan" element={g("/ke-toan", <Ketoan />)} />
        <Route path="/chi-phi" element={g("/chi-phi", <Ketoan initialTab="expenses" />)} />
        <Route path="/quy" element={g("/quy", <Funds />)} />
        <Route path="/quy-thong-ke" element={g("/quy-thong-ke", <Funds initialTab="stats" />)} />
        <Route path="/cong-viec" element={g("/cong-viec", <Tasks />)} />
        <Route path="/lich" element={g("/lich", <Tasks initialTab="calendar" />)} />
        <Route path="/coin" element={g("/coin", <Coin />)} />
        <Route path="/quang-cao" element={g("/quang-cao", <Ads />)} />
        <Route path="/tai-nguyen" element={g("/tai-nguyen", <Resources />)} />
        <Route path="/website" element={g("/website", <Web />)} />
        <Route path="/fanpage" element={g("/fanpage", <Fanpage />)} />
        <Route path="/tai-khoan" element={<Vault />} />
        <Route path="/cai-dat" element={<Settings />} />
      </Routes>
      </Suspense>
    </Layout>
  );
}
