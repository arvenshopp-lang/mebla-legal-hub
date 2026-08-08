const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
const db = supabaseAdmin as never as any; // eslint-disable-line
const { syncAllMailboxes } = await import("@/lib/email/transport/hostinger.server");
const { data: boxes } = await db.from("email_mailboxes").select("address, type, sync_enabled, receive_enabled").order("address");
console.log("mailboxes:", JSON.stringify(boxes));
const outcomes = await syncAllMailboxes(db, "manual");
console.log("sync:", JSON.stringify(outcomes));
