/**
 * نوع عميل قاعدة البيانات المستخدم في الوحدات الخادمية.
 * يمنع تسرّب `any` ويمنح فحص أنواع كامل على الجداول المولّدة.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type Db = SupabaseClient<Database>;
