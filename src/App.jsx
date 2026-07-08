import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Customers from "./pages/Customers.jsx";
import Projects from "./pages/Projects.jsx";
import Ketoan from "./pages/Ketoan.jsx";
import Funds from "./pages/Funds.jsx";
import Tasks from "./pages/Tasks.jsx";
import Settings from "./pages/Settings.jsx";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/khach-hang" element={<Customers />} />
        <Route path="/du-an" element={<Projects />} />
        <Route path="/don-hang" element={<Projects />} />
        <Route path="/ke-toan" element={<Ketoan />} />
        <Route path="/chi-phi" element={<Ketoan initialTab="expenses" />} />
        <Route path="/quy" element={<Funds />} />
        <Route path="/quy-thong-ke" element={<Funds initialTab="stats" />} />
        <Route path="/cong-viec" element={<Tasks />} />
        <Route path="/lich" element={<Tasks initialTab="calendar" />} />
        <Route path="/cai-dat" element={<Settings />} />
      </Routes>
    </Layout>
  );
}
