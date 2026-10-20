import { Component } from "react";
import { RefreshCw } from "lucide-react";

const isChunkError = (e) => /dynamically imported module|Importing a module script failed|Loading chunk|Failed to fetch/i.test(String(e?.message || e));

// Bắt lỗi khi mở 1 trang: app để mở lâu qua 1 lần cập nhật → file trang cũ không còn → TỰ TẢI LẠI 1 lần thay vì màn trắng.
export class ErrorBoundary extends Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) {
    console.error("Lỗi giao diện:", err);
    if (isChunkError(err)) {
      try { if (!sessionStorage.getItem("qws-chunk-reload")) { sessionStorage.setItem("qws-chunk-reload", "1"); window.location.reload(); } } catch { /* bỏ qua */ }
    }
  }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.err) this.setState({ err: null }); }
  render() {
    if (!this.state.err) return this.props.children;
    const chunk = isChunkError(this.state.err);
    return (
      <div className="mx-auto my-16 max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <div className="text-[15px] font-extrabold text-slate-800">{chunk ? "App vừa có bản mới" : "Trang này gặp lỗi"}</div>
        <div className="mt-1 text-[13px] text-slate-500">{chunk ? "Tải lại để dùng bản mới nhất. Dữ liệu của bạn vẫn an toàn." : "Dữ liệu của bạn vẫn an toàn. Thử tải lại trang."}</div>
        <button onClick={() => { try { sessionStorage.removeItem("qws-chunk-reload"); } catch { /* bỏ qua */ } window.location.reload(); }} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white"><RefreshCw size={15} /> Tải lại</button>
      </div>
    );
  }
}
