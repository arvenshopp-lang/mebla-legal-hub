/**
 * مقبس شبكي خادمي لبروتوكولات البريد (SMTP/IMAP) — لا يُستورد من المتصفح أبداً.
 *
 * بيئة الإنتاج عامل حوسبة طرفية، فالاتصال يمر عبر `cloudflare:sockets`، وفي بيئة
 * التطوير (Node) يُستخدم `node:tls`. الشهادة تُتحقق دائماً؛ لا يوجد أي خيار
 * لتعطيل التحقق في هذه الطبقة.
 */

export type MailSocketOptions = {
  host: string;
  port: number;
  tls: boolean;
  /** مهلة كل عملية قراءة/اتصال (مللي ثانية). */
  timeoutMs?: number;
};

export type MailSocket = {
  /** سطر واحد منتهٍ بـ CRLF بدون الفاصل. */
  readLine: () => Promise<string>;
  /** عدد بايتات محدد (لقراءة literal في IMAP). */
  readExact: (count: number) => Promise<Uint8Array>;
  write: (data: string | Uint8Array) => Promise<void>;
  close: () => Promise<void>;
};

const DEFAULT_TIMEOUT = 20_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`mail_socket_timeout:${label}`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

type RawDuplex = {
  next: () => Promise<Uint8Array | null>;
  send: (bytes: Uint8Array) => Promise<void>;
  end: () => Promise<void>;
};

/** يمنع Vite من محاولة تحليل وحدة عامل الحوسبة الطرفية وقت البناء. */
async function importRuntime<T>(specifier: string): Promise<T> {
  return (await import(/* @vite-ignore */ specifier)) as T;
}

async function openWorkerdSocket(options: MailSocketOptions): Promise<RawDuplex | null> {
  try {
    const mod = await importRuntime<{
      connect: (
        address: { hostname: string; port: number },
        init?: { secureTransport?: string; allowHalfOpen?: boolean },
      ) => { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> };
    }>("cloudflare:sockets");
    if (typeof mod?.connect !== "function") return null;
    const socket = mod.connect(
      { hostname: options.host, port: options.port },
      { secureTransport: options.tls ? "on" : "off", allowHalfOpen: false },
    );
    const reader = socket.readable.getReader();
    const writer = socket.writable.getWriter();
    return {
      next: async () => {
        const { value, done } = await reader.read();
        return done ? null : (value ?? null);
      },
      send: async (bytes) => {
        await writer.write(bytes);
      },
      end: async () => {
        try {
          await writer.close();
        } catch {
          /* المقبس أُغلق من الطرف الآخر */
        }
        try {
          reader.releaseLock();
        } catch {
          /* لا شيء */
        }
      },
    };
  } catch {
    return null;
  }
}

async function openNodeSocket(options: MailSocketOptions): Promise<RawDuplex> {
  const tls = await importRuntime<typeof import("node:tls")>("node:tls");
  const net = await importRuntime<typeof import("node:net")>("node:net");

  const chunks: Uint8Array[] = [];
  let waiter: ((value: Uint8Array | null) => void) | null = null;
  let closed = false;
  let failure: Error | null = null;

  const socket = options.tls
    ? tls.connect({ host: options.host, port: options.port, servername: options.host })
    : net.connect({ host: options.host, port: options.port });

  socket.on("data", (chunk: Buffer) => {
    const bytes = new Uint8Array(chunk);
    if (waiter) {
      const resolve = waiter;
      waiter = null;
      resolve(bytes);
    } else chunks.push(bytes);
  });
  const finish = (error?: Error) => {
    closed = true;
    if (error) failure = error;
    if (waiter) {
      const resolve = waiter;
      waiter = null;
      resolve(null);
    }
  };
  socket.on("end", () => finish());
  socket.on("close", () => finish());
  socket.on("error", (error: Error) => finish(error));

  await withTimeout(
    new Promise<void>((resolve, reject) => {
      socket.once(options.tls ? "secureConnect" : "connect", () => resolve());
      socket.once("error", (error: Error) => reject(error));
    }),
    options.timeoutMs ?? DEFAULT_TIMEOUT,
    "connect",
  );

  return {
    next: async () => {
      const buffered = chunks.shift();
      if (buffered) return buffered;
      if (failure) throw failure;
      if (closed) return null;
      return new Promise<Uint8Array | null>((resolve) => {
        waiter = resolve;
      });
    },
    send: async (bytes) => {
      await new Promise<void>((resolve, reject) => {
        socket.write(bytes, (error) => (error ? reject(error) : resolve()));
      });
    },
    end: async () => {
      socket.destroy();
    },
  };
}

/** يفتح مقبساً مع قارئ مُخزَّن يفهم الأسطر و literals. */
export async function connectMailSocket(options: MailSocketOptions): Promise<MailSocket> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT;
  const duplex = (await openWorkerdSocket(options)) ?? (await openNodeSocket(options));

  let buffer = new Uint8Array(0);
  let eof = false;

  const append = (chunk: Uint8Array) => {
    const merged = new Uint8Array(buffer.length + chunk.length);
    merged.set(buffer, 0);
    merged.set(chunk, buffer.length);
    buffer = merged;
  };

  const pull = async (): Promise<boolean> => {
    if (eof) return false;
    const chunk = await withTimeout(duplex.next(), timeoutMs, "read");
    if (chunk === null) {
      eof = true;
      return false;
    }
    append(chunk);
    return true;
  };

  const take = (count: number): Uint8Array => {
    const slice = buffer.slice(0, count);
    buffer = buffer.slice(count);
    return slice;
  };

  const decoder = new TextDecoder("utf-8", { fatal: false });

  return {
    readLine: async () => {
      for (;;) {
        const index = buffer.indexOf(0x0a);
        if (index >= 0) {
          const raw = take(index + 1);
          const end =
            raw.length >= 2 && raw[raw.length - 2] === 0x0d ? raw.length - 2 : raw.length - 1;
          return decoder.decode(raw.slice(0, end));
        }
        const more = await pull();
        if (!more) {
          if (buffer.length === 0) throw new Error("mail_socket_closed");
          const rest = take(buffer.length);
          return decoder.decode(rest);
        }
      }
    },
    readExact: async (count: number) => {
      while (buffer.length < count) {
        const more = await pull();
        if (!more) throw new Error("mail_socket_closed");
      }
      return take(count);
    },
    write: async (data) => {
      const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
      await withTimeout(duplex.send(bytes), timeoutMs, "write");
    },
    close: async () => {
      await duplex.end();
    },
  };
}
