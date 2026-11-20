// Ảnh chụp cơ thể theo tuần — CHỈ lưu trong trình duyệt của máy này (IndexedDB), không gửi lên máy chủ:
// ảnh riêng tư + kho tệp Supabase đang đầy. Đổi máy / xoá dữ liệu trình duyệt thì ảnh không còn.
const DB = "qws-health-photos", STORE = "photos";
function open() {
  return new Promise((ok, fail) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error);
  });
}
const tx = async (mode, fn) => { const db = await open(); return new Promise((ok, fail) => { const t = db.transaction(STORE, mode), q = fn(t.objectStore(STORE)); t.oncomplete = () => ok(q?.result); t.onerror = () => fail(t.error); }); };

// Thu nhỏ ảnh về cạnh dài tối đa `max` px, trả data URL JPEG (dùng cho cả ảnh cơ thể và ảnh món ăn gửi AI)
export function shrinkImage(file, max = 1000, quality = 0.8) {
  return new Promise((ok, fail) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); ok(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); fail(new Error("Không đọc được ảnh")); };
    img.src = url;
  });
}
export async function addPhoto(file, dayKey, uid) {
  const data = await shrinkImage(file, 1000, 0.8);
  const row = { id: `${uid}:${dayKey}:${Date.now()}`, uid, day: dayKey, data };
  await tx("readwrite", (s) => s.put(row));
  return row;
}
export async function listPhotos(uid) { const all = (await tx("readonly", (s) => s.getAll())) || []; return all.filter((p) => p.uid === uid).sort((a, b) => (a.id < b.id ? -1 : 1)); }
export const delPhoto = (id) => tx("readwrite", (s) => s.delete(id));
export const photosSupported = () => typeof indexedDB !== "undefined";
