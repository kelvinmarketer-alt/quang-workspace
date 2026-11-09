import { useEffect, useRef } from "react";
import { useData } from "../lib/store.jsx";
import { useAuth } from "../lib/auth.jsx";
import { icalGet, icalSave, buildIcs } from "../lib/ical.js";

// Chạy nền (không hiện gì): khi chủ ĐÃ bật link lịch, mỗi lần dữ liệu đổi (việc, sự kiện, đợt thu, khách) → tạo lại lịch và lưu lên máy chủ.
// Điện thoại đăng ký link sẽ tự lấy bản mới theo chu kỳ của Apple / Google. Chỉ chủ. Gửi chậm 4 giây sau thay đổi cuối và bỏ qua nếu nội dung không đổi.
export default function IcalSync() {
  const { tasks, family, projects, customerList, isOwner } = useData();
  const { user } = useAuth();
  const feed = useRef(undefined); // undefined = chưa tải; null = chưa bật link; { options } = đã bật
  const last = useRef("");
  const timer = useRef(null);
  const latest = useRef({});
  latest.current = { tasks, family, projects, customerList };
  const uid = user?.id;

  const push = async () => {
    if (!feed.current || !uid) return;
    const { tasks: t, family: f, projects: p, customerList: c } = latest.current;
    const { ics } = buildIcs({ tasks: t, family: f, projects: p, customers: c, opts: feed.current.options });
    if (ics === last.current) return;
    const r = await icalSave(uid, { ics });
    if (!r.error) last.current = ics;
  };
  const load = async () => {
    const r = await icalGet();
    feed.current = r.data ? { options: r.data.options || {} } : null;
    last.current = ""; // sau khi đổi tuỳ chọn / bật lại → buộc gửi lại
    if (feed.current) push();
  };

  useEffect(() => {
    if (!isOwner || !uid) return undefined;
    load();
    const onRefresh = () => load();
    window.addEventListener("qws-ical-refresh", onRefresh);
    return () => window.removeEventListener("qws-ical-refresh", onRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, uid]);

  useEffect(() => {
    if (!isOwner || !feed.current) return undefined;
    clearTimeout(timer.current);
    timer.current = setTimeout(push, 4000);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, family, projects, customerList]);

  return null;
}
