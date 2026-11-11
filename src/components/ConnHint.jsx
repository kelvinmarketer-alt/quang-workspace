// 11/11: 1 dòng giải thích dưới mỗi kết nối — dùng để làm gì, thiếu / hết hạn thì hỏng gì (lời ngắn, dễ hiểu)
import { Info } from "lucide-react";

export const CONN_HELP = {
  openai: "Để AI đọc tin nhắn, tự nhập dự án và đợt thu. Thiếu hoặc hết tiền: nút Nhập bằng AI không chạy.",
  aiUsage: "Xem tiền AI đã tiêu tháng này. Chỉ để theo dõi, không ảnh hưởng chức năng khác.",
  ical: "Đưa giỗ, sinh nhật, việc lên lịch điện thoại. Mất link: điện thoại không nhận lịch mới.",
  meta: "Token Meta để lấy chi tiêu, kết quả quảng cáo. Hết hạn: báo cáo và cảnh báo quảng cáo đứng số.",
  gads: "Script trong Google Ads đẩy số mỗi giờ. Script dừng: số Google Ads trong báo cáo không cập nhật.",
  office: "Máy chạy đội AI làm việc tự động. Máy vắng: không có việc, báo cáo, thông báo mới từ đội AI.",
  allAds: "Danh sách tổng mọi tài khoản quảng cáo. Gắn sai thương hiệu: số quảng cáo vào nhầm báo cáo.",
  brandAds: "Lấy chi tiêu, kết quả quảng cáo. Thiếu: báo cáo và cảnh báo quảng cáo thương hiệu này trống.",
  brandWeb: "Lấy lượt xem, từ khoá Google. Thiếu: ô Website và SEO trong báo cáo không có số.",
  brandPage: "Lấy tương tác, bài đăng fanpage. Thiếu: ô Fanpage trong báo cáo không có số.",
};

export default function ConnHint({ k, children, className = "" }) {
  const text = children || CONN_HELP[k];
  if (!text) return null;
  return (
    <div className={`flex items-start gap-1.5 text-[12px] leading-snug text-slate-500 ${className}`}>
      <Info size={13} className="mt-px shrink-0 text-slate-400" aria-hidden />
      <span className="min-w-0">{text}</span>
    </div>
  );
}
