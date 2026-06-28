import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Customers from "./pages/Customers.jsx";
import Projects from "./pages/Projects.jsx";
import Ketoan from "./pages/Ketoan.jsx";
import Expenses from "./pages/Expenses.jsx";
import Calendar from "./pages/Calendar.jsx";
import Tasks from "./pages/Tasks.jsx";
import Settings from "./pages/Settings.jsx";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/khach-hang" element={<Customers />} />
        <Route path="/du-an" element={<Projects />} />
        <Route path="/ke-toan" element={<Ketoan />} />
        <Route path="/chi-phi" element={<Expenses />} />
        <Route path="/don-hang" element={<Projects />} />
        <Route path="/lich" element={<Calendar />} />
        <Route path="/cong-viec" element={<Tasks />} />
        <Route path="/cai-dat" element={<Settings />} />
      </Routes>
    </Layout>
  );
}
