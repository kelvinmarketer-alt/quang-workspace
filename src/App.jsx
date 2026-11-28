import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import { ConfirmHost } from "./components/ConfirmDialog.jsx";
import { ToastHost } from "./components/Toast.jsx";
import TaskWatch from "./components/TaskWatch.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
// Trang khác tải KHI MỞ (chunk riêng) → mở app nhanh hơn; Tổng quan tải sẵn vì là trang đầu.
const PAGE = {
  Dashboard: () => import("./pages/Dashboard.jsx"),
  Customers: () => import("./pages/Customers.jsx"),
  Ketoan: () => import("./pages/Ketoan.jsx"),
  Tasks: () => import("./pages/Tasks.jsx"),
  Coin: () => import("./pages/Coin.jsx"),
  Ads: () => import("./pages/Ads.jsx"),
  Vault: () => import("./pages/Vault.jsx"),
  Resources: () => import("./pages/Resources.jsx"),
  Settings: () => import("./pages/Settings.jsx"),
  Web: () => import("./pages/Web.jsx"),
  Fanpage: () => import("./pages/Fanpage.jsx"),
  Reports: () => import("./pages/Reports.jsx"),
  Library: () => import("./pages/Library.jsx"),
  Health: () => import("./pages/Health.jsx"),
};
const Dashboard = lazy(PAGE.Dashboard);
const Customers = lazy(PAGE.Customers);
const Ketoan = lazy(PAGE.Ketoan);
const Tasks = lazy(PAGE.Tasks);
const Coin = lazy(PAGE.Coin);
const Ads = lazy(PAGE.Ads);
const Vault = lazy(PAGE.Vault);
const Resources = lazy(PAGE.Resources);
const Settings = lazy(PAGE.Settings);
const Web = lazy(PAGE.Web);
const Fanpage = lazy(PAGE.Fanpage);
const Reports = lazy(PAGE.Reports);
const Library = lazy(PAGE.Library);
const Health = lazy(PAGE.Health);
// 28/11 (đo LCP 4G): tải SẴN mã trang đang mở ngay lúc app khởi động — song song với bước kiểm đăng nhập, không phải chờ xong mới tải
const PATH_PAGE = { "": "Dashboard", "bao-cao": "Reports", "khach-hang": "Customers", "du-an": "Customers", "don-hang": "Customers", "ke-toan": "Ketoan", "chi-phi": "Ketoan", "quy": "Ketoan", "quy-thong-ke": "Ketoan", "tai-san": "Ketoan", "cong-viec": "Tasks", "lich": "Tasks", "coin": "Coin", "quang-cao": "Ads", "tai-nguyen": "Resources", "website": "Web", "fanpage": "Fanpage", "tai-khoan": "Vault", "kho-tai-lieu": "Library", "suc-khoe": "Health", "cai-dat": "Settings" };
export function prefetchRoute(pathname = window.location.pathname) { const k = PATH_PAGE[pathname.split("/")[1] || ""]; if (k) PAGE[k]().catch(() => {}); }

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
  const { perms = [], isOwner } = useData();
  const { pathname } = useLocation();
  // Chặn theo quyền: trang có feature mà mình không được cấp → chuyển về trang đầu tiên được phép.
  const g = (path, el) => {
    const feat = ROUTE_FEATURE[path];
    return feat && !perms.includes(feat) ? <Navigate to={firstAllowed(perms)} replace /> : el;
  };
  return (
    <Layout>
      <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/" element={g("/", <Dashboard />)} />
        <Route path="/bao-cao" element={g("/bao-cao", <Reports />)} />
        <Route path="/bao-cao/:id" element={g("/bao-cao", <Reports />)} />
        <Route path="/khach-hang" element={g("/khach-hang", <Customers />)} />
        <Route path="/du-an" element={g("/du-an", <Customers />)} />
        <Route path="/don-hang" element={g("/don-hang", <Customers />)} />
        <Route path="/ke-toan" element={g("/ke-toan", <Ketoan />)} />
        <Route path="/chi-phi" element={g("/chi-phi", <Ketoan initialTab="expenses" />)} />
        {/* 01/11: Quỹ gộp vào Kế toán (tab Dòng tiền) — link cũ vẫn mở đúng chỗ */}
        <Route path="/quy" element={g("/quy", <Ketoan initialTab="cash" />)} />
        <Route path="/quy-thong-ke" element={g("/quy-thong-ke", <Ketoan initialTab="expenses" spendFocus />)} />
        <Route path="/cong-viec" element={g("/cong-viec", <Tasks />)} />
        <Route path="/lich" element={g("/lich", <Tasks initialTab="calendar" />)} />
        <Route path="/coin" element={g("/coin", <Coin />)} />
        <Route path="/quang-cao" element={g("/quang-cao", <Ads />)} />
        <Route path="/tai-nguyen" element={g("/tai-nguyen", <Resources />)} />
        <Route path="/website" element={g("/website", <Web />)} />
        <Route path="/fanpage" element={g("/fanpage", <Fanpage />)} />
        <Route path="/tai-khoan" element={<Vault />} />
        <Route path="/tai-san" element={g("/tai-san", <Ketoan initialTab="assets" />)} />{/* 17/11: Tài sản thành tab trong Kế toán */}
        {/* 09/11: Kho tài liệu — chủ toàn quyền; thành viên cấp ở Cài đặt → phân quyền (CHỈ XEM; RLS: supabase/SETUP-LIBRARY-MEMBERS.sql) */}
        <Route path="/kho-tai-lieu" element={g("/kho-tai-lieu", <Library />)} />
        {/* 20/11: Sức khoẻ — chỉ chủ (dữ liệu cá nhân, bảng qws_health) */}
        <Route path="/suc-khoe" element={isOwner ? <Health /> : <Navigate to={firstAllowed(perms)} replace />} />
        <Route path="/cai-dat" element={<Settings />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
      <ConfirmHost />
      <ToastHost />
      {/* 11/11: việc lặp lại (tạo lần tới khi xong) + nhắc trước giờ khi app đang mở */}
      <TaskWatch />
    </Layout>
  );
}
