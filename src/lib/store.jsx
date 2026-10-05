import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { SEED_TASKS, SEED_FAMILY, SEED_CUSTOMERS, SEED_PROJECTS, SEED_SETTINGS, SEED_EXPENSES, SEED_FUNDS, SEED_FUND_TX, SEED_FUND_SCHEDULES, SEED_SPEND_CATS } from "../data/seed.js";
import { useAuth } from "./auth.jsx";
import { supabase, WORKSPACE_TABLE } from "./supabase.js";
import { ALL_FEATURES, FEATURE_WRITES, OWNER_ONLY_WRITES, memberAccess } from "./permissions.js";
import { merge3, deepEqual } from "./merge.js";
import { deriveKey, encryptJSON, decryptJSON, newSalt, PIN_ITER } from "./crypto.js";

const PRIVATE_TABLE = "qws_private";
// Gỡ dữ liệu bí mật khỏi khối CHUNG (thành viên tải được khối chung) — vault + OpenAI key nằm ở kho riêng của chủ
function stripSecrets(s) {
  const { vault, ...rest } = s; // eslint-disable-line no-unused-vars
  const { openaiKey, ...settings } = rest.settings || {}; // eslint-disable-line no-unused-vars
  return { ...rest, settings };
}

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
    vault: [], // kho tài khoản/thẻ/thanh toán (CHỈ chủ) — {id,type,title,...fields}
    resources: [], // tài liệu/tài nguyên online (LINK) — {id,title,url,type,projectId,customerId,tags,note}
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
  if (!Array.isArray(merged.vault)) merged.vault = [];
  if (!Array.isArray(merged.resources)) merged.resources = [];
  if (!Array.isArray(merged.adsResults)) merged.adsResults = [];
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
  // Chủ workspace: mặc định = chính mình; nếu là THÀNH VIÊN (được chia sẻ) thì = user_id của chủ.
  const [ownerId, setOwnerId] = useState(null);
  const ownerRef = useRef(null);
  // Chống ghi đè: bản cloud lần đọc/ghi gần nhất + mốc updated_at để lưu có kiểm tra phiên bản (RPC qws_save)
  const baseRef = useRef(null);
  const baseAtRef = useRef(null);
  const casOff = useRef(false);
  const pushing = useRef(false);
  const pendingPush = useRef(false);
  // KHO RIÊNG của chủ (qws_private): vault + OpenAI key. privAvail: null=chưa biết/không phải chủ, true=dùng kho riêng, false=chưa tạo bảng (giữ cách cũ)
  const [privAvail, setPrivAvail] = useState(null);
  const privAvailRef = useRef(null);
  privAvailRef.current = privAvail;
  const privRef = useRef({});
  const [vaultMem, setVaultMem] = useState(null); // mảng đã giải mã (null = đang khoá)
  const vaultMemRef = useRef(null);
  vaultMemRef.current = vaultMem;
  const [vaultLocked, setVaultLocked] = useState(false);
  const [vaultHasPin, setVaultHasPin] = useState(false);
  const [openaiKey, setOpenaiKey] = useState("");
  const pinKeyRef = useRef(null);
  const pendingLegacyVault = useRef([]);
  const privTimer = useRef(null);
  const outgoing = (s) => (privAvailRef.current ? stripSecrets(s) : s);

  // Đẩy state hiện tại lên Supabase (dùng chung cho debounce / flush / retry).
  // Lưu CÓ KIỂM TRA PHIÊN BẢN: nếu nơi khác vừa sửa → tải bản mới, GỘP 3 chiều rồi lưu lại (không đè mất của nhau).
  const pushCloud = async () => {
    if (!user) return;
    if (pushing.current) { pendingPush.current = true; return; }
    pushing.current = true;
    setSyncStatus("saving");
    try {
      const owner = ownerRef.current || user.id;
      for (let attempt = 0; attempt < 4; attempt++) {
        const local = outgoing(stateRef.current);
        if (casOff.current || !baseAtRef.current) {
          const { data, error } = await supabase.from(WORKSPACE_TABLE).upsert({ user_id: owner, data: local }).select("updated_at").maybeSingle();
          if (error) throw error;
          baseRef.current = local; baseAtRef.current = data?.updated_at || null;
          break;
        }
        const { data, error } = await supabase.rpc("qws_save", { p_owner: owner, p_data: local, p_expect: baseAtRef.current });
        if (error) {
          // Chưa chạy SQL tạo hàm qws_save → lưu kiểu cũ
          if (error.code === "PGRST202" || /qws_save/.test(error.message || "")) { casOff.current = true; continue; }
          throw error;
        }
        const row = Array.isArray(data) ? data[0] : data;
        if (row?.ok) { baseRef.current = local; baseAtRef.current = row.updated_at; break; }
        // XUNG ĐỘT: nơi khác đã lưu trước → gộp
        const rem = await supabase.from(WORKSPACE_TABLE).select("data,updated_at").eq("user_id", owner).single();
        if (rem.error) throw rem.error;
        const merged = migrate(merge3(baseRef.current, local, rem.data.data || {}));
        baseRef.current = rem.data.data; baseAtRef.current = rem.data.updated_at;
        stateRef.current = merged;
        skipSave.current = true;
        setState(stateRef.current);
      }
      dirty.current = false;
      setSyncStatus("idle");
    } catch (e) {
      console.warn("Lưu Supabase lỗi:", e?.message || e);
      setSyncStatus("error");
      clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(pushCloud, 5000); // tự thử lại
    } finally {
      pushing.current = false;
      if (pendingPush.current) { pendingPush.current = false; pushCloud(); }
    }
  };

  // Kéo bản mới từ cloud (nơi khác vừa sửa) — chỉ khi máy này KHÔNG có bản sửa chưa lưu
  const pullCloud = async () => {
    if (!user || !ownerRef.current || dirty.current || pushing.current) return;
    const owner = ownerRef.current;
    const head = await supabase.from(WORKSPACE_TABLE).select("updated_at").eq("user_id", owner).maybeSingle();
    if (head.error || !head.data || head.data.updated_at === baseAtRef.current) return;
    const rem = await supabase.from(WORKSPACE_TABLE).select("data,updated_at").eq("user_id", owner).single();
    if (rem.error || dirty.current || pushing.current) return;
    baseRef.current = rem.data.data; baseAtRef.current = rem.data.updated_at;
    const next = migrate(rem.data.data || {});
    if (deepEqual(outgoing(next), outgoing(stateRef.current))) return;
    skipSave.current = true;
    setState(next);
  };

  // ===== KHO RIÊNG (chỉ chủ) =====
  const savePrivate = async () => {
    if (!user || privAvailRef.current !== true) return;
    let P = { ...privRef.current };
    if (P.lock) {
      if (pinKeyRef.current && vaultMemRef.current) P.vaultEnc = await encryptJSON(pinKeyRef.current, vaultMemRef.current);
      delete P.vault;
    } else {
      P.vault = vaultMemRef.current || P.vault || [];
      delete P.vaultEnc;
    }
    privRef.current = P;
    const { error } = await supabase.from(PRIVATE_TABLE).upsert({ user_id: user.id, data: P });
    if (error) { console.warn("Lưu kho riêng lỗi:", error.message); setSyncStatus("error"); }
  };
  const schedulePrivate = () => { clearTimeout(privTimer.current); privTimer.current = setTimeout(savePrivate, 500); };

  const loadPrivate = async (blob) => {
    const r = await supabase.from(PRIVATE_TABLE).select("data").eq("user_id", user.id).maybeSingle();
    if (r.error) { setPrivAvail(false); return; } // bảng chưa tạo → giữ cách cũ (vault trong khối chung)
    let P = r.data?.data || null;
    const legacyVault = Array.isArray(blob?.vault) ? blob.vault : [];
    const legacyKey = (blob?.settings?.openaiKey || "").trim();
    let changed = false;
    if (!P) {
      P = { vault: legacyVault, openaiKey: legacyKey };
      const w = await supabase.from(PRIVATE_TABLE).upsert({ user_id: user.id, data: P });
      if (w.error) { setPrivAvail(false); return; }
    } else {
      // App cũ (chưa cập nhật) lỡ ghi lại vào khối chung → gộp vào kho riêng
      if (!P.openaiKey && legacyKey) { P = { ...P, openaiKey: legacyKey }; changed = true; }
      if (legacyVault.length) {
        if (P.lock) pendingLegacyVault.current = legacyVault;
        else {
          const ids = new Set((P.vault || []).map((x) => x.id));
          const add = legacyVault.filter((x) => !ids.has(x.id));
          if (add.length) { P = { ...P, vault: [...add, ...(P.vault || [])] }; changed = true; }
        }
      }
    }
    privRef.current = P;
    privAvailRef.current = true;
    setPrivAvail(true);
    setOpenaiKey(P.openaiKey || "");
    setVaultHasPin(!!P.lock);
    setVaultLocked(!!P.lock);
    setVaultMem(P.lock ? null : P.vault || []);
    vaultMemRef.current = P.lock ? null : P.vault || [];
    if (changed) savePrivate();
    // Gỡ bí mật khỏi khối chung (+ cờ aiEnabled để tài khoản phụ biết AI dùng được) → effect lưu sẽ đẩy bản sạch lên
    setState((s) => {
      const clean = stripSecrets(s);
      return { ...clean, settings: { ...clean.settings, aiEnabled: !!(P.openaiKey || "").trim() } };
    });
  };

  // Tải dữ liệu từ Supabase khi đăng nhập (đám mây là nguồn chính)
  useEffect(() => {
    if (!user) return;
    let alive = true;
    setSynced(false);
    (async () => {
      // 1) Thử dòng của CHÍNH MÌNH (chủ workspace)
      const own = await supabase.from(WORKSPACE_TABLE).select("user_id,data,updated_at").eq("user_id", user.id).maybeSingle();
      if (!alive) return;
      if (own.error) {
        // ĐỌC LỖI (mạng/token/RLS): TUYỆT ĐỐI không ghi gì để tránh đè dữ liệu thật bằng bản local/rỗng.
        setSyncStatus("error");
        setTimeout(() => { if (alive) setReloadTick((t) => t + 1); }, 4000);
        return;
      }
      let owner = user.id, blob = own.data?.data, blobAt = own.data?.updated_at || null;
      if (!own.data) {
        // 2) Không có dòng riêng → có thể là THÀNH VIÊN: RLS cho phép thấy dòng của CHỦ đã chia sẻ cho mình
        const shared = await supabase.from(WORKSPACE_TABLE).select("user_id,data,updated_at").neq("user_id", user.id).limit(1);
        if (!alive) return;
        if (!shared.error && shared.data && shared.data[0]) { owner = shared.data[0].user_id; blob = shared.data[0].data; blobAt = shared.data[0].updated_at; }
      }
      ownerRef.current = owner;
      setOwnerId(owner);
      baseRef.current = blob || null;
      baseAtRef.current = blobAt;
      if (blob && Object.keys(blob).length > 0) {
        skipSave.current = true;
        const next = migrate(blob);
        // Tài khoản phụ: không bao giờ giữ vault/key trong máy
        setState(owner === user.id ? next : stripSecrets(next));
      } else if (owner === user.id) {
        // CHỈ chủ mới tạo dòng mới (thành viên không có dòng riêng → không tạo, tránh tách dữ liệu)
        skipSave.current = true;
        const ins = await supabase.from(WORKSPACE_TABLE).upsert({ user_id: user.id, data: stateRef.current }).select("updated_at").maybeSingle();
        baseRef.current = stateRef.current; baseAtRef.current = ins.data?.updated_at || null;
      }
      if (owner === user.id && alive) await loadPrivate(blob);
      setSynced(true);
      // Khối chung trên cloud còn sót vault/key (bản cũ) → đẩy ngay bản đã gỡ bí mật
      if (privAvailRef.current === true && (blob?.vault?.length || blob?.settings?.openaiKey)) {
        dirty.current = true;
        setTimeout(pushCloud, 800);
      }
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

  // Tự TẢI LẠI dữ liệu cloud khi quay lại tab (đồng bộ đa thiết bị / nhiều tab) —
  // bỏ qua nếu đang có bản sửa chưa lưu (tránh đè mất). Đã flush khi ẩn tab nên lúc hiện lại thường sạch.
  useEffect(() => {
    if (!user) return;
    let hiddenAt = 0;
    const onVisible = () => {
      if (document.visibilityState === "hidden") { hiddenAt = Date.now(); return; }
      // Ẩn app > 5 phút → khoá lại kho Tài khoản & Thẻ (nếu có PIN)
      if (hiddenAt && Date.now() - hiddenAt > 5 * 60000 && privRef.current?.lock) { pinKeyRef.current = null; setVaultMem(null); setVaultLocked(true); }
      if (synced) pullCloud();
    };
    document.addEventListener("visibilitychange", onVisible);
    // Thấy thay đổi từ thiết bị/người khác trong ~20s (chỉ hỏi mốc updated_at — rất nhẹ)
    const t = setInterval(() => { if (synced && document.visibilityState === "visible") pullCloud(); }, 20000);
    return () => { document.removeEventListener("visibilitychange", onVisible); clearInterval(t); };
  }, [user?.id, synced]);

  const api = useMemo(() => {
    const uid = () => Math.random().toString(36).slice(2, 9);
    const normUrl = (u) => { u = (u || "").trim(); return u && !/^https?:\/\//i.test(u) ? "https://" + u : u; };
    // Vault: kho riêng (đã mở khoá) hoặc kiểu cũ trong khối chung (khi chưa tạo bảng qws_private)
    const vaultSet = (fn) => {
      if (privAvailRef.current === true) {
        if (!vaultMemRef.current) return; // đang khoá → không sửa được
        const next = fn(vaultMemRef.current);
        vaultMemRef.current = next;
        setVaultMem(next);
        schedulePrivate();
        return;
      }
      setState((s) => ({ ...s, vault: fn(s.vault || []) }));
    };
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
      // Xoá khách → xoá luôn dự án + tài nguyên của khách đó (tránh mồ côi)
      deleteCustomer: (id) =>
        setState((s) => ({ ...s, customerList: s.customerList.filter((c) => c.id !== id), projects: s.projects.filter((p) => p.customerId !== id), resources: (s.resources || []).filter((r) => r.customerId !== id) })),
      deleteCustomers: (ids) =>
        setState((s) => ({ ...s, customerList: s.customerList.filter((c) => !ids.includes(c.id)), projects: s.projects.filter((p) => !ids.includes(p.customerId)), resources: (s.resources || []).filter((r) => !ids.includes(r.customerId)) })),
      // PROJECTS / DỰ ÁN
      addProject: (p) =>
        setState((s) => ({ ...s, projects: [{ id: "p" + uid(), status: "unpaid", ...p }, ...s.projects] })),
      updateProject: (id, patch) =>
        setState((s) => ({ ...s, projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      deleteProject: (id) =>
        setState((s) => ({ ...s, projects: s.projects.filter((p) => p.id !== id), resources: (s.resources || []).filter((r) => r.projectId !== id) })),
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
      // Thêm NHIỀU chi phí cùng lúc
      addExpensesMany: (arr) =>
        setState((s) => ({ ...s, expenses: [...(arr || []).map((ex) => ({ id: "e" + uid(), active: true, recurring: "monthly", ...ex })), ...(s.expenses || [])] })),
      updateExpense: (id, patch) =>
        setState((s) => ({ ...s, expenses: (s.expenses || []).map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
      // ĐỔI GÓI gia hạn: chốt gói cũ (endDate) giữ nguyên các kỳ đã tính + tạo gói MỚI (ngày/phí mới).
      changeExpensePlan: (id, patch) =>
        setState((s) => {
          const ex = (s.expenses || []).find((x) => x.id === id);
          if (!ex) return s;
          const d = new Date();
          const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const ended = { ...ex, endDate: patch.endDate || today }; // gói cũ dừng tại hôm nay (các kỳ trước vẫn tính)
          const fresh = { id: "e" + uid(), name: ex.name, category: ex.category, recurring: patch.recurring || ex.recurring || "monthly", amount: Number(patch.amount) || 0, date: patch.date, note: ex.note || "", active: true };
          return { ...s, expenses: [fresh, ...(s.expenses || []).map((x) => (x.id === id ? ended : x))] };
        }),
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
      // Sửa 1 giao dịch quỹ. Nếu là phiếu CHUYỂN (có xferId) thì đồng bộ số tiền + ngày cho CẢ 2 chiều.
      updateFundTx: (id, patch) =>
        setState((s) => {
          const list = s.fundTx || [];
          const tx = list.find((t) => t.id === id);
          if (!tx) return s;
          const sib = {}; // patch cho phiếu đối ứng của cặp chuyển (chỉ số tiền/ngày)
          if (tx.xferId) { if (patch.amount != null) sib.amount = patch.amount; if (patch.date != null) sib.date = patch.date; }
          return { ...s, fundTx: list.map((t) => {
            if (t.id === id) return { ...t, ...patch };
            if (tx.xferId && t.id !== id && t.xferId === tx.xferId) return { ...t, ...sib };
            return t;
          }) };
        }),
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
      // Chuyển NHIỀU khoản 1 lúc từ 1 quỹ nguồn sang nhiều quỹ đích. entries=[{toId, amount, note}]
      transferFundMany: (fromId, entries, date) =>
        setState((s) => {
          const funds = s.funds || [];
          const nameOf = (id) => funds.find((f) => f.id === id)?.name || "quỹ";
          const add = [];
          for (const e of entries || []) {
            const amt = Number(e.amount) || 0;
            if (!fromId || !e.toId || fromId === e.toId || amt <= 0) continue;
            const xid = "xf" + uid();
            const extra = e.note ? ` · ${e.note}` : "";
            add.push({ id: "ft" + uid(), fundId: fromId, amount: amt, date, type: "out", note: `Chuyển sang ${nameOf(e.toId)}${extra}`, xferId: xid });
            add.push({ id: "ft" + uid(), fundId: e.toId, amount: amt, date, type: "in", note: `Nhận từ ${nameOf(fromId)}${extra}`, xferId: xid });
          }
          return { ...s, fundTx: [...add, ...(s.fundTx || [])] };
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
      setSettings: (patch) => {
        // OpenAI key → kho riêng của chủ (không nằm trong khối chung); khối chung chỉ giữ cờ aiEnabled
        if (privAvailRef.current === true && "openaiKey" in patch) {
          const { openaiKey: k, ...rest } = patch;
          const key = (k || "").trim();
          privRef.current = { ...privRef.current, openaiKey: key };
          setOpenaiKey(key);
          savePrivate();
          setState((s) => ({ ...s, settings: { ...s.settings, ...rest, aiEnabled: !!key } }));
          return;
        }
        setState((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
      },
      // NGƯỜI DÙNG & PHÂN QUYỀN — thành viên chung workspace, lưu trong data.members=[{email,name,perms:[]}]
      addMember: (m) => setState((s) => {
        const email = (m.email || "").trim().toLowerCase();
        if (!email) return s;
        const others = (s.members || []).filter((x) => (x.email || "").toLowerCase() !== email);
        return { ...s, members: [...others, { email, name: (m.name || "").trim(), access: m.access || {} }] };
      }),
      updateMember: (email, patch) => setState((s) => ({ ...s, members: (s.members || []).map((x) => ((x.email || "").toLowerCase() === (email || "").toLowerCase() ? { ...x, ...patch } : x)) })),
      removeMember: (email) => setState((s) => ({ ...s, members: (s.members || []).filter((x) => (x.email || "").toLowerCase() !== (email || "").toLowerCase()) })),
      // ĐẦU TƯ COIN — danh mục nắm giữ {id, symbol, qty, buyPrice, note}
      addCoin: (c) => setState((s) => ({ ...s, coins: [{ id: "co" + uid(), symbol: (c.symbol || "").toUpperCase(), qty: Number(c.qty) || 0, buyPrice: Number(c.buyPrice) || 0, note: c.note || "" }, ...(s.coins || [])] })),
      updateCoin: (id, patch) => setState((s) => ({ ...s, coins: (s.coins || []).map((c) => (c.id === id ? { ...c, ...patch, symbol: ((patch.symbol ?? c.symbol) || "").toUpperCase() } : c)) })),
      deleteCoin: (id) => setState((s) => ({ ...s, coins: (s.coins || []).filter((c) => c.id !== id) })),
      // QUẢNG CÁO — kết quả kinh doanh THẬT nhập tay theo tài khoản QC {id, accountId, date, customers, revenue, note}
      addAdsResult: (r) => setState((s) => ({ ...s, adsResults: [{ id: "ar" + uid(), accountId: r.accountId, date: r.date, customers: Number(r.customers) || 0, revenue: Number(r.revenue) || 0, note: r.note || "" }, ...(s.adsResults || [])] })),
      deleteAdsResult: (id) => setState((s) => ({ ...s, adsResults: (s.adsResults || []).filter((x) => x.id !== id) })),
      // KHO TÀI KHOẢN / THẺ / THANH TOÁN (CHỈ CHỦ) — {id,type:"app"|"card"|"bank",title,...fields,note,updatedAt}
      addVaultItem: (v) => vaultSet((list) => [{ id: "v" + uid(), type: v.type || "app", ...v, updatedAt: Date.now() }, ...list]),
      addVaultItems: (arr) => vaultSet((list) => [...(arr || []).map((v) => ({ id: "v" + uid(), type: v.type || "app", ...v, updatedAt: Date.now() })), ...list]),
      updateVaultItem: (id, patch) => vaultSet((list) => list.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: Date.now() } : x))),
      deleteVaultItem: (id) => vaultSet((list) => list.filter((x) => x.id !== id)),
      // TÀI NGUYÊN / TÀI LIỆU ONLINE (LINK) — {id,title,url,type,projectId,customerId,tags,note,createdAt}
      addResource: (r) => setState((s) => ({ ...s, resources: [{ id: "r" + uid(), title: (r.title || "").trim(), url: normUrl(r.url), type: r.type || "web", projectId: r.projectId || "", customerId: r.customerId || "", username: (r.username || "").trim(), password: r.password || "", tags: r.tags || [], note: r.note || "", createdAt: Date.now() }, ...(s.resources || [])] })),
      addResources: (arr) => setState((s) => ({ ...s, resources: [...(arr || []).map((r) => ({ id: "r" + uid(), title: (r.title || "").trim(), url: normUrl(r.url), type: r.type || "web", projectId: r.projectId || "", customerId: r.customerId || "", username: (r.username || "").trim(), password: r.password || "", tags: r.tags || [], note: r.note || "", createdAt: Date.now() })), ...(s.resources || [])] })),
      updateResource: (id, patch) => setState((s) => ({ ...s, resources: (s.resources || []).map((x) => (x.id === id ? { ...x, ...patch, ...(patch.url != null ? { url: normUrl(patch.url) } : {}) } : x)) })),
      deleteResource: (id) => setState((s) => ({ ...s, resources: (s.resources || []).filter((x) => x.id !== id) })),
      deleteResources: (ids) => setState((s) => ({ ...s, resources: (s.resources || []).filter((x) => !ids.includes(x.id)) })),
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

  // ===== KHOÁ PIN cho Tài khoản & Thẻ (mã hoá AES-GCM ngay trong máy, PIN không lưu ở đâu) =====
  const vaultApi = useMemo(() => ({
    vaultLocked: privAvail === true && vaultLocked,
    vaultHasPin,
    vaultPrivate: privAvail === true,
    unlockVault: async (pin) => {
      const P = privRef.current;
      if (!P?.lock) return true;
      try {
        const key = await deriveKey(pin, P.lock.salt, P.lock.iter || PIN_ITER);
        let list = P.vaultEnc ? await decryptJSON(key, P.vaultEnc) : [];
        pinKeyRef.current = key;
        if (pendingLegacyVault.current.length) {
          const ids = new Set(list.map((x) => x.id));
          list = [...pendingLegacyVault.current.filter((x) => !ids.has(x.id)), ...list];
          pendingLegacyVault.current = [];
          vaultMemRef.current = list;
          savePrivate();
        }
        vaultMemRef.current = list;
        setVaultMem(list);
        setVaultLocked(false);
        return true;
      } catch { return false; }
    },
    lockVault: () => { if (privRef.current?.lock) { pinKeyRef.current = null; vaultMemRef.current = null; setVaultMem(null); setVaultLocked(true); } },
    // Đặt / đổi PIN (cần đang mở khoá) → mã hoá lại toàn bộ kho
    setVaultPin: async (pin) => {
      if (privAvailRef.current !== true || !vaultMemRef.current) return false;
      const salt = newSalt();
      pinKeyRef.current = await deriveKey(pin, salt, PIN_ITER);
      privRef.current = { ...privRef.current, lock: { salt, iter: PIN_ITER } };
      await savePrivate();
      setVaultHasPin(true);
      return true;
    },
    removeVaultPin: async () => {
      if (privAvailRef.current !== true || !vaultMemRef.current) return false;
      const { lock, vaultEnc, ...rest } = privRef.current; // eslint-disable-line no-unused-vars
      privRef.current = rest;
      pinKeyRef.current = null;
      await savePrivate();
      setVaultHasPin(false);
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [privAvail, vaultLocked, vaultHasPin, user?.id]);

  const value = useMemo(() => {
    const email = (user?.email || "").toLowerCase();
    const isOwner = !!user && !!ownerId && ownerId === user.id;
    const me = (state.members || []).find((m) => (m.email || "").toLowerCase() === email);
    const access = isOwner || !ownerId ? null : memberAccess(me);
    // Chưa resolve owner → tạm full (tránh chớp). Chủ → full. Thành viên → theo access (none/view/edit).
    const perms = !ownerId || isOwner ? ALL_FEATURES : ALL_FEATURES.filter((k) => access[k] && access[k] !== "none");
    const editable = !ownerId || isOwner ? ALL_FEATURES : ALL_FEATURES.filter((k) => access[k] === "edit");
    const canEdit = (f) => editable.includes(f);
    // CHẶN GHI: thành viên không có quyền Sửa (hoặc cài đặt dữ liệu/bảo mật) → method thành no-op.
    let guarded = api;
    if (ownerId && !isOwner) {
      const noop = () => {};
      guarded = { ...api };
      for (const m of OWNER_ONLY_WRITES) if (m in guarded) guarded[m] = noop;
      for (const [feat, methods] of Object.entries(FEATURE_WRITES)) {
        if (!editable.includes(feat)) for (const m of methods) if (m in guarded) guarded[m] = noop;
      }
    }
    // Kho riêng: vault lấy từ bản đã giải mã; settings có openaiKey (chỉ chủ, trong bộ nhớ) + aiReady cho mọi người
    const usePriv = privAvail === true;
    const vault = usePriv ? vaultMem || [] : state.vault || [];
    const key = usePriv ? openaiKey : (state.settings?.openaiKey || "");
    const settings = { ...state.settings, openaiKey: isOwner || !ownerId ? key : "", aiReady: !!(key || "").trim() || !!state.settings?.aiEnabled };
    const vApi = isOwner ? vaultApi : { vaultLocked: false, vaultHasPin: false, vaultPrivate: false };
    return { ...guarded, ...vApi, vault, settings, syncStatus, isOwner, perms, editable, canEdit, myEmail: email, ownerId };
  }, [api, vaultApi, vaultMem, openaiKey, privAvail, syncStatus, user?.id, user?.email, ownerId, state.members]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useData must be inside DataProvider");
  return ctx;
}
