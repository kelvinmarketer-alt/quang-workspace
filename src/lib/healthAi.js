// Chụp ảnh món ăn → AI ước lượng calo (qua hàm qws-ai của app: khoá nằm ở máy chủ, có ghi chi phí ở Cài đặt → Chi phí AI).
import { supabase } from "./supabase.js";
import { shrinkImage } from "./healthPhotos.js";

const PROMPT = `Bạn là chuyên gia dinh dưỡng món Việt. Nhìn ảnh bữa ăn, liệt kê TỪNG món thấy được và ước lượng cho đúng lượng trong ảnh.
Chỉ trả JSON: {"items":[{"name":"tên món tiếng Việt","unit":"lượng ước tính, vd 1 bát / 150 g","kcal":số,"p":gam đạm,"c":gam tinh bột,"f":gam béo}],"note":"1 câu ngắn nếu ảnh khó đoán, không thì chuỗi rỗng"}.
Không thấy đồ ăn thì trả {"items":[],"note":"Không thấy món ăn trong ảnh"}. Số là số nguyên, ước lượng thực tế, không phóng đại.`;

export function parseFoodJson(text) {
  let o; try { o = JSON.parse(String(text || "").replace(/^```(json)?|```$/g, "").trim()); } catch { return { items: [], note: "AI trả lời không đọc được, thử chụp lại" }; }
  const num = (v) => Math.max(0, Math.round(Number(v) || 0));
  const items = (Array.isArray(o?.items) ? o.items : []).map((x) => ({ name: String(x.name || "").slice(0, 60), unit: String(x.unit || "1 phần").slice(0, 30), kcal: Math.min(3000, num(x.kcal)), p: num(x.p), c: num(x.c), f: num(x.f) })).filter((x) => x.name && x.kcal > 0).slice(0, 10);
  return { items, note: String(o?.note || "").slice(0, 160) };
}

export async function foodFromPhoto(file) {
  const dataUrl = await shrinkImage(file, 768, 0.7);
  const body = { model: "gpt-4o-mini", max_tokens: 500, temperature: 0.2, response_format: { type: "json_object" }, messages: [{ role: "system", content: PROMPT }, { role: "user", content: [{ type: "text", text: "Ước lượng bữa ăn trong ảnh." }, { type: "image_url", image_url: { url: dataUrl, detail: "low" } }] }] };
  const { data, error } = await supabase.functions.invoke("qws-ai", { body: { feature: "suc-khoe-mon-an", body } });
  if (error || data?.error) {
    let msg = data?.error; if (error) { try { msg = (await error.context?.json?.())?.error; } catch { /* bỏ qua */ } }
    throw new Error(msg || "Chưa gọi được AI. Kiểm tra mạng rồi thử lại.");
  }
  return parseFoodJson(data?.choices?.[0]?.message?.content);
}
