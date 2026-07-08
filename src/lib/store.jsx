import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { SEED_TASKS, SEED_FAMILY, SEED_CUSTOMERS, SEED_PROJECTS, SEED_SETTINGS, SEED_EXPENSES, SEED_FUNDS, SEED_FUND_TX, SEED_FUND_SCHEDULES, SEED_SPEND_CATS } from "../data/seed.js";
import { useAuth } from "./auth.jsx";
import { supabase, WORKSPACE_TABLE } from "./supabase.js";

const KEY = "quang-workspace-v4";
const Ctx = createContext(null);

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch {}
  const today = new Date();
  const iso = (off) => {
    const d = new Date(today.getTime() + off * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  return {
    tasks: SEED_TASKS.map((t, i) => ({ ...t, date: iso(i) })),
    family: SEED_FAMILY,
    customerList: SEED_CUSTOMERS, // {id, name, phone, zalo, note}
    projects: SEED_PROJECTS, // nguồn dữ liệu chính — xem seed.js
    expenses: SEED_EXPENSES, // chi phí vận hành công ty
    funds: SEED_FUNDS, // quỹ phân bổ dòng tiền
    fundTx: SEED_FUND_TX, // giao dịch nạp/rút quỹ
    fundSchedules: SEED_FUND_SCHEDULES, // lịch chuyển quỹ định kỳ
    spendCats: SEED_SPEND_CATS, // danh mục chi tiêu
    settings: { ...SEED_SETTINGS }, // cấu hình app (key OpenAI…) — sẽ đồng bộ DB
  };
}

// Bù field cho state cũ (tránh undefined sau nâng cấp)
function migrate(s) {
  const base = { tasks: [], family: [], customerList: SEED_CUSTOMERS, projects: SEED_PROJECTS, expenses: SEED_EXPENSES, funds: SEED_FUNDS, fundTx: SEED_FUND_TX, fundSchedules: SEED_FUND_SCHEDULES, spendCats: SEED_SPEND_CATS, settings: { ...SEED_SETTINGS } };
  const merged = { ...base, ...s };
  if (!Array.isArray(merged.customerList)) merged.customerList = [];
  if (!Array.isArray(merged.projects)) merged.projects = [];
  if (!Array.isArray(merged.expenses)) merged.expenses = [];
  // Quỹ: lần đầu (chưa có key) → nạp bộ quỹ mẫu; đã có (kể cả rỗng do user xoá hết) → giữ nguyên
  if (!Array.isArray(merged.funds)) merged.funds = s.funds === undefined ? SEED_FUNDS : [];
  if (!Array.isArray(merged.fundTx)) merged.fundTx = [];
  if (!Array.isArray(merged.fundSchedules)) merged.fundSchedules = [];
  // Quỹ công ty mặc định (nguồn = Lợi nhuận gộp) — thêm vào đầu nếu chưa có
  if (Array.isArray(merged.funds) && merged.funds.length > 0 && !merged.funds.some((f) => f.role === "company")) {
    merged.funds = [{ id: "fund-company", name: "Quỹ công ty", color: "indigo", percent: 0, role: "company", note: "Lợi nhuận gộp — nguồn phân bổ hằng tháng" }, ...merged.funds];
  }
  // Danh mục chi tiêu: lần đầu (chưa có key) → nạp bộ mẫu; đã có → giữ nguyên
  if (!Array.isArray(merged.spendCats)) merged.spendCats = s.spendCats === undefined ? SEED_SPEND_CATS : [];
  // Gộp về 5 danh mục chính (1 LẦN): remap danh mục các khoản chi cũ + thay danh sách danh mục.
  // Sau khi chạy, catsV5=true → user tự thêm/sửa/xoá danh mục thoải mái, migrate không đụng nữa.
  if (!merged.catsV5) {
    const CAT_MAP = {
      "Ăn uống": "Chi Tiêu", "Mua sắm": "Chi Tiêu", "Du lịch": "Chi Tiêu", "Giải trí": "Chi Tiêu", "Đi chợ": "Chi Tiêu",
      "Đi lại": "Hoá Đơn", "Hoá đơn": "Hoá Đơn",
      "Sức khoẻ": "Sức Khoẻ",
      "gia đình": "Gia Đình", "Gia đình": "Gia Đình",
      "Khác": "Khác",
    };
    merged.fundTx = (merged.fundTx || []).map((t) => (t.cat ? { ...t, cat: CAT_MAP[t.cat] || t.cat } : t));
    merged.spendCats = SEED_SPEND_CATS;
    merged.catsV5 = true;
  }
  merged.settings = { ...SEED_SETTINGS, ...(merged.settings || {}) };
  // Lương: tên đợt luôn theo tháng của ngày thu (sửa dữ liệu cũ bị giữ label sai khi nhân bản)
  const monthLabel = (iso) => { const [y, m] = (iso || "").split("-"); return m ? `Th${Number(m)}/${y}` : "Lương"; };
  merged.projects = merged.projects.map((p) =>
    p.category === "Lương" ? { ...p, installments: (p.installments || []).map((i) => ({ ...i, label: monthLabel(i.date) })) } : p
  );
  // Sự kiện "1 lần" chưa có năm → gắn năm hiện tại để KHÔNG bị trôi sang năm sau (đã qua = hoàn thành)
  const nowY = new Date().getFullYear();
  merged.family = (merged.family || []).map((f) => (f.repeat === "once" && !f.baseYear ? { ...f, baseYear: nowY } : f));
  // Đổi danh mục chi phí cũ → bộ mới (AI / App / Khác)
  const EXP_NEW = ["AI", "App", "Khác"];
  const EXP_MAP = { "Phần mềm / AI": "AI", "Tool / Plugin": "App", "Hosting / Tên miền": "Khác", "Quảng cáo": "Khác", "Văn phòng": "Khác", "Nhân sự / Thuê ngoài": "Khác" };
  merged.expenses = (merged.expenses || []).map((e) => (EXP_NEW.includes(e.category) ? e : { ...e, category: EXP_MAP[e.category] || "Khác" }));
  return merged;
}

export function DataProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState(load);
  const [synced, setSynced] = useState(false);
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | saving | error
  const [reloadTick, setReloadTick] = useState(0);
  const skipSave = useRef(false);
  const saveTimer = useRef(null);
  const retryTimer = useRef(null);
  const stateRef = useRef(state);
  const dirty = useRef(false);
  stateRef.current = state;

  // Đẩy state hiện tại lên Supabase (dùng chung cho debounce / flush / retry)
  const pushCloud = () => {
    if (!user) return;
    setSyncStatus("saving");
    supabase.from(WORKSPACE_TABLE).upsert({ user_id: user.id, data: stateRef.current }).then(({ error }) => {
      if (error) {
        console.warn("Lưu Supabase lỗi:", error.message);
        setSyncStatus("error");
        clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(pushCloud, 5000); // tự thử lại
      } else {
        dirty.current = false;
        setSyncStatus("idle");
      }
    });
  };

  // Tải dữ liệu từ Supabase khi đăng nhập (đám mây là nguồn chính)
  useEffect(() => {
    if (!user) return;
    let alive = true;
    setSynced(false);
    (async () => {
      const { data, error } = await supabase.from(WORKSPACE_TABLE).select("data").eq("user_id", user.id).maybeSingle();
      if (!alive) return;
      if (error) {
        // ĐỌC LỖI (mạng/token/RLS): TUYỆT ĐỐI không ghi gì để tránh đè dữ liệu thật bằng bản local/rỗng.
        // Giữ local, chặn mọi save (synced vẫn false), tự thử đọc lại sau.
        setSyncStatus("error");
        setTimeout(() => { if (alive) setReloadTick((t) => t + 1); }, 4000);
        return;
      }
      if (data && data.data && Object.keys(data.data).length > 0) {
        skipSave.current = true;
        setState(migrate(data.data));
      } else {
        // error=null + không có dòng/dòng rỗng → CHẮC CHẮN lần đầu, tạo dòng an toàn
        skipSave.current = true;
        await supabase.from(WORKSPACE_TABLE).upsert({ user_id: user.id, data: stateRef.current });
      }
      setSynced(true);
      setSyncStatus("idle");
    })();
    return () => { alive = false; };
  }, [user?.id, reloadTick]);

  // Cache localStorage ngay mỗi lần state đổi
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  }, [state]);

  // Đẩy Supabase (debounce) — chỉ khi đã đọc xong cloud lần đầu (synced)
  useEffect(() => {
    if (!user || !synced) return;
    if (skipSave.current) { skipSave.current = false; return; }
    dirty.current = true;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(pushCloud, 700);
  }, [state, user?.id, synced]);

  // Flush write đang treo khi ẩn tab / đóng tab / unmount (tránh mất bản sửa trong 700ms)
  useEffect(() => {
    const flush = () => {
      if (!dirty.current || !user || !synced) return;
      clearTimeout(saveTimer.current);
      pushCloud();
    };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onHide);
      flush(); // flush khi đổi user / unmount
    };
  }, [user?.id, synced]);

  const api = useMemo(() => {
    const uid = () => Math.random().toString(36).slice(2, 9);
    return {
      // state LUÔN đã ở dạng migrate (load()/fetch đã migrate) → không migrate lại mỗi render (tốn CPU + phá tham chiếu)
      ...state,
      // TASKS
      addTask: (t) => setState((s) => ({ ...s, tasks: [{ id: "t" + uid(), status: "todo", ...t }, ...s.tasks] })),
      updateTask: (id, patch) =>
        setState((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
      deleteTask: (id) => setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) })),
      toggleTask: (id) =>
        setState((s) => ({
          ...s,
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, status: t.status === "done" ? "todo" : "done" } : t
          ),
        })),
      // FAMILY / SỰ KIỆN (giỗ, sinh nhật, kỷ niệm, lễ, nhắc việc)
      addFamily: (f) => setState((s) => ({ ...s, family: [{ id: "f" + uid(), ...f }, ...s.family] })),
      updateFamily: (id, patch) => setState((s) => ({ ...s, family: s.family.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
      deleteFamily: (id) => setState((s) => ({ ...s, family: s.family.filter((f) => f.id !== id) })),
      deleteFamilyMany: (ids) => setState((s) => ({ ...s, family: s.family.filter((f) => !ids.includes(f.id)) })),
      updateFamilyMany: (ids, patch) => setState((s) => ({ ...s, family: s.family.map((f) => (ids.includes(f.id) ? { ...f, ...patch } : f)) })),
      // Nhập nhiều sự kiện, bỏ trùng theo (title|day|month|calendar)
      addFamilyMany: (arr) => setState((s) => {
        const key = (e) => `${(e.title || "").trim().toLowerCase()}|${e.day}|${e.month}|${e.calendar}`;
        const seen = new Set(s.family.map(key));
        const add = arr.filter((e) => e.title && !seen.has(key(e))).map((e) => ({ id: "f" + uid(), ...e }));
        return { ...s, family: [...add, ...s.family] };
      }),
      // CUSTOMERS (bản ghi thật)
      addCustomer: (c) =>
        setState((s) => ({ ...s, customerList: [{ id: "c" + uid(), name: "", phone: "", zalo: "", note: "", feeRate: 20, type: "remote", monthlySalary: 0, active: true, ...c }, ...s.customerList] })),
      addCustomers: (arr) =>
        setState((s) => ({ ...s, customerList: [...arr.map((c) => ({ id: "c" + uid(), name: "", phone: "", zalo: "", note: "", feeRate: 20, type: "remote", monthlySalary: 0, active: true, ...c })), ...s.customerList] })),
      updateCustomer: (id, patch) =>
        setState((s) => ({
          ...s,
          customerList: s.customerList.map((c) => (c.id === id ? { ...c, ...patch } : c)),
          // Đổi tên khách → đồng bộ luôn customerName đã lưu trong các dự án (tránh kẹt tên cũ)
          projects: patch.name ? s.projects.map((p) => (p.customerId === id ? { ...p, customerName: patch.name } : p)) : s.projects,
        })),
      // Xoá khách → xoá luôn dự án của khách đó (tránh dự án mồ côi làm lệch tổng)
      deleteCustomer: (id) =>
        setState((s) => ({ ...s, customerList: s.customerList.filter((c) => c.id !== id), projects: s.projects.filter((p) => p.customerId !== id) })),
      deleteCustomers: (ids) =>
        setState((s) => ({ ...s, customerList: s.customerList.filter((c) => !ids.includes(c.id)), projects: s.projects.filter((p) => !ids.includes(p.customerId)) })),
      // PROJECTS / DỰ ÁN
      addProject: (p) =>
        setState((s) => ({ ...s, projects: [{ id: "p" + uid(), status: "unpaid", ...p }, ...s.projects] })),
      updateProject: (id, patch) =>
        setState((s) => ({ ...s, projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      deleteProject: (id) =>
        setState((s) => ({ ...s, projects: s.projects.filter((p) => p.id !== id) })),
      // INSTALLMENTS / các đợt của 1 dự án
      addInstallment: (projectId, inst) =>
        setState((s) => ({
          ...s,
          projects: s.projects.map((p) =>
            p.id === projectId ? { ...p, installments: [...(p.installments || []), { id: "i" + uid(), ...inst }] } : p
          ),
        })),
      updateInstallment: (projectId, instId, patch) =>
        setState((s) => ({
          ...s,
          projects: s.projects.map((p) =>
            p.id === projectId ? { ...p, installments: (p.installments || []).map((x) => (x.id === instId ? { ...x, ...patch } : x)) } : p
          ),
        })),
      deleteInstallment: (projectId, instId) =>
        setState((s) => ({
          ...s,
          projects: s.projects.map((p) =>
            p.id === projectId ? { ...p, installments: (p.installments || []).filter((x) => x.id !== instId) } : p
          ),
        })),
      // EXPENSES (chi phí vận hành công ty)
      addExpense: (ex) =>
        setState((s) => ({ ...s, expenses: [{ id: "e" + uid(), active: true, recurring: "monthly", ...ex }, ...(s.expenses || [])] })),
      updateExpense: (id, patch) =>
        setState((s) => ({ ...s, expenses: (s.expenses || []).map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
      deleteExpense: (id) =>
        setState((s) => ({ ...s, expenses: (s.expenses || []).filter((x) => x.id !== id) })),
      deleteExpensesMany: (ids) =>
        setState((s) => ({ ...s, expenses: (s.expenses || []).filter((x) => !ids.includes(x.id)) })),
      // QUỸ (phân bổ dòng tiền)
      addFund: (fd) =>
        setState((s) => ({ ...s, funds: [...(s.funds || []), { id: "fund" + uid(), color: "indigo", percent: 0, note: "", ...fd }] })),
      updateFund: (id, patch) =>
        setState((s) => ({ ...s, funds: (s.funds || []).map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
      deleteFund: (id) =>
        setState((s) => {
          if ((s.funds || []).find((f) => f.id === id)?.role === "company") return s; // KHÔNG cho xoá quỹ công ty (nguồn phân bổ)
          return {
            ...s,
            funds: (s.funds || []).filter((f) => f.id !== id),
            fundTx: (s.fundTx || []).filter((t) => t.fundId !== id),
            // Xoá luôn lịch chuyển định kỳ trỏ tới quỹ này (tránh lịch mồ côi vẫn nhắc + tạo phiếu vô nghĩa)
            fundSchedules: (s.fundSchedules || []).filter((sc) => sc.fromId !== id && sc.toId !== id),
          };
        }),
      // Giao dịch quỹ: nạp (in) / rút (out)
      addFundTx: (tx) =>
        setState((s) => ({ ...s, fundTx: [{ id: "ft" + uid(), type: "in", ...tx }, ...(s.fundTx || [])] })),
      // Ghi NHIỀU giao dịch cùng lúc (vd chi từ nhiều ảnh biên lai)
      addFundTxMany: (arr) =>
        setState((s) => ({ ...s, fundTx: [...(arr || []).map((tx) => ({ id: "ft" + uid(), type: "out", ...tx })), ...(s.fundTx || [])] })),
      // Sửa 1 giao dịch quỹ (vd gắn/đổi danh mục chi)
      updateFundTx: (id, patch) =>
        setState((s) => ({ ...s, fundTx: (s.fundTx || []).map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
      // Gắn danh mục HÀNG LOẠT cho các khoản chi: map { [txId]: "Tên danh mục" }
      categorizeFundTx: (map) =>
        setState((s) => ({ ...s, fundTx: (s.fundTx || []).map((t) => (map && map[t.id] != null ? { ...t, cat: map[t.id] } : t)) })),
      // DANH MỤC CHI TIÊU
      addSpendCat: (c) =>
        setState((s) => ({ ...s, spendCats: [...(s.spendCats || []), { id: "sc" + uid(), color: "slate", ...c }] })),
      updateSpendCat: (id, patch) =>
        setState((s) => ({ ...s, spendCats: (s.spendCats || []).map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      deleteSpendCat: (id) =>
        setState((s) => ({ ...s, spendCats: (s.spendCats || []).filter((c) => c.id !== id) })),
      // Chuyển tiền giữa 2 quỹ = 1 phiếu rút (nguồn) + 1 phiếu nạp (đích), liên kết bằng xferId
      transferFund: (fromId, toId, amount, date, note) =>
        setState((s) => {
          const amt = Number(amount) || 0;
          if (!fromId || !toId || fromId === toId || amt <= 0) return s;
          const funds = s.funds || [];
          const nameOf = (id) => funds.find((f) => f.id === id)?.name || "quỹ";
          const xid = "xf" + uid();
          const extra = note ? ` · ${note}` : "";
          const out = { id: "ft" + uid(), fundId: fromId, amount: amt, date, type: "out", note: `Chuyển sang ${nameOf(toId)}${extra}`, xferId: xid };
          const inn = { id: "ft" + uid(), fundId: toId, amount: amt, date, type: "in", note: `Nhận từ ${nameOf(fromId)}${extra}`, xferId: xid };
          return { ...s, fundTx: [out, inn, ...(s.fundTx || [])] };
        }),
      // Xoá 1 giao dịch — nếu là phiếu chuyển quỹ thì xoá cả 2 chiều
      deleteFundTx: (id) =>
        setState((s) => {
          const tx = (s.fundTx || []).find((t) => t.id === id);
          const xid = tx && tx.xferId;
          return { ...s, fundTx: (s.fundTx || []).filter((t) => t.id !== id && (!xid || t.xferId !== xid)) };
        }),
      // LỊCH CHUYỂN QUỸ ĐỊNH KỲ
      addFundSchedule: (sc) =>
        setState((s) => ({ ...s, fundSchedules: [{ id: "fs" + uid(), every: "2week", active: true, lastDone: "", note: "", ...sc }, ...(s.fundSchedules || [])] })),
      updateFundSchedule: (id, patch) =>
        setState((s) => ({ ...s, fundSchedules: (s.fundSchedules || []).map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
      deleteFundSchedule: (id) =>
        setState((s) => ({ ...s, fundSchedules: (s.fundSchedules || []).filter((x) => x.id !== id) })),
      // Thực hiện 1 kỳ của lịch (occIso = ngày kỳ đến hạn): tạo phiếu chuyển 2 chiều + đánh dấu lastDone
      runFundSchedule: (id, occIso) =>
        setState((s) => {
          const sc = (s.fundSchedules || []).find((x) => x.id === id);
          if (!sc) return s;
          const amt = Number(sc.amount) || 0;
          const funds = s.funds || [];
          const nameOf = (fid) => funds.find((f) => f.id === fid)?.name || "quỹ";
          const exists = (fid) => funds.some((f) => f.id === fid);
          let fundTx = s.fundTx || [];
          // Chỉ tạo phiếu khi CẢ 2 quỹ còn tồn tại (tránh phiếu trỏ quỹ đã xoá); vẫn đánh dấu lastDone để thôi nhắc
          if (sc.fromId && sc.toId && sc.fromId !== sc.toId && amt > 0 && exists(sc.fromId) && exists(sc.toId)) {
            const xid = "xf" + uid();
            const extra = sc.note ? ` · ${sc.note}` : "";
            fundTx = [
              { id: "ft" + uid(), fundId: sc.fromId, amount: amt, date: occIso, type: "out", note: `Chuyển định kỳ sang ${nameOf(sc.toId)}${extra}`, xferId: xid },
              { id: "ft" + uid(), fundId: sc.toId, amount: amt, date: occIso, type: "in", note: `Nhận định kỳ từ ${nameOf(sc.fromId)}${extra}`, xferId: xid },
              ...fundTx,
            ];
          }
          return { ...s, fundTx, fundSchedules: (s.fundSchedules || []).map((x) => (x.id === id ? { ...x, lastDone: occIso } : x)) };
        }),
      // Bỏ qua 1 kỳ (không chuyển), chỉ đánh dấu đã xử lý
      skipFundSchedule: (id, occIso) =>
        setState((s) => ({ ...s, fundSchedules: (s.fundSchedules || []).map((x) => (x.id === id ? { ...x, lastDone: occIso } : x)) })),
      // Phân bổ từ QUỸ CÔNG TY ra các quỹ — mỗi entry tạo 1 cặp chuyển (rút quỹ công ty + nạp quỹ đích), gắn alloc=true
      allocateFromCompany: (companyId, entries, date, note) =>
        setState((s) => {
          const funds = s.funds || [];
          const nameOf = (fid) => funds.find((f) => f.id === fid)?.name || "quỹ";
          const add = [];
          for (const e of entries || []) {
            const amt = Number(e.amount) || 0;
            if (amt <= 0 || !e.fundId || e.fundId === companyId) continue;
            const xid = "xf" + uid();
            add.push({ id: "ft" + uid(), fundId: companyId, amount: amt, date, type: "out", note: `${note || "Phân bổ"} → ${nameOf(e.fundId)}`, xferId: xid, alloc: true });
            add.push({ id: "ft" + uid(), fundId: e.fundId, amount: amt, date, type: "in", note: `${note || "Phân bổ"} từ ${nameOf(companyId)}`, xferId: xid, alloc: true });
          }
          return { ...s, fundTx: [...add, ...(s.fundTx || [])] };
        }),
      // IMPORT từ AI (ảnh / chat) — { customers:[], projects:[] }
      importParsed: (parsed) =>
        setState((s) => {
          const n = (v) => Number(String(v ?? "").toString().replace(/[^\d-]/g, "")) || 0;
          const today = new Date();
          const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
          let customerList = [...s.customerList];
          const findOrCreate = (name, phone) => {
            const nm = (name || "").trim() || "Khách";
            let c = customerList.find((x) => x.name.toLowerCase() === nm.toLowerCase());
            if (!c) { c = { id: "c" + uid(), name: nm, phone: phone || "", zalo: "", note: "" }; customerList = [c, ...customerList]; }
            else if (phone && !c.phone) { c = { ...c, phone }; customerList = customerList.map((x) => (x.id === c.id ? c : x)); }
            return c;
          };
          const projects = [...s.projects];
          for (const p of parsed.projects || []) {
            const cust = findOrCreate(p.customerName, p.phone);
            projects.unshift({
              id: "p" + uid(), customerId: cust.id, customerName: cust.name,
              name: (p.name || "Dự án").trim(), category: p.category || "Khác", status: p.status || "doing", note: p.note || "",
              installments: (p.installments || []).map((i) => ({
                id: "i" + uid(), label: (i.label || "Đợt").toString(), date: i.date || iso,
                amount: n(i.amount), serviceFee: n(i.serviceFee), spend: n(i.spend), refund: n(i.refund),
                carry: n(i.carry), ctv: n(i.ctv), otherCost: n(i.otherCost), collected: n(i.collected),
              })),
            });
          }
          for (const c of parsed.customers || []) findOrCreate(c.name, c.phone);
          return { ...s, customerList, projects };
        }),
      // SETTINGS (cấu hình app — key OpenAI…)
      setSettings: (patch) => setState((s) => ({ ...s, settings: { ...s.settings, ...patch } })),
      // BACKUP
      exportData: () => JSON.stringify(state, null, 2),
      importData: (json) => {
        try {
          const parsed = typeof json === "string" ? JSON.parse(json) : json;
          setState(migrate(parsed));
          return true;
        } catch {
          return false;
        }
      },
      // RESET
      reset: () => {
        localStorage.removeItem(KEY);
        setState(load());
      },
    };
  }, [state]);

  const value = useMemo(() => ({ ...api, syncStatus }), [api, syncStatus]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useData must be inside DataProvider");
  return ctx;
}
