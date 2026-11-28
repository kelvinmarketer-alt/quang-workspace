// 28/11 (đo CLS): khung giữ chỗ cho dải Sức khoẻ ở Tổng quan — cùng bố cục, chữ mờ. Dải thật tải sau (chunk riêng + số liệu)
// nên trước đây chèn vào làm cả trang tụt xuống ~90px. Chỉ hiện khi máy này đã từng hiện dải (nhớ ở localStorage qws_hs_on).
export const HS_KEY = "qws_hs_on";
export const hsRemembered = () => { try { return localStorage.getItem(HS_KEY) === "1"; } catch { return false; } };
export const hsRemember = (on) => { try { localStorage.setItem(HS_KEY, on ? "1" : "0"); } catch { /* bỏ qua */ } };

const Bar = ({ w }) => <span className={`inline-block h-[1em] animate-pulse rounded bg-slate-100 align-middle ${w}`} />;
export default function HealthStripGhost() {
  return (
    <div className="card flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3" aria-hidden="true">
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Sức khoẻ</span>
      <div className="flex min-w-[170px] flex-1 items-center gap-2">
        <span className="h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold"><Bar w="w-24" /></div>
          <div className="mt-0.5 h-2 rounded-full bg-slate-100" />
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-[12.5px] font-bold text-transparent"><span className="h-3.5 w-3.5" /> 1 ly</span>
      </div>
      <span className="flex items-center gap-1.5 text-[13px] font-bold"><span className="h-4 w-4" /><Bar w="w-24" /></span>
      <span className="flex items-center gap-1.5 text-[13px] font-bold"><span className="h-4 w-4" /><Bar w="w-16" /></span>
    </div>
  );
}
