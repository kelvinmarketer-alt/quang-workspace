// Gọi OpenAI API (client-side) để bóc tách dữ liệu từ ảnh / đoạn chat
// thành khách hàng + dự án + đợt thu. Key/model truyền vào từ store.settings.
import { supabase } from "./supabase.js";

// Gọi OpenAI QUA MÁY CHỦ (edge fn qws-ai): key nằm ở kho riêng của chủ, trình duyệt không thấy; có ghi chi phí.
// Máy chủ chưa bật (chưa deploy) → chủ còn key trong máy thì gọi thẳng như cũ.
async function chat(body, key, feature) {
  const asRes = (ok, status, data) => ({ ok, status, json: async () => data });
  try {
    const { data, error } = await supabase.functions.invoke("qws-ai", { body: { feature, body } });
    if (!error && data && !data.error) return asRes(true, 200, data);
    let msg = data?.error;
    if (error) { try { msg = (await error.context?.json?.())?.error; } catch { /* bỏ qua */ } }
    const notDeployed = error && (error.context?.status === 404 || /Failed to send|FunctionsFetchError/i.test(error.name + error.message));
    if (!notDeployed) return asRes(false, error?.context?.status || 400, { error: { message: msg || error?.message || "Lỗi AI" } });
  } catch { /* rơi xuống gọi thẳng */ }
  if (!key) return asRes(false, 400, { error: { message: "AI chưa sẵn sàng: chủ workspace cần nhập API key OpenAI trong Cài đặt." } });
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  return asRes(r.ok, r.status, await r.json().catch(() => ({})));
}


const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function systemPrompt() {
  const today = iso(new Date());
  return `Bạn là trợ lý NHẬP LIỆU cho app quản lý dịch vụ marketing (Web, App, ADS, Coaching, Seo, Landing, Khác).
Nhiệm vụ: đọc ảnh hoặc đoạn text người dùng đưa, trích xuất thành JSON khách hàng + dự án + các ĐỢT THU.
Hôm nay là ${today}. Chỉ trả về JSON, không giải thích.

QUY TẮC:
- Tiền: "10tr"=10000000, "1tr5"=1500000, "500k"=500000, "8 triệu"=8000000. Trả về SỐ nguyên đồng (number), không có dấu chấm.
- Ngày: nếu chỉ có ngày/tháng (vd 9/1) → giả định năm hiện tại. Định dạng "YYYY-MM-DD". Không rõ thì để hôm nay.
- Mỗi DÒNG text thường là 1 ĐỢT THU. Gộp các đợt cùng 1 khách + cùng loại dịch vụ vào CHUNG 1 dự án (project.installments).
- category phải thuộc: Web, App, ADS, Coaching, Seo, Landing, Khác.
- Với ADS: amount = số tiền NHẬN (ngân sách khách đưa); serviceFee = phí chạy (nếu không nói rõ thì = 20% amount); spend = tiền chạy thực tế; chiết khấu = amount - serviceFee - spend (KHÔNG cần trả, app tự tính).
- Với dịch vụ khác: amount = phí dịch vụ của đợt đó; serviceFee/spend = 0.
- collected = đã thu của đợt. Nếu nói "thu đủ"/"đã thanh toán"/"đã nhận" → collected = amount. Nếu "cọc 50%" → collected = 50% amount. Nếu chưa nói gì hoặc "chưa thu" → collected = 0.
- refund = tiền hoàn khách (khi job dừng); carry = tiền chuyển đợt sau; ctv = hoa hồng cộng tác viên. Mặc định 0.
- status: "doing" (đang làm), "done" (xong), "paused" (tạm dừng), "cancel" (huỷ). Mặc định "doing".

SCHEMA JSON trả về:
{
  "customers": [{ "name": "Tên", "phone": "SĐT" }],
  "projects": [{
    "customerName": "Tên khách",
    "phone": "SĐT (nếu có)",
    "name": "Tên dự án",
    "category": "ADS",
    "status": "doing",
    "note": "",
    "installments": [
      { "label": "Tháng 6", "date": "2026-06-10", "amount": 10000000, "serviceFee": 2000000, "spend": 4000000, "refund": 0, "carry": 0, "ctv": 0, "otherCost": 0, "collected": 10000000 }
    ]
  }]
}`;
}

export async function aiImport({ text, imageDataUrl, apiKey, model }) {
  const key = (apiKey || "").trim();
  if (!text && !imageDataUrl) throw new Error("Cần ảnh hoặc đoạn text để phân tích.");

  const userContent = [];
  if (text) userContent.push({ type: "text", text });
  if (imageDataUrl) userContent.push({ type: "image_url", image_url: { url: imageDataUrl } });

  const body = {
    model: model || "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt() },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  };

  const res = await chat(body, key, "import");
  if (!res.ok) {
    let msg = res.status + "";
    try { const e = await res.json(); msg = e.error?.message || JSON.stringify(e); } catch {}
    throw new Error("OpenAI lỗi: " + msg);
  }
  const data = await res.json();
  const txt = data.choices?.[0]?.message?.content || "{}";
  let parsed;
  try { parsed = JSON.parse(txt); } catch { throw new Error("Không đọc được JSON từ AI."); }
  return {
    customers: Array.isArray(parsed.customers) ? parsed.customers : [],
    projects: Array.isArray(parsed.projects) ? parsed.projects : [],
  };
}

// Đọc ảnh chụp màn hình chứa CÁC LINK / TÀI NGUYÊN online -> { resources: [{title,url,type}] } bằng OpenAI Vision.
export async function aiReadResources({ imageDataUrl, text, apiKey, model }) {
  const key = (apiKey || "").trim();
  if (!imageDataUrl && !text) throw new Error("Cần ảnh (hoặc text) để đọc.");
  const sys = `Bạn đọc ảnh chứa TÀI NGUYÊN ONLINE, THƯỜNG LÀ 1 BẢNG (spreadsheet) có hàng tiêu đề + nhiều dòng dữ liệu. Mỗi DÒNG dữ liệu = 1 mục. Trích MỌI dòng thành danh sách. CHỈ trả JSON, không giải thích.

CÁCH ĐỌC BẢNG (QUAN TRỌNG): nhìn HÀNG TIÊU ĐỀ để biết mỗi CỘT là gì, rồi ánh xạ theo cột:
- Cột "Hạng Mục"/"Tên"/"Tên nguồn"/"Nguồn"/"Mục"/"Nền tảng"  →  title
- Cột "Tài khoản"/"Đăng nhập"/"User"/"Username"/"Email"/"Account"  →  username
- Cột "Mật khẩu"/"Mật Khẩu"/"Password"/"Pass"/"MK"  →  password
- Cột "Link"/"Link Đăng Nhập"/"URL"/"Website"/"Đường dẫn"  →  url
- Cột "Ghi chú"/"Note"/"Mô tả"/"Vai trò"  →  note

QUY TẮC BẮT BUỘC:
- title: LẤY ĐÚNG chữ ở cột Hạng Mục/Tên của dòng đó. NẾU cột đó có chữ thì PHẢI dùng đúng nó, TUYỆT ĐỐI KHÔNG tự đặt tên theo link/tên miền. Chỉ khi dòng thật sự trống tên mới để "".
- username & password: lấy đúng ô của dòng, đọc CHÍNH XÁC TỪNG KÝ TỰ (phân biệt hoa/thường, số, ký hiệu @ # . _, dễ nhầm 0-O, 1-l-I). KHÔNG bỏ trống nếu ô có dữ liệu. Không có thì "".
- url: link đầy đủ (kèm "https://"). Nếu dòng có tài khoản/mật khẩu nhưng KHÔNG có link thì VẪN trả mục đó với url="" (đừng bỏ dòng). Không bịa link.
- note: lấy từ cột Ghi chú nếu có.
- type: sheet, doc, slide, drive, figma, canva, notion, youtube, facebook, image, folder, web — suy từ link; không rõ để "web".
- Ghép ĐÚNG từng ô theo hàng ngang, KHÔNG lệch dòng.
Ví dụ 1 dòng (Hạng Mục=Quản trị website, Tài khoản=admin, Mật khẩu=Tuantu@2026, Link=https://site.vn/wp-admin/): { "title":"Quản trị website", "username":"admin", "password":"Tuantu@2026", "url":"https://site.vn/wp-admin/", "type":"web", "note":"" }
SCHEMA: { "resources": [ { "title":"", "url":"", "type":"web", "username":"", "password":"", "note":"" } ] }`;
  const userContent = [{ type: "text", text: (text ? text + "\n" : "") + "Trích tất cả link/tài nguyên trong ảnh này." }];
  if (imageDataUrl) userContent.push({ type: "image_url", image_url: { url: imageDataUrl } });
  const body = {
    model: model || "gpt-4o-mini",
    messages: [{ role: "system", content: sys }, { role: "user", content: userContent }],
    response_format: { type: "json_object" },
    temperature: 0,
  };
  const res = await chat(body, key, "resources");
  if (!res.ok) {
    let msg = res.status + "";
    try { const e = await res.json(); msg = e.error?.message || JSON.stringify(e); } catch {}
    throw new Error("OpenAI lỗi: " + msg);
  }
  const data = await res.json();
  const txt = data.choices?.[0]?.message?.content || "{}";
  let p;
  try { p = JSON.parse(txt); } catch { throw new Error("Không đọc được JSON từ AI."); }
  const raw = Array.isArray(p.resources) ? p.resources : (p.url ? [p] : []);
  const resources = raw
    .map((r) => ({ title: (r.title || "").toString().slice(0, 200), url: (r.url || "").toString().trim(), type: (r.type || "").toString(), username: (r.username || "").toString().slice(0, 200), password: (r.password || "").toString().slice(0, 200), note: (r.note || "").toString().slice(0, 300) }))
    .filter((r) => /\S/.test(r.url));
  return { resources };
}

// Đọc ảnh chứa DANH SÁCH TÀI KHOẢN / THẺ / TK NGÂN HÀNG -> { items: [{type,title,...fields}] } bằng OpenAI Vision.
export async function aiReadVault({ imageDataUrl, text, apiKey, model }) {
  const key = (apiKey || "").trim();
  if (!imageDataUrl) throw new Error("Cần ảnh để đọc.");
  const sys = `Bạn đọc ảnh chứa DANH SÁCH TÀI KHOẢN ĐĂNG NHẬP / THẺ NGÂN HÀNG / TÀI KHOẢN NGÂN HÀNG-VÍ, THƯỜNG LÀ 1 BẢNG có hàng tiêu đề + nhiều dòng. Mỗi DÒNG = 1 mục. Trích MỌI dòng thành JSON. CHỈ trả JSON, không giải thích.
NẾU LÀ BẢNG: nhìn hàng tiêu đề để ánh xạ cột → cột "Hạng Mục"/"Tên"/"Nguồn" = title; "Tài khoản"/"Đăng nhập"/"User"/"Email" = username; "Mật khẩu"/"Password"/"Pass" = password; "Link"/"Link Đăng Nhập"/"URL" = url; "Ghi chú"/"Note" = note. LẤY ĐÚNG chữ ở cột tên (KHÔNG tự đặt theo link). Đọc CHÍNH XÁC từng ký tự tài khoản/mật khẩu, ghép đúng theo hàng ngang không lệch dòng.
Mỗi mục có "type":
- "app" = tài khoản ứng dụng/web (Facebook, Gmail, hosting, CMS…). Trường: title (tên app/dịch vụ), username (tài khoản/email/đăng nhập), password, url (link đăng nhập nếu có), twofa (mã 2FA/khôi phục nếu có), note.
- "card" = thẻ ngân hàng/Visa/Master. Trường: title (tên thẻ), holder (chủ thẻ), number (số thẻ), expiry (MM/YY), cvv, bank (ngân hàng phát hành), note.
- "bank" = tài khoản ngân hàng / ví điện tử (Momo, ZaloPay…). Trường: title (tên), holder (chủ tài khoản), number (số tài khoản), bank (ngân hàng/ví), branch (chi nhánh), note.
QUY TẮC:
- Chọn type đúng nhất theo dữ liệu của mục. Nếu chỉ là tài khoản đăng nhập app/web → "app".
- Đọc CHÍNH XÁC từng ký tự password/số thẻ/số tài khoản/cvv (phân biệt hoa-thường, 0-O, 1-l-I).
- Ghép ĐÚNG các trường vào mục (dòng) của nó. Trường không có để "".
- title bắt buộc có (nếu trống thì suy từ tên app/ngân hàng). Bỏ mục hoàn toàn trống.
SCHEMA: { "items": [ { "type":"app", "title":"Facebook", "username":"user@mail.com", "password":"Abc@123", "url":"", "twofa":"", "note":"" } ] }`;
  const userContent = [{ type: "text", text: (text ? text + "\n" : "") + "Trích tất cả tài khoản/thẻ/tài khoản ngân hàng trong ảnh này." }];
  if (imageDataUrl) userContent.push({ type: "image_url", image_url: { url: imageDataUrl } });
  const body = {
    model: model || "gpt-4o-mini",
    messages: [{ role: "system", content: sys }, { role: "user", content: userContent }],
    response_format: { type: "json_object" },
    temperature: 0,
  };
  const res = await chat(body, key, "vault");
  if (!res.ok) {
    let msg = res.status + "";
    try { const e = await res.json(); msg = e.error?.message || JSON.stringify(e); } catch {}
    throw new Error("OpenAI lỗi: " + msg);
  }
  const data = await res.json();
  const txt = data.choices?.[0]?.message?.content || "{}";
  let p;
  try { p = JSON.parse(txt); } catch { throw new Error("Không đọc được JSON từ AI."); }
  const raw = Array.isArray(p.items) ? p.items : (p.title ? [p] : []);
  const S = (v) => (v == null ? "" : String(v).slice(0, 300));
  const items = raw
    .map((r) => {
      const type = ["app", "card", "bank"].includes(r.type) ? r.type : "app";
      return { type, title: S(r.title), username: S(r.username), password: S(r.password), url: S(r.url), twofa: S(r.twofa), holder: S(r.holder), number: S(r.number), expiry: S(r.expiry), cvv: S(r.cvv), bank: S(r.bank), branch: S(r.branch), note: S(r.note) };
    })
    .filter((r) => r.title || r.username || r.number || r.password);
  return { items };
}

// Đọc file ảnh -> data URL base64
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Đọc ảnh + THU NHỎ (max cạnh maxDim) + nén JPEG -> data URL (giảm dung lượng gửi OpenAI + làm thumbnail)
export function imageToDataUrl(file, maxDim = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = reject;
    r.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        try {
          let { width, height } = img;
          const scale = Math.min(1, maxDim / Math.max(width, height));
          width = Math.max(1, Math.round(width * scale));
          height = Math.max(1, Math.round(height * scale));
          const c = document.createElement("canvas");
          c.width = width; c.height = height;
          c.getContext("2d").drawImage(img, 0, 0, width, height);
          resolve(c.toDataURL("image/jpeg", quality));
        } catch (e) { resolve(r.result); } // lỗi canvas → dùng ảnh gốc
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

// Đọc ảnh BIÊN LAI / SAO KÊ / DANH SÁCH giao dịch -> { transactions: [{amount,date,note}] } bằng OpenAI Vision.
// Ảnh có thể là 1 giao dịch HOẶC danh sách nhiều giao dịch → trả về MẢNG (mỗi giao dịch 1 phần tử).
export async function aiReadExpense({ imageDataUrl, apiKey, model }) {
  const key = (apiKey || "").trim();
  if (!imageDataUrl) throw new Error("Cần ảnh để đọc.");
  const today = iso(new Date());
  const sys = `Bạn đọc ảnh chụp BIÊN LAI / GIAO DỊCH / SAO KÊ / LỊCH SỬ NGÂN HÀNG / VÍ ĐIỆN TỬ. Ảnh có thể là 1 giao dịch HOẶC DANH SÁCH nhiều giao dịch (nhiều dòng). Trích TỪNG giao dịch thành 1 phần tử. Hôm nay ${today}. CHỈ trả JSON, không giải thích.
QUY TẮC:
- amount = số tiền của giao dịch đó, SỐ nguyên đồng, bỏ hết dấu chấm/phẩy/ký hiệu tiền: "-500.000đ"→500000, "500,000 VND"→500000, "1,5tr"→1500000. Ngân hàng VN hay ghi rút gọn theo NGHÌN: "42,0" / "42.0" / "42K" nghĩa là 42.000 → trả 42000; "110,0"→110000. Luôn lấy giá trị DƯƠNG.
- type = CHIỀU tiền của dòng đó: "in" nếu TIỀN VÀO (nhận tiền, cộng "+", màu xanh, "Nhận từ", "GD ghi có", số dương); "out" nếu TIỀN RA (chi/chuyển đi, trừ "-", màu đỏ, "Chuyển tới", "GD ghi nợ", thanh toán). Dựa vào dấu +/−, màu sắc, hoặc chữ để quyết định. Không chắc thì "out".
- date = ngày giao dịch "YYYY-MM-DD"; không rõ thì "${today}".
- note = người gửi/nhận hoặc nội dung ngắn của dòng đó (vd tên người, "Chuyển khoản", "Thanh toán").
- Lấy MỌI dòng giao dịch có số tiền đọc được. Không đọc được dòng nào thì bỏ dòng đó (đừng bịa).
SCHEMA: { "transactions": [ { "amount": 42000, "type": "out", "date": "${today}", "note": "Phạm Văn Hải" } ] }`;
  const body = {
    model: model || "gpt-4o-mini",
    messages: [
      { role: "system", content: sys },
      { role: "user", content: [{ type: "text", text: "Đọc tất cả giao dịch trong ảnh này." }, { type: "image_url", image_url: { url: imageDataUrl } }] },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  };
  const res = await chat(body, key, "expense");
  if (!res.ok) {
    let msg = res.status + "";
    try { const e = await res.json(); msg = e.error?.message || JSON.stringify(e); } catch {}
    throw new Error("OpenAI lỗi: " + msg);
  }
  const data = await res.json();
  const txt = data.choices?.[0]?.message?.content || "{}";
  let p;
  try { p = JSON.parse(txt); } catch { throw new Error("Không đọc được JSON từ AI."); }
  // Hỗ trợ cả schema mảng lẫn 1 giao dịch lẻ (phòng khi model trả {amount} thay vì {transactions})
  const raw = Array.isArray(p.transactions) ? p.transactions : (p.amount != null ? [p] : []);
  const transactions = raw
    .map((t) => ({
      amount: Math.abs(Number(String(t.amount ?? "").replace(/[^\d-]/g, "")) || 0),
      type: t.type === "in" ? "in" : "out",
      date: /^\d{4}-\d{2}-\d{2}$/.test(t.date || "") ? t.date : today,
      note: (t.note || "").toString().slice(0, 120),
    }))
    .filter((t) => t.amount > 0);
  return { transactions };
}

// Phân tích Quảng cáo (module /quang-cao). Số liệu + chấm điểm đã TÍNH SẴN bằng code (lib/adsDiagnose.js) →
// AI chỉ diễn giải + ra hành động cụ thể, trả JSON (app tự trình bày, không còn markdown **).
export async function aiAdsAnalysis({ diagnosis, group, apiKey }) {
  const key = (apiKey || "").trim();
  const sys = `Bạn là trưởng phòng performance marketing (Facebook + Google Ads) cho doanh nghiệp nhỏ ở Việt Nam. Nhận JSON "chẩn đoán" đã tính sẵn và viết báo cáo hành động, tiếng Việt, ngắn gọn, thẳng thắn.
LUẬT BẮT BUỘC:
- KHÔNG tự tính lại hay suy ra % thay đổi: chỉ dùng số có sẵn (deltas = % thay đổi so với kỳ trước, dương = tăng). Giá/KQ, CPM, CPC TĂNG là XẤU; kết quả, CTR TĂNG là TỐT.
- "verdict" của từng tài khoản/chiến dịch đã được chấm theo mốc (KPI/kỳ trước/TB). Tôn trọng verdict, giải thích VÌ SAO bằng số.
- Mỗi hành động phải CỤ THỂ: nêu đúng tên chiến dịch/quảng cáo/từ khoá, làm gì (tắt / giảm NS x% / tăng NS x% / đổi mẫu / thu hẹp hoặc mở rộng đối tượng / thêm từ khoá phủ định / sửa kịch bản inbox), và con số kỳ vọng.
- Mục có "Ít dữ liệu" hoặc kỳ < 3 ngày: KHÔNG khuyên tắt, chỉ khuyên theo dõi tiếp.
- Nhóm thương hiệu: đánh giá theo tiếp cận, CPM, tần suất, ThruPlay, tương tác — không đòi tin nhắn.
- Có "real" (khách chốt/doanh thu nhập tay) thì ưu tiên đánh giá theo giá/khách và ROAS.
- Tiền viết dạng 45k, 1,2tr. Không dùng markdown, không ký tự * hay #.
Trả về JSON đúng schema:
{
 "tong_quan": "2-3 câu: tình hình chung + điều quan trọng nhất",
 "uu_tien": [ { "viec": "hành động ngắn", "chi_tiet": "làm cụ thể thế nào", "tac_dong": "kỳ vọng (vd: tiết kiệm ~300k/tuần)" } ],
 "tai_khoan": [ { "ten": "đúng tên tài khoản", "nhan_dinh": "1-2 câu", "diem_tot": ["..."], "van_de": ["..."], "hanh_dong": ["..."] } ],
 "can_them_du_lieu": ["dữ liệu nên bổ sung để đánh giá chuẩn hơn (vd: đặt KPI giá/kết quả, nhập khách chốt)"]
}
uu_tien tối đa 5 việc, sắp theo tác động lớn nhất. Bỏ qua tài khoản "Không chạy" trong tai_khoan (chỉ nhắc 1 câu trong tong_quan nếu cần).`;
  const res = await chat({ model: "gpt-4o", temperature: 0.2, response_format: { type: "json_object" }, messages: [{ role: "system", content: sys }, { role: "user", content: JSON.stringify({ nhom: group === "brand" ? "Thương hiệu" : "Chuyển đổi", ...diagnosis }) }] }, key, "ads");
  if (!res.ok) {
    let msg = res.status + "";
    try { const e = await res.json(); msg = e.error?.message || JSON.stringify(e); } catch {}
    throw new Error("OpenAI lỗi: " + msg);
  }
  const data = await res.json();
  let p;
  try { p = JSON.parse(data.choices?.[0]?.message?.content || "{}"); } catch { throw new Error("Không đọc được JSON từ AI."); }
  const clean = (v) => String(v ?? "").replace(/[*#]+/g, "").trim();
  const arr = (v) => (Array.isArray(v) ? v.map(clean).filter(Boolean) : []);
  return {
    overview: clean(p.tong_quan),
    priorities: (Array.isArray(p.uu_tien) ? p.uu_tien : []).map((x) => ({ what: clean(x.viec), how: clean(x.chi_tiet), impact: clean(x.tac_dong) })).filter((x) => x.what),
    accounts: (Array.isArray(p.tai_khoan) ? p.tai_khoan : []).map((x) => ({ name: clean(x.ten), summary: clean(x.nhan_dinh), good: arr(x.diem_tot), issues: arr(x.van_de), actions: arr(x.hanh_dong) })),
    needData: arr(p.can_them_du_lieu),
    at: Date.now(),
  };
}

// Phân tích HIỆU QUẢ WEBSITE (module /website): số GSC + GA4 + cơ hội SEO đã TÍNH SẴN bằng code (lib/webData.js) → AI diễn giải + việc cần làm, trả JSON.
export async function aiWebAnalysis({ data, apiKey }) {
  const key = (apiKey || "").trim();
  const sys = `Bạn là chuyên gia SEO + tăng trưởng website (Google Search Console + GA4) cho doanh nghiệp nhỏ ở Việt Nam. Nhận JSON số liệu 1 website (kỳ này + kỳ trước, % thay đổi đã tính sẵn) và viết báo cáo HÀNH ĐỘNG, tiếng Việt, ngắn, thẳng.
LUẬT:
- KHÔNG tự tính lại %: dùng đúng số đã cho ("d_" = % thay đổi so kỳ trước, dương = tăng). Vị trí TB GIẢM là TỐT (lên hạng).
- Mỗi việc phải CỤ THỂ: nêu đúng từ khoá / URL trang, làm gì (sửa title/meta, thêm đoạn trả lời câu hỏi, thêm FAQ, gắn link nội bộ từ trang X, viết bài mới cho cụm từ khoá Y, sửa trang đích có tỉ lệ tương tác thấp, gắn nút gọi/Zalo…), và kỳ vọng (vd +40 click/tháng — dùng trường "gain" đã tính).
- "co_hoi.near" = từ khoá đang ở vị trí 4–20 nhiều hiển thị (đẩy lên top 3); "co_hoi.lowCtr" = đã top 3 mà CTR thấp (sửa tiêu đề/mô tả cho hút click).
- "trang_tut" = trang mất click so kỳ trước → nêu nguyên nhân khả dĩ + cách xử lý.
- "nguon" = khách đến từ nền tảng nào (Google tìm kiếm, Google Ads, Facebook, Instagram, Zalo, TikTok, AI như ChatGPT/Gemini…): chỉ ra nguồn mang khách CHẤT LƯỢNG (tương tác, chuyển đổi) và nguồn yếu; nhận xét riêng lượng khách từ AI (đang có/tăng không, nên làm gì để được AI trích dẫn nhiều hơn).
- "su_kien" = hành động khách trên web (bấm gọi, bấm Zalo, gửi form, thêm giỏ, đặt bàn…; la_chuyen_doi = GA4 đang tính là chuyển đổi): đánh giá tỉ lệ hành động/người dùng, sự kiện quan trọng nào CHƯA được đánh dấu chuyển đổi, sự kiện nào có dấu hiệu đếm ảo (số lần/người quá cao).
- Số liệu ít (click < 30) thì nói rõ là ít dữ liệu, không kết luận mạnh.
- Không markdown, không ký tự * hay #. Số lớn viết 1,2k.
Trả JSON đúng schema:
{
 "tong_quan": "2-3 câu: web đang tăng hay giảm, vì sao, điều quan trọng nhất",
 "uu_tien": [ { "viec": "...", "chi_tiet": "...", "tac_dong": "..." } ],
 "seo": ["nhận định về từ khoá / thứ hạng / CTR"],
 "noi_dung": ["ý tưởng bài viết / trang mới cụ thể dựa trên từ khoá có hiển thị"],
 "chuyen_doi": ["nhận định về nguồn khách, trang đích, sự kiện chuyển đổi"],
 "can_them_du_lieu": ["..."]
}
uu_tien tối đa 6 việc, sắp theo tác động lớn nhất.`;
  const res = await chat({ model: "gpt-4o", temperature: 0.2, response_format: { type: "json_object" }, messages: [{ role: "system", content: sys }, { role: "user", content: JSON.stringify(data) }] }, key, "web");
  if (!res.ok) {
    let msg = res.status + "";
    try { const e = await res.json(); msg = e.error?.message || JSON.stringify(e); } catch {}
    throw new Error("OpenAI lỗi: " + msg);
  }
  const out = await res.json();
  let p;
  try { p = JSON.parse(out.choices?.[0]?.message?.content || "{}"); } catch { throw new Error("Không đọc được JSON từ AI."); }
  const clean = (v) => String(v ?? "").replace(/[*#]+/g, "").trim();
  const arr = (v) => (Array.isArray(v) ? v.map(clean).filter(Boolean) : []);
  return {
    overview: clean(p.tong_quan),
    priorities: (Array.isArray(p.uu_tien) ? p.uu_tien : []).map((x) => ({ what: clean(x.viec), how: clean(x.chi_tiet), impact: clean(x.tac_dong) })).filter((x) => x.what),
    seo: arr(p.seo), content: arr(p.noi_dung), conversion: arr(p.chuyen_doi), needData: arr(p.can_them_du_lieu),
    at: Date.now(),
  };
}

// Phân tích thị trường coin (module Coin → tab Thị trường) theo BỘ KIẾN THỨC riêng của Quang (lib/tradeKnowledge.js:
// EA SMC/Price Action + Key Volume + VSA/Wyckoff). Số liệu tính sẵn ở lib/ta.js; app tự kiểm tra lại SL/TP + khoảng cách SL ≤ 4 ATR.
export async function aiMarketAnalysis({ symbol, tf, htf, summary, htfSummary, candles, apiKey, model }) {
  const key = (apiKey || "").trim();
  const { PLAYBOOK_TEXT, SETUP_TYPES } = await import("./tradeKnowledge.js");
  const sys = `Bạn là trader chuyên nghiệp phân tích crypto THEO ĐÚNG BỘ KIẾN THỨC/CHIẾN LƯỢC dưới đây (của chính người dùng — ưu tiên tuyệt đối hơn kiến thức chung). Mọi nhận định, setup, entry, SL, TP phải bám các quy tắc này.

===== BỘ KIẾN THỨC =====
${PLAYBOOK_TEXT}
===== HẾT BỘ KIẾN THỨC =====

DỮ LIỆU (JSON, tính sẵn từ nến Binance; "ltf" = khung đang xem, "htf" = khung lớn hơn; nến cuối trong "candles" ĐANG CHẠY, các trường volume/vsa/sfp/patterns đã tính trên nến ĐÃ ĐÓNG):
- trendFilter: EMA200, độ dốc EMA89 (bps/5 nến), ADX/DI → bộ lọc xu hướng & sideway.
- protected: Protected High/Low (major pivot 20/5) và đã bị thủng chưa.
- keyVolume: nến volume lớn nhất 100 nến + các nến volume >2.5× TB (vùng, số lần retest, đã được BẢO VỆ chưa).
- structure (swing HH/HL/LH/LL, BOS/CHoCH), orderBlocks, fvg, liquidity (equal highs/lows, đỉnh/đáy chưa quét), range100 (premium/discount).
- sfp (kèm volRel & "valid"), sideway (hộp 20 nến, fakeout), volumeProfile (POC, HVN, LVN gần giá), vsa (nhãn VSA từng nến đã đóng), volumeDivergence, patterns, momentum, volume.

YÊU CẦU:
- Đánh giá đủ: bối cảnh khung lớn → xu hướng/bộ lọc → vùng (Key Volume/OB/SDz/HVN) → thanh khoản đã bị lấy chưa → tín hiệu VSA/nến xác nhận.
- Chỉ đề xuất setup khi khớp 1 setup trong bộ kiến thức (setup_type thuộc: ${SETUP_TYPES.join(", ")}). Ghi rõ điều kiện KÍCH HOẠT còn phải chờ (trigger) — vì người dùng ưu tiên confirm entry, KHÔNG khuyến khích Limit chặn tàu.
- entry = giá tham chiếu dự kiến (thường là mép vùng hoặc giá đóng nến xác nhận); entry_zone = vùng chờ [thấp, cao]. SL theo cấu trúc + đệm ~0.2 ATR, KHÔNG nằm trong vùng OB/FVG; |entry−SL| ≤ 4×ATR. TP tại thanh khoản/OB/HVN đối diện, R:R TP1 ≥ ~1:2 nếu có thể.
- checklist: liệt kê các điều kiện của setup đó theo bộ kiến thức và cái nào ĐÃ đạt (ok=true) / CHƯA đạt (ok=false) dựa vào dữ liệu.
- Không có setup đạt chuẩn → setups=[] và nói rõ cần chờ gì. Tối đa 2 setup. Không bịa số; số là number thuần.
Viết tiếng Việt ngắn gọn, đúng thuật ngữ. CHỈ trả JSON:
{
 "bias": "tăng" | "giảm" | "đi ngang",
 "confidence": 0-100,
 "headline": "1 câu kết luận",
 "wyckoff_phase": "tích lũy/markup/phân phối/markdown/không rõ + lý do ngắn",
 "htf_context": "...", "trend_filter": "EMA200/ADX/EMA89 cho phép BUY hay SELL hay đứng ngoài",
 "volume": "...", "vsa": "đọc VSA các nến gần nhất (climax/upthrust/no supply/phân kỳ...)",
 "momentum": "...", "smc": "...", "liquidity": "thanh khoản ở đâu, đã bị quét chưa", "price_action": "...",
 "key_levels": { "support": [number], "resistance": [number] },
 "setups": [ { "setup_type": "...", "direction": "long" | "short", "label": "chính" | "phụ", "entry_zone": [number, number], "entry": number, "trigger": "điều kiện xác nhận cần thấy trước khi vào", "stop_loss": number, "take_profit": [number, number], "checklist": [ { "item": "...", "ok": true } ], "reason": "...", "invalidation": "...", "management": "dời BE/trailing/thoát sớm theo bộ kiến thức" } ],
 "wait_for": "...", "risk_note": "..."
}`;
  const payload = { symbol: symbol.toUpperCase() + "USDT", timeframe: tf, higherTimeframe: htf, ltf: summary, htf: htfSummary, candles };
  const res = await chat({ model: model || "gpt-4o", temperature: 0.2, response_format: { type: "json_object" }, messages: [{ role: "system", content: sys }, { role: "user", content: JSON.stringify(payload) }] }, key, "market");
  if (!res.ok) {
    let msg = res.status + "";
    try { const e = await res.json(); msg = e.error?.message || JSON.stringify(e); } catch {}
    throw new Error("OpenAI lỗi: " + msg);
  }
  const data = await res.json();
  let p;
  try { p = JSON.parse(data.choices?.[0]?.message?.content || "{}"); } catch { throw new Error("Không đọc được JSON từ AI."); }
  const num = (v) => { const x = Number(String(v ?? "").replace(/[^\d.\-e]/gi, "")); return isFinite(x) && x > 0 ? x : null; };
  const atrV = Number(summary?.volatility?.atr) || null;
  // Kiểm tra logic từng kịch bản (long: SL < entry < TP; short: ngược lại) + R:R + bộ lọc khoảng cách SL ≤ 4 ATR (theo EA)
  const setups = (Array.isArray(p.setups) ? p.setups : []).map((s) => {
    const dir = s.direction === "short" ? "short" : "long";
    const entry = num(s.entry), sl = num(s.stop_loss);
    const tps = (Array.isArray(s.take_profit) ? s.take_profit : [s.take_profit]).map(num).filter(Boolean);
    const ok = entry && sl && tps.length && (dir === "long" ? sl < entry && tps.every((t) => t > entry) : sl > entry && tps.every((t) => t < entry));
    const risk = entry && sl ? Math.abs(entry - sl) : 0;
    const slAtr = atrV && risk ? risk / atrV : null;
    const zone = Array.isArray(s.entry_zone) ? s.entry_zone.map(num).filter(Boolean).sort((a, b) => a - b) : [];
    const checklist = (Array.isArray(s.checklist) ? s.checklist : []).map((c) => ({ item: String(c.item || ""), ok: !!c.ok })).filter((c) => c.item);
    return { ...s, direction: dir, entry, stop_loss: sl, take_profit: tps, entry_zone: zone.length === 2 ? zone : null, checklist, valid: !!ok, slAtr, tooFar: slAtr != null && slAtr > 4, rr: tps.map((t) => (risk ? Math.abs(t - entry) / risk : null)) };
  });
  const arr = (v) => (Array.isArray(v) ? v.map(num).filter(Boolean) : []);
  return { ...p, confidence: Math.max(0, Math.min(100, Number(p.confidence) || 0)), key_levels: { support: arr(p.key_levels?.support), resistance: arr(p.key_levels?.resistance) }, setups, model: model || "gpt-4o", at: Date.now(), kb: true };
}
