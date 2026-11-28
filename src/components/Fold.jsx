// 28/11 (sếp duyệt "accordion" cho trang dài): mục gập/mở — dòng tiêu đề + tóm tắt 1 dòng + mũi tên; bấm để mở nội dung.
// Nhớ mục nào đang mở trên máy này (localStorage, theo nhóm `ns`), lần sau vào trang giữ nguyên.
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "./ui.jsx";

const read = (ns) => { try { const v = JSON.parse(localStorage.getItem(ns) || "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; } };

export function useFoldState(ns, key, def = false) {
  const [open, setOpenS] = useState(() => { const v = read(ns)[key]; return typeof v === "boolean" ? v : def; });
  const setOpen = (v) => {
    const n = typeof v === "function" ? v(open) : !!v;
    try { localStorage.setItem(ns, JSON.stringify({ ...read(ns), [key]: n })); } catch { /* bộ nhớ máy bị chặn — vẫn gập/mở được */ }
    setOpenS(n);
  };
  return [open, setOpen];
}

// force = luôn mở (vd có cảnh báo cần xem) — bấm vẫn ghi nhớ lựa chọn cho lúc hết cảnh báo
export function Fold({ ns, id, icon: I, title, summary, def = false, force = false, children }) {
  const [open, setOpen] = useFoldState(ns, id, def);
  const shown = open || force;
  return (
    <Card className="!p-3">
      <button type="button" onClick={() => setOpen(!shown)} aria-expanded={shown} aria-controls={`fold-${id}`} className="flex w-full items-center gap-2 text-left text-[13.5px] font-extrabold text-slate-800">
        {I && <I size={16} className="shrink-0 text-indigo-500" />}
        <span className="shrink-0 whitespace-nowrap">{title}</span>
        {summary != null && summary !== "" && <span className="min-w-0 truncate text-[11.5px] font-semibold text-slate-400">{summary}</span>}
        <ChevronDown size={16} className={`ml-auto shrink-0 text-slate-400 transition ${shown ? "rotate-180" : ""}`} />
      </button>
      {shown && <div id={`fold-${id}`} className="mt-3">{children}</div>}
    </Card>
  );
}
