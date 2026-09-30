// Nhận diện loại tài nguyên online từ link + icon/màu tương ứng
import { FileSpreadsheet, FileText, Presentation, HardDrive, Folder, Youtube, Facebook, Palette, BookOpen, Globe, Image, Link2 } from "lucide-react";

export const RES_TYPES = {
  sheet: { label: "Google Sheet", icon: FileSpreadsheet, tone: "emerald" },
  doc: { label: "Google Doc", icon: FileText, tone: "sky" },
  slide: { label: "Slide", icon: Presentation, tone: "amber" },
  drive: { label: "Google Drive", icon: HardDrive, tone: "indigo" },
  figma: { label: "Figma", icon: Palette, tone: "violet" },
  canva: { label: "Canva", icon: Palette, tone: "teal" },
  notion: { label: "Notion", icon: BookOpen, tone: "slate" },
  youtube: { label: "YouTube", icon: Youtube, tone: "rose" },
  facebook: { label: "Facebook", icon: Facebook, tone: "sky" },
  image: { label: "Ảnh", icon: Image, tone: "pink" },
  folder: { label: "Thư mục", icon: Folder, tone: "amber" },
  web: { label: "Web / Khác", icon: Globe, tone: "slate" },
};
export const RES_TYPE_KEYS = Object.keys(RES_TYPES);

export function hostOf(url) {
  try { return new URL(/^https?:\/\//i.test(url) ? url : "https://" + url).hostname.replace(/^www\./, ""); }
  catch { return ""; }
}

export function detectResType(url) {
  const u = (url || "").toLowerCase();
  const has = (s) => u.includes(s);
  if (has("docs.google.com/spreadsheets") || has("/spreadsheets/")) return "sheet";
  if (has("docs.google.com/document") || has("/document/d/")) return "doc";
  if (has("docs.google.com/presentation") || has("/presentation/")) return "slide";
  if (has("drive.google.com")) return has("/folders/") ? "folder" : "drive";
  if (has("figma.com")) return "figma";
  if (has("canva.com")) return "canva";
  if (has("notion.so") || has("notion.site")) return "notion";
  if (has("youtube.com") || has("youtu.be")) return "youtube";
  if (has("facebook.com") || has("fb.com") || has("fb.watch")) return "facebook";
  if (has("dropbox.com") || has("mega.nz") || has("mega.io") || has("mediafire") || has("1drv.ms") || has("onedrive")) return "folder";
  if (/\.(png|jpe?g|gif|webp|svg|heic)(\?|$)/i.test(u)) return "image";
  return "web";
}

// Gợi ý tiêu đề từ link (khi user dán mà chưa đặt tên)
export function guessTitle(url) {
  const h = hostOf(url);
  const t = RES_TYPES[detectResType(url)]?.label || "Link";
  return h ? `${t} · ${h}` : t;
}
