// Giao diện sáng / tối TOÀN APP (21/10): class html.theme-dark → index.css đổi biến màu Tailwind (bố cục giữ nguyên).
// Nhớ theo máy (localStorage qws_theme); máy chưa chọn → TỐI. Bản cũ chỉ có "Pro" ở module Coin (qws_coin_pro) → tự chuyển sang.
import { useEffect, useState } from "react";

const KEY = "qws_theme", subs = new Set();
const read = () => {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "dark" || v === "light") return v;
    return "dark"; // 01/11 sếp chốt: chưa chọn bao giờ → mặc định giao diện tối
  } catch { return "dark"; }
};
let cur = read();
const apply = () => {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("theme-dark", cur === "dark");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", cur === "dark" ? "#060a13" : "#4f46e5");
};
apply();

export const getTheme = () => cur;
export function setTheme(v) {
  cur = v === "dark" ? "dark" : "light";
  try { localStorage.setItem(KEY, cur); } catch { /* chế độ riêng tư */ }
  apply();
  subs.forEach((f) => f(cur));
}
export function useTheme() {
  const [t, setT] = useState(cur);
  useEffect(() => { subs.add(setT); return () => subs.delete(setT); }, []);
  return [t, setTheme];
}
