// Gộp 3 chiều (base = bản cloud lần trước, local = bản trong máy, remote = bản cloud mới nhất).
// Dùng khi 2 nơi (2 thiết bị / chủ + tài khoản phụ) cùng sửa: giữ thay đổi của CẢ HAI thay vì bản sau đè bản trước.
// - Bên nào không đổi so với base → lấy bên kia.
// - Mảng bản ghi có id → gộp theo từng id (thêm/sửa/xoá của mỗi bên đều giữ; sửa thắng xoá).
// - Object → gộp từng trường. Cùng sửa 1 trường → bản trong máy thắng.

export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a).filter((k) => a[k] !== undefined);
  const kb = Object.keys(b).filter((k) => b[k] !== undefined);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!deepEqual(a[k], b[k])) return false;
  return true;
}

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const isIdArray = (v) => Array.isArray(v) && v.every((x) => isObj(x) && x.id != null);

function mergeIdArrays(base, local, remote) {
  const bm = new Map((base || []).map((x) => [x.id, x]));
  const lm = new Map(local.map((x) => [x.id, x]));
  const rm = new Map(remote.map((x) => [x.id, x]));
  const out = [];
  // Bản ghi mới chỉ có ở remote (nơi khác vừa thêm) → đặt lên đầu như cách app thêm mới
  for (const r of remote) if (!bm.has(r.id) && !lm.has(r.id)) out.push(r);
  for (const l of local) {
    const b = bm.get(l.id), r = rm.get(l.id);
    if (!b) { out.push(r ? merge3(undefined, l, r) : l); continue; } // local thêm mới (hoặc cả 2 cùng thêm)
    if (!r) { if (!deepEqual(l, b)) out.push(l); continue; } // remote đã xoá: local có sửa thì giữ, không thì xoá theo
    out.push(merge3(b, l, r));
  }
  // remote có sửa bản ghi mà local đã xoá → giữ bản remote (sửa thắng xoá)
  for (const r of remote) {
    const b = bm.get(r.id);
    if (b && !lm.has(r.id) && !deepEqual(r, b)) out.push(r);
  }
  return out;
}

export function merge3(base, local, remote) {
  if (deepEqual(local, remote)) return local;
  if (base !== undefined && deepEqual(local, base)) return remote;
  if (base !== undefined && deepEqual(remote, base)) return local;
  if (isIdArray(local) && isIdArray(remote) && (base === undefined || isIdArray(base))) return mergeIdArrays(base, local, remote);
  if (isObj(local) && isObj(remote)) {
    const b = isObj(base) ? base : {};
    const out = {};
    for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) {
      if (!(k in local)) { if (!(k in b) || !deepEqual(remote[k], b[k])) out[k] = remote[k]; continue; }
      if (!(k in remote)) { if (!(k in b) || !deepEqual(local[k], b[k])) out[k] = local[k]; continue; }
      out[k] = merge3(b[k], local[k], remote[k]);
    }
    return out;
  }
  return local;
}
