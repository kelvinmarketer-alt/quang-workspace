// Mốc TP KỲ VỌNG cho lệnh SW3 / phương án D (sếp yêu cầu 08/11). D không đặt TP trên sàn — phần 2/3 còn lại giữ tới khi chạm SL dời
// theo đỉnh/đáy 20 nến H4. Mốc này lấy từ lịch sử 2.100 lệnh D (18 mã, 2018 – 06/11/2026), tính theo R gốc (khoảng cách SL ban đầu):
// lệnh đã chốt 1/3 và có lãi → phần còn lại đóng trung bình ở +1,5R; 10% lệnh tốt nhất chạy tới +3,8R. Chỉ để tham khảo, không phải lệnh trên sàn.
export const SW3_TP = { avgR: 1.5, farR: 3.8 };
export const sw3Targets = (entry, side, risk) => (entry && risk > 0 ? { avg: entry + side * SW3_TP.avgR * risk, far: entry + side * SW3_TP.farR * risk } : null);
