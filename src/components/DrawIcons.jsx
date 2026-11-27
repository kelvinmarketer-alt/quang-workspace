// Biểu tượng công cụ vẽ (27/11) — nét mảnh kiểu TradingView, vẽ tay bằng SVG 18×18, màu theo chữ (currentColor)
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round" };
const dot = (cx, cy, r = 1.9) => <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth="1.3" />;
const ICONS = {
  cursor: <path {...P} d="M4 3l9.5 6.2-4.2.9 2.4 4.6-1.7.9-2.4-4.6-3 3z" />,
  trend: <>{dot(4, 14)}{dot(14, 4)}<path {...P} d="M5.4 12.6l7.2-7.2" /></>,
  ray: <>{dot(4, 14)}{dot(9.5, 8.5)}<path {...P} d="M5.4 12.6l2.7-2.7M10.9 7.1L16 2" /></>,
  xline: <>{dot(7, 11)}{dot(11, 7)}<path {...P} d="M2 16l3.6-3.6M8.4 9.6l1.2-1.2M12.4 5.6L16 2" /></>,
  hline: <>{dot(9, 9)}<path {...P} d="M1.5 9h5.6M10.9 9h5.6" /></>,
  hray: <>{dot(4, 9)}<path {...P} d="M5.9 9h10.6" /></>,
  vline: <>{dot(9, 9)}<path {...P} d="M9 1.5v5.6M9 10.9v5.6" /></>,
  channel: <>{dot(3.5, 9)}{dot(14.5, 3)}<path {...P} d="M5 8.2l8-4.4M3.5 15.5L14.5 9.5" /><path {...P} strokeDasharray="1.6 2" d="M3.5 12.2l11-6" /></>,
  path: <>{dot(3, 13)}{dot(7.5, 6)}{dot(11, 12)}{dot(15.5, 4.5)}<path {...P} d="M4 11.4l2.5-3.8M8.6 7.6l1.4 2.8M12.2 10.6l2.4-4.4" /></>,
  brush: <path {...P} d="M2.5 14.5c1.6.4 3-.3 3.4-1.8.4-1.4 1.6-2 2.8-1.6l6.3-7.4c.6-.7.3-1.6-.5-1.6-.4 0-.8.2-1 .5L7.4 9.9c-1.6-.1-2.9.9-3.2 2.4-.2.9-.9 1.6-1.7 2.2z" />,
  rect: <>{dot(3.5, 3.5)}{dot(14.5, 14.5)}{dot(14.5, 3.5)}{dot(3.5, 14.5)}<path {...P} d="M5.4 3.5h7.2M5.4 14.5h7.2M3.5 5.4v7.2M14.5 5.4v7.2" /></>,
  fib: <><path {...P} d="M2 3.5h14M2 7.2h14M2 10.8h14M2 14.5h14" /><path {...P} strokeDasharray="1.6 2" d="M3 14.5L15 3.5" /></>,
  long: <><path {...P} d="M2.5 9h13" /><rect x="3" y="2.5" width="12" height="6.5" rx="1" fill="currentColor" opacity="0.18" stroke="none" /><rect x="3" y="9" width="12" height="4.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.1" opacity="0.6" /><path {...P} d="M9 7.6V4M7.4 5.4L9 3.8l1.6 1.6" /></>,
  short: <><path {...P} d="M2.5 9h13" /><rect x="3" y="9" width="12" height="6.5" rx="1" fill="currentColor" opacity="0.18" stroke="none" /><rect x="3" y="4.5" width="12" height="4.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.1" opacity="0.6" /><path {...P} d="M9 10.4V14M7.4 12.6L9 14.2l1.6-1.6" /></>,
  measure: <><rect x="2.5" y="2.5" width="13" height="13" rx="1.5" {...P} /><path {...P} d="M9 5v8M6.8 7.2L9 5l2.2 2.2M5 9h8M10.8 6.8L13 9l-2.2 2.2" /></>,
  vrp: <><path {...P} d="M2.5 2v14" /><path d="M3.5 3h4.5v2H3.5zM3.5 6h9v2h-9zM3.5 9h12v2h-12zM3.5 12h6v2h-6z" fill="currentColor" opacity="0.55" /></>,
  text: <path {...P} d="M4 4.5h10M9 4.5V15M6.8 15h4.4" />,
  alert: <><path {...P} d="M9 2.5c-2.6 0-4.4 2-4.4 4.6v3.2L3 12.6h12l-1.6-2.3V7.1C13.4 4.5 11.6 2.5 9 2.5z" /><path {...P} d="M7.3 14.6a1.8 1.8 0 003.4 0" /></>,
  callout: <><path {...P} d="M2.5 3.5h13v8.5H8.5L5 15v-3H2.5z" /><path {...P} d="M5.5 6.6h7M5.5 9h4.5" /></>,
};
export function DrawIcon({ k, size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">{ICONS[k] || ICONS.trend}</svg>;
}
