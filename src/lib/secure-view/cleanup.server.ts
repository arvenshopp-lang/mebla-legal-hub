import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Retention / janitor pass for the secure document pipeline.
 *
 * Watermarked copies are streamed on demand and are never persisted, so the
 * artefacts that DO accumulate are:
 *   1. expired / revoked / exhausted access tickets (`document_access_tokens`)
 *   2. any temporary watermark render written under the reserved tmp prefix
 *   3. orphaned client-upload objects whose `documents` row never materialised
 *
 * Everything here is idempotent and safe to run repeatedly.
 */

/** Reserved prefix for transient watermark renders. Nothing durable lives here. */
export const WATERMARK_TMP_PREFIX = "tmp/watermarked";

/** Grace window before a ticket row is purged (keeps the audit trail readable). */
const TICKET_RETENTION_HOURS = 24;

/** Grace window before an unreferenced client upload is considered abandoned. */
const ORPHAN_UPLOAD_RETENTION_HOURS = 24;

const STORAGE_BUCKET = "documents";
const PAGE_SIZE = 1000;
/** Storage rejects oversized batches; remove in chunks. */
const REMOVE_CHUNK = 100;

export type CleanupReport = {
  expiredTickets: number;
  tmpRenders: number;
  orphanUploads: number;
  ranAt: string;
};

type StorageEntry = { name: string; id: string | null; created_at?: string | null };

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

async function listFolder(prefix: string): Promise<StorageEntry[]> {
  const entries: StorageEntry[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .list(prefix, { limit: PAGE_SIZE, offset });
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    entries.push(...(data as StorageEntry[]));
    if (data.length < PAGE_SIZE) break;
  }
  return entries;
}

/** Depth-limited recursive walk; folders come back with a null `id`. */
async function walkFiles(prefix: string, depth: number): Promise<StorageEntry[]> {
  const entries = await listFolder(prefix);
  const files: StorageEntry[] = [];
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id) {
      files.push({ ...entry, name: path });
    } else if (depth > 0) {
      files.push(...(await walkFiles(path, depth - 1)));
    }
  }
  return files;
}

async function removePaths(paths: string[]): Promise<number> {
  let removed = 0;
  for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
    const chunk = paths.slice(i, i + REMOVE_CHUNK);
    const { error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).remove(chunk);
    if (error) throw new Error(error.message);
    removed += chunk.length;
  }
  return removed;
}

/** Drops tickets that can no longer grant access, past the audit grace window. */
async function purgeExpiredTickets(): Promise<number> {
  const cutoff = hoursAgo(TICKET_RETENTION_HOURS).toISOString();
  const { data, error } = await supabaseAdmin
    .from("document_access_tokens")
    .delete()
    .lt("expires_at", cutoff)
    .select("id");
  if (error) throw new Error(error.message);

  const { data: revoked, error: revokedError } = await supabaseAdmin
    .from("document_access_tokens")
    .delete()
    .not("revoked_at", "is", null)
    .lt("revoked_at", cutoff)
    .select("id");
  if (revokedError) throw new Error(revokedError.message);

  return (data?.length ?? 0) + (revoked?.length ?? 0);
}

/** Deletes transient watermark renders older than the ticket TTL window. */
async function purgeTmpRenders(): Promise<number> {
  const cutoff = hoursAgo(1).getTime();
  const files = await walkFiles(WATERMARK_TMP_PREFIX, 3);
  const stale = files
    .filter((f) => !f.created_at || new Date(f.created_at).getTime() < cutoff)
    .map((f) => f.name);
  return stale.length ? removePaths(stale) : 0;
}

/** Deletes client-upload objects that never got a `documents` row. */
async function purgeOrphanUploads(): Promise<number> {
  const cutoff = hoursAgo(ORPHAN_UPLOAD_RETENTION_HOURS).getTime();
  const orgFolders = (await listFolder("")).filter((entry) => !entry.id);

  const candidates: string[] = [];
  for (const org of orgFolders) {
    const files = await walkFiles(`${org.name}/client-uploads`, 2);
    for (const file of files) {
      if (file.created_at && new Date(file.created_at).getTime() >= cutoff) continue;
      candidates.push(file.name);
    }
  }
  if (!candidates.length) return 0;

  const referenced = new Set<string>();
  for (let i = 0; i < candidates.length; i += REMOVE_CHUNK) {
    const chunk = candidates.slice(i, i + REMOVE_CHUNK);
    const { data, error } = await supabaseAdmin
      .from("documents")
      .select("file_path")
      .in("file_path", chunk);
    if (error) throw new Error(error.message);
    data?.forEach((row) => referenced.add(row.file_path));
  }

  const orphans = candidates.filter((path) => !referenced.has(path));
  return orphans.length ? removePaths(orphans) : 0;
}

export async function runSecureArtifactCleanup(): Promise<CleanupReport> {
  const [expiredTickets, tmpRenders, orphanUploads] = [
    await purgeExpiredTickets(),
    await purgeTmpRenders(),
    await purgeOrphanUploads(),
  ];
  return { expiredTickets, tmpRenders, orphanUploads, ranAt: new Date().toISOString() };
}
