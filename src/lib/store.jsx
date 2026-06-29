import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { SEED_TASKS, SEED_FAMILY, SEED_TRANSACTIONS, SEED_CUSTOMERS, SEED_PROJECTS, SEED_SETTINGS, SEED_EXPENSES, SEED_FUNDS, SEED_FUND_TX } from "../data/seed.js";
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
    transactions: SEED_TRANSACTIONS,
    expenses: SEED_EXPENSES, // chi phí vận hành công ty
    funds: SEED_FUNDS, // quỹ phân bổ dòng tiền
    fundTx: SEED_FUND_TX, // giao dịch nạp/rút quỹ
    settings: { ...SEED_SETTINGS }, // cấu hình app (key OpenAI…) — sẽ đồng bộ DB
  };
}

// Bù field cho state cũ (tránh undefined sau nâng cấp)
function migrate(s) {
  const base = { tasks: [], family: [], customerList: SEED_CUSTOMERS, projects: SEED_PROJECTS, transactions: SEED_TRANSACTIONS, expenses: SEED_EXPENSES, funds: SEED_FUNDS, fundTx: SEED_FUND_TX, settings: { ...SEED_SETTINGS } };
  const merged = { ...base, ...s };
  if (!Array.isArray(merged.customerList)) merged.customerList = [];
  if (!Array.isArray(merged.projects)) merged.projects = [];
  if (!Array.isArray(merged.transactions)) merged.transactions = [];
  if (!Array.isArray(merged.expenses)) merged.expenses = [];
  // Quỹ: lần đầu (chưa có key) → nạp bộ quỹ mẫu; đã có (kể cả rỗng do user xoá hết) → giữ nguyên
  if (!Array.isArray(merged.funds)) merged.funds = s.funds === undefined ? SEED_FUNDS : [];
  if (!Array.isArray(merged.fundTx)) merged.fundTx = [];
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
  const skipSave = useRef(false);
  const saveTimer = useRef(null);

  // Tải dữ liệu từ Supabase khi đăng nhập (đám mây là nguồn chính)
  useEffect(() => {
    if (!user) return;
    let alive = true;
    setSynced(false);
    (async () => {
      const { data, error } = await supabase.from(WORKSPACE_TABLE).select("data").eq("user_id", user.id).maybeSingle();
      if (!alive) return;
      if (!error && data && data.data && Object.keys(data.data).length > 0) {
        skipSave.current = true;
        setState(migrate(data.data));
      } else {
        // Lần đầu: tạo dòng từ state hiện có (hoặc rỗng)
        await supabase.from(WORKSPACE_TABLE).upsert({ user_id: user.id, data: state });
      }
      setSynced(true);
    })();
    return () => { alive = false; };
  }, [user?.id]);

  // Lưu: localStorage (cache) + đẩy Supabase (debounce)
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
    if (!user || !synced) return;
    if (skipSave.current) { skipSave.current = false; return; }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      supabase.from(WORKSPACE_TABLE).upsert({ user_id: user.id, data: state }).then(({ error }) => {
        if (error) console.warn("Lưu Supabase lỗi:", error.message);
      });
    }, 700);
  }, [state, user?.id, synced]);

  const api = useMemo(() => {
    const uid = () => Math.random().toString(36).slice(2, 9);
    return {
      ...migrate(state),
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
        setState((s) => ({ ...s, customerList: s.customerList.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      deleteCustomer: (id) =>
        setState((s) => ({ ...s, customerList: s.customerList.filter((c) => c.id !== id) })),
      deleteCustomers: (ids) =>
        setState((s) => ({ ...s, customerList: s.customerList.filter((c) => !ids.includes(c.id)) })),
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
      // TRANSACTIONS (thu/chi cá nhân)
      addTransaction: (tx) =>
        setState((s) => ({ ...s, transactions: [{ id: "x" + uid(), ...tx }, ...s.transactions] })),
      deleteTransaction: (id) =>
        setState((s) => ({ ...s, transactions: s.transactions.filter((x) => x.id !== id) })),
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
        setState((s) => ({ ...s, funds: (s.funds || []).filter((f) => f.id !== id), fundTx: (s.fundTx || []).filter((t) => t.fundId !== id) })),
      // Giao dịch quỹ: nạp (in) / rút (out)
      addFundTx: (tx) =>
        setState((s) => ({ ...s, fundTx: [{ id: "ft" + uid(), type: "in", ...tx }, ...(s.fundTx || [])] })),
      deleteFundTx: (id) =>
        setState((s) => ({ ...s, fundTx: (s.fundTx || []).filter((t) => t.id !== id) })),
      // Phân bổ 1 lần: tạo nhiều phiếu NẠP cùng ngày — entries: [{fundId, amount}]
      allocateFunds: (entries, date, note) =>
        setState((s) => {
          const add = (entries || []).filter((e) => Number(e.amount) > 0).map((e) => ({ id: "ft" + uid(), fundId: e.fundId, date, amount: Number(e.amount), type: "in", note: note || "Phân bổ thu nhập" }));
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

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useData() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useData must be inside DataProvider");
  return ctx;
}
