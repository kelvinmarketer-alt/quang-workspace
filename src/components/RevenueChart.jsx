// Biểu đồ thu nhập theo tháng ở Tổng quan (13/11: dự án đã thành Lương → 1 đường; dữ liệu cũ có "thu" vẫn vẽ) — tách file để tải sau (recharts nặng)
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { formatVND, formatShort } from "./ui.jsx";

export default function RevenueChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ left: 0, right: 6, top: 8 }}>
        <defs>
          <linearGradient id="gThu" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} /><stop offset="100%" stopColor="#6366f1" stopOpacity={0} /></linearGradient>
          <linearGradient id="gLn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={formatShort} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={54} />
        <Tooltip formatter={(v, n) => [formatVND(v), n === "thu" ? "Doanh thu" : "Thu nhập"]} contentStyle={{ borderRadius: 12, border: "1px solid #eef0f6", fontSize: 12 }} />
        {data?.some((d) => d.thu != null) && <Area type="monotone" dataKey="thu" stroke="#6366f1" strokeWidth={2.5} fill="url(#gThu)" isAnimationActive={false} />}
        <Area type="monotone" dataKey="ln" stroke="#10b981" strokeWidth={2.5} fill="url(#gLn)" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
