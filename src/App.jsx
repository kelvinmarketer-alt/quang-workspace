import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Customers from "./pages/Customers.jsx";
import Ketoan from "./pages/Ketoan.jsx";
import Funds from "./pages/Funds.jsx";
import Tasks from "./pages/Tasks.jsx";
import Coin from "./pages/Coin.jsx";
import Ads from "./pages/Ads.jsx";
import Vault from "./pages/Vault.jsx";
import Resources from "./pages/Resources.jsx";
import Settings from "./pages/Settings.jsx";
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
      <Routes>
        <Route path="/" element={g("/", <Dashboard />)} />
        <Route path="/khach-hang" element={g("/khach-hang", <Customers />)} />
        <Route path="/du-an" element={g("/du-an", <Customers />)} />
        <Route path="/don-hang" element={g("/don-hang", <Customers />)} />
        <Route path="/ke-toan" element={g("/ke-toan", <Ketoan />)} />
        <Route path="/chi-phi" element={g("/chi-phi", <Ketoan initialTab="expenses" />)} />
        <Route path="/quy" element={g("/ke-toan", <Funds />)} />
        <Route path="/quy-thong-ke" element={g("/ke-toan", <Funds initialTab="stats" />)} />
        <Route path="/cong-viec" element={g("/cong-viec", <Tasks />)} />
        <Route path="/lich" element={g("/lich", <Tasks initialTab="calendar" />)} />
        <Route path="/coin" element={g("/coin", <Coin />)} />
        <Route path="/quang-cao" element={g("/quang-cao", <Ads />)} />
        <Route path="/tai-nguyen" element={g("/tai-nguyen", <Resources />)} />
        <Route path="/tai-khoan" element={<Vault />} />
        <Route path="/cai-dat" element={<Settings />} />
      </Routes>
    </Layout>
  );
}
