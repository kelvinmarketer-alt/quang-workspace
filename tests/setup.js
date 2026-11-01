// Môi trường giả lập trình duyệt cho kiểm thử (jsdom thiếu vài API mà app / thư viện biểu đồ dùng)
class RO { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = globalThis.ResizeObserver || RO;
globalThis.IntersectionObserver = globalThis.IntersectionObserver || class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
if (!window.matchMedia) window.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
window.scrollTo = () => {};
Element.prototype.scrollIntoView = () => {};
HTMLCanvasElement.prototype.getContext = () => null;
globalThis.Notification = globalThis.Notification || { permission: "denied", requestPermission: async () => "denied" };

// Giả lập Supabase cho MỌI bài kiểm thử (không gọi mạng) — mọi truy vấn trả rỗng
import { vi } from "vitest";
const result = { data: null, error: null };
const chain = () => { const p = Promise.resolve(result); const c = new Proxy(() => {}, { get: (_, k) => (k === "then" ? p.then.bind(p) : k === "catch" ? p.catch.bind(p) : k === "finally" ? p.finally.bind(p) : () => c), apply: () => c }); return c; };
vi.mock("../src/lib/supabase.js", () => ({
  WORKSPACE_TABLE: "qws_workspaces",
  supabase: {
    from: () => chain(), rpc: () => chain(),
    functions: { invoke: async () => ({ data: {}, error: null }) },
    auth: { getUser: async () => ({ data: { user: { id: "u1", email: "chu@example.com" } } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
  },
}));
