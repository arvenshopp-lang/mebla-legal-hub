/**
 * تشفير المسودات المحلية — متصفح فقط.
 *
 * المفتاح مفتاح AES-256-GCM غير قابل للاستخراج (non-extractable) يُحفظ داخل
 * IndexedDB، فلا يمكن لأي سكربت قراءة المفتاح نصاً، والنص المشفّر فقط هو ما
 * يُخزَّن في localStorage. لا تُحفظ كلمات المرور أو رموز التحقق إطلاقاً.
 */

const DB_NAME = "mehla-secure-drafts";
const STORE = "keys";
const KEY_ID = "draft-key-v1";

function hasCrypto(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof indexedDB !== "undefined" &&
    typeof crypto !== "undefined" &&
    typeof crypto.subtle !== "undefined"
  );
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_unavailable"));
  });
}

function readKey(db: IDBDatabase): Promise<CryptoKey | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(KEY_ID);
    request.onsuccess = () => resolve(request.result as CryptoKey | undefined);
    request.onerror = () => reject(request.error ?? new Error("key_read_failed"));
  });
}

function writeKey(db: IDBDatabase, key: CryptoKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(key, KEY_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("key_write_failed"));
  });
}

let keyPromise: Promise<CryptoKey | null> | null = null;

/** مفتاح التشفير الخاص بهذا المتصفح، أو null عند تعذّر التشفير. */
export function getDraftKey(): Promise<CryptoKey | null> {
  if (!hasCrypto()) return Promise.resolve(null);
  if (!keyPromise) {
    keyPromise = (async () => {
      try {
        const db = await openDb();
        const existing = await readKey(db);
        if (existing) return existing;
        const created = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
          "encrypt",
          "decrypt",
        ]);
        await writeKey(db, created);
        return created;
      } catch {
        return null;
      }
    })();
  }
  return keyPromise;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** يشفّر أي قيمة JSON. يرجع null عند تعذّر التشفير حتى لا تُحفظ بيانات صريحة. */
export async function encryptJson(value: unknown): Promise<string | null> {
  const key = await getDraftKey();
  if (!key) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = new TextEncoder().encode(JSON.stringify(value));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, payload as BufferSource),
  );
  const merged = new Uint8Array(iv.length + cipher.length);
  merged.set(iv, 0);
  merged.set(cipher, iv.length);
  return toBase64(merged);
}

export async function decryptJson<T>(serialized: string): Promise<T | null> {
  const key = await getDraftKey();
  if (!key) return null;
  try {
    const merged = fromBase64(serialized);
    const iv = merged.slice(0, 12);
    const cipher = merged.slice(12);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      cipher as BufferSource,
    );
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    return null;
  }
}