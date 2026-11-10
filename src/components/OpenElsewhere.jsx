// 10/11: báo khi CÙNG tài khoản đang mở app ở tab/máy khác (Supabase Realtime presence, không cần bảng).
// Sửa ở 2 nơi cùng lúc thì app vẫn gộp được (gộp 3 chiều trong store), nhưng dễ ra thông báo "khôi phục/gộp" và số nhảy qua lại
// → nhắc để sếp chỉ sửa ở 1 nơi. Chỉ cảnh báo, KHÔNG khoá: tab bị treo/đóng đột ngột không làm khoá luôn nơi đang dùng.
import { useEffect, useMemo, useState } from "react";
import { MonitorSmartphone, X } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useData } from "../lib/store.jsx";

const devName = () => {
  const ua = navigator.userAgent || "";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "điện thoại Android";
  if (/Macintosh/.test(ua)) return "máy Mac";
  if (/Windows/.test(ua)) return "máy Windows";
  return "thiết bị khác";
};

export default function OpenElsewhere() {
  const { ownerId, myEmail } = useData();
  const me = useMemo(() => Math.random().toString(36).slice(2, 10), []);
  const [others, setOthers] = useState([]);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!ownerId || !myEmail) return undefined;
    const ch = supabase.channel(`qws-here-${ownerId}`, { config: { presence: { key: me } } });
    const sync = () => {
      const st = ch.presenceState();
      const list = Object.entries(st).filter(([k]) => k !== me).map(([, v]) => v[0]).filter((p) => p && p.email === myEmail);
      setOthers(list);
      if (!list.length) setHidden(false);
    };
    ch.on("presence", { event: "sync" }, sync).subscribe((s) => {
      if (s === "SUBSCRIBED") ch.track({ email: myEmail, dev: devName(), at: Date.now() });
    });
    return () => { supabase.removeChannel(ch); };
  }, [ownerId, myEmail, me]);
  if (!others.length || hidden) return null;
  const here = devName();
  const names = [...new Set(others.map((o) => (o.dev === here ? `tab khác trên ${o.dev} này` : o.dev)))].join(", ");
  return (
    <div role="status" className="mx-3 mt-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] leading-snug text-amber-900 sm:mx-5">
      <MonitorSmartphone size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1"><b>App đang mở ở {names}.</b> Nên chỉ sửa ở một nơi; sửa cùng lúc app vẫn gộp được nhưng số có thể nhảy qua lại.</div>
      <button type="button" aria-label="Ẩn thông báo" title="Ẩn thông báo" onClick={() => setHidden(true)} className="shrink-0 rounded-lg p-1 text-amber-700 hover:bg-amber-100"><X size={14} /></button>
    </div>
  );
}
