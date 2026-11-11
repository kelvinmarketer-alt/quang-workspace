// Tuỳ chỉnh Tổng quan (11/11): chọn ô nào hiện + thứ tự — lưu theo từng người trong settings.dashLayout[email]
// (tài khoản phụ không ghi được settings → giữ ở trình duyệt). Mặc định = bố cục bento sếp đã duyệt.
export const DASH_BLOCKS = [
  { id: "today", label: "Việc của hôm nay", hint: "Cần thu, việc, gia hạn, việc gấp" },
  { id: "week", label: "Tuần này", hint: "Lịch tuần, sắp tới, cảnh báo, thu tiền" },
  { id: "kpi", label: "4 số chính", hint: "Doanh thu, lợi nhuận, công nợ, chi quảng cáo" },
  { id: "health", label: "Sức khoẻ thương hiệu", hint: "Kênh nào dưới chỉ tiêu (tài khoản phụ: top khách)" },
  { id: "year", label: "Tiến độ năm", hint: "Mục tiêu doanh thu cả năm" },
  { id: "chart", label: "Biểu đồ doanh thu", hint: "Doanh thu & lợi nhuận theo tháng" },
  { id: "coin", label: "Đầu tư Coin", hint: "Kết quả Demo" },
  { id: "receipts", label: "Phiếu thu gần đây", hint: "5 phiếu thu mới nhất" },
];
export const DEFAULT_ORDER = DASH_BLOCKS.map((b) => b.id);
// Điện thoại: chỉ hiện ngay N ô đầu, còn lại bấm "Xem thêm"
export const PHONE_FIRST = 4;

// Làm sạch dữ liệu đã lưu: bỏ id lạ / trùng, ô mới (chưa có trong bản lưu) chèn đúng chỗ mặc định
export function normalizeLayout(raw) {
  const known = new Set(DEFAULT_ORDER);
  const order = [];
  for (const id of Array.isArray(raw?.order) ? raw.order : []) if (known.has(id) && !order.includes(id)) order.push(id);
  DEFAULT_ORDER.forEach((id, i) => {
    if (order.includes(id)) return;
    // đặt sau ô đứng trước nó trong mặc định (nếu có), không thì lên đầu
    const prev = DEFAULT_ORDER.slice(0, i).reverse().find((p) => order.includes(p));
    order.splice(prev ? order.indexOf(prev) + 1 : 0, 0, id);
  });
  const hidden = [...new Set((Array.isArray(raw?.hidden) ? raw.hidden : []).filter((id) => known.has(id)))];
  return { order, hidden };
}

export const isDefaultLayout = (l) => { const n = normalizeLayout(l); return !n.hidden.length && n.order.every((id, i) => id === DEFAULT_ORDER[i]); };
export const isDefaultOrder = (l) => normalizeLayout(l).order.every((id, i) => id === DEFAULT_ORDER[i]);

// Lên / xuống 1 bậc, chỉ tính trong các ô đang có (avail) — ô không dùng được (vd Coin chưa có phiên) không chiếm bậc
export function moveBlock(layout, id, dir, avail = DEFAULT_ORDER) {
  const l = normalizeLayout(layout);
  const vis = l.order.filter((x) => avail.includes(x));
  const i = vis.indexOf(id), j = i + (dir < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= vis.length) return l;
  const other = vis[j], order = [...l.order];
  const a = order.indexOf(id), b = order.indexOf(other);
  [order[a], order[b]] = [order[b], order[a]];
  return { ...l, order };
}

export function toggleBlock(layout, id) {
  const l = normalizeLayout(layout);
  return { ...l, hidden: l.hidden.includes(id) ? l.hidden.filter((x) => x !== id) : [...l.hidden, id] };
}

// Ô hiện theo thứ tự (đã lọc ô không dùng được + ô bị tắt)
export const visibleBlocks = (layout, avail = DEFAULT_ORDER) => { const l = normalizeLayout(layout); return l.order.filter((id) => avail.includes(id) && !l.hidden.includes(id)); };

const userKey = (email) => (email || "").toLowerCase() || "_";
export const layoutFor = (settings, email) => normalizeLayout((settings?.dashLayout || {})[userKey(email)]);
export const layoutPatch = (settings, email, layout) => ({ dashLayout: { ...(settings?.dashLayout || {}), [userKey(email)]: normalizeLayout(layout) } });
