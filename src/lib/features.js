// 10/11: mục ít dùng tự ẩn cho gọn app, bật lại được (lưu trong settings — chủ quyết định, áp cho mọi tài khoản).
// Công việc: chưa có việc nào và chưa bật tay → ẩn tab Công việc, menu chỉ còn "Lịch". Có việc (hoặc bật tay) → hiện như cũ.
export const tasksOn = (settings, tasks) => settings?.showTasks ?? (tasks || []).length > 0;
