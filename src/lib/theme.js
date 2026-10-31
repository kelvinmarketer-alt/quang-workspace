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
// 01/11: bộ màu cho giao diện tối (html[data-skin], CSS ở index.css) — sếp chọn A "Than chì & Băng" làm mặc định, đổi được cho đỡ nhàm
export const SKINS = [
  { id: "graphite", label: "Than chì & Băng", sub: "Mặc định · sạch, dễ đọc", sw: ["#0b0c0f", "#1b1f25", "#8fd8ff"], meta: "#0b0c0f" },
  { id: "aurora", label: "Kính cực quang", sub: "Kính mờ, dải màu chuyển động", sw: ["#09081a", "#7cf0d4", "#c39bff"], meta: "#09081a" },
  { id: "terminal", label: "Sàn giao dịch đêm", sub: "Xanh đêm + vàng hổ phách", sw: ["#06080e", "#1a2337", "#ffb224"], meta: "#06080e" },
  { id: "neon", label: "Neon (bản cũ)", sub: "Viền phát sáng xanh", sw: ["#060a13", "#22d3ee", "#8b5cf6"], meta: "#060a13" },
];
const SKIN_KEY = "qws_skin";
const readSkin = () => { try { const v = localStorage.getItem(SKIN_KEY); return SKINS.some((x) => x.id === v) ? v : "graphite"; } catch { return "graphite"; } };
let cur = read();
let skin = readSkin();
const apply = () => {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.classList.toggle("theme-dark", cur === "dark");
  el.dataset.skin = skin;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", cur === "dark" ? SKINS.find((x) => x.id === skin)?.meta || "#0b0c0f" : "#4f46e5");
};
apply();

export const getTheme = () => cur;
export function setTheme(v) {
  cur = v === "dark" ? "dark" : "light";
  try { localStorage.setItem(KEY, cur); } catch { /* chế độ riêng tư */ }
  apply();
  subs.forEach((f) => f(cur));
}
export const getSkin = () => skin;
export function setSkin(v) {
  skin = SKINS.some((x) => x.id === v) ? v : "graphite";
  try { localStorage.setItem(SKIN_KEY, skin); } catch { /* chế độ riêng tư */ }
  if (cur !== "dark") { setTheme("dark"); return; }
  apply();
  subs.forEach((f) => f(cur));
}
export function useSkin() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((n) => n + 1); subs.add(f); return () => subs.delete(f); }, []);
  return [skin, setSkin];
}
export function useTheme() {
  const [t, setT] = useState(cur);
  useEffect(() => { subs.add(setT); return () => subs.delete(setT); }, []);
  return [t, setTheme];
}
