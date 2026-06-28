import { createClient } from "@supabase/supabase-js";

// Khoá publishable (public) — an toàn để lộ; dữ liệu được bảo vệ bằng RLS + Auth.
const SUPABASE_URL = "https://dbfffwtnxhytcoczhxhf.supabase.co";
const SUPABASE_KEY = "sb_publishable_TaKPhmv9_ig8Z7rl-PZupw_AnzYwFQo";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export const WORKSPACE_TABLE = "qws_workspaces";
