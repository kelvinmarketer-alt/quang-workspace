// Phân quyền theo TÍNH NĂNG (trang). Chủ workspace = toàn quyền.
// Thành viên được cấp danh sách "feature key" nào thì thấy/vào trang đó.
export const FEATURES = [
  ["dashboard", "Tổng quan"],
  ["customers", "Khách & Dự án"],
  ["ketoan", "Kế toán & Chi phí"],
  ["tasks", "Công việc & Lịch"],
];
export const ALL_FEATURES = FEATURES.map(([k]) => k);

// map route path → feature key (để lọc menu + chặn route). Trang không có key = ai cũng vào (VD Cài đặt).
export const ROUTE_FEATURE = {
  "/": "dashboard",
  "/khach-hang": "customers",
  "/du-an": "customers",
  "/don-hang": "customers",
  "/ke-toan": "ketoan",
  "/chi-phi": "ketoan",
  "/cong-viec": "tasks",
  "/lich": "tasks",
};

export const featLabel = (k) => (FEATURES.find(([key]) => key === k) || [k, k])[1];
