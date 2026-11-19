/** Pilotes de production partagés par l'application et les outils de déploiement. */
export class DatabaseUnavailableError extends Error {
  constructor(reason, { retryable = false, cause } = {}) {
    super(`Base de données indisponible (${reason}).`, { cause });
    this.code = "db_unavailable";
    this.reason = reason;
    this.retryable = retryable;
  }
}

export function databaseUrl() {
  // Les tableaux de bord ne retirent pas forcément les guillemets d'un .env copié-collé.
  return [process.env.DATABASE_URL, process.env.POSTGRES_URL, process.env.POSTGRES_URL_NON_POOLING]
    .map((value) => value?.trim().replace(/^(["'])(.*)\1$/, "$2").trim())
    .find(Boolean) || "";
}

function parseDatabaseUrl(url) {
  try {
    const parsed = new URL(url);
    if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.username || !parsed.hostname || parsed.pathname.length < 2) {
      throw new Error();
    }
    [parsed.username, parsed.password, parsed.pathname].forEach(decodeURIComponent);
    return parsed;
  } catch {
    throw new DatabaseUnavailableError("invalid_url");
  }
}

const isNeon = (parsed) => /\.neon\.tech$/i.test(parsed.hostname);

export function resolveDatabase(url, transport = process.env.DATABASE_TRANSPORT) {
  const parsed = parseDatabaseUrl(url);
  if (transport && !["auto", "tcp"].includes(transport.trim().toLowerCase())) {
    throw new DatabaseUnavailableError("invalid_transport");
  }
  return isNeon(parsed) && transport?.trim().toLowerCase() !== "tcp" ? "neon" : "postgres";
}

export function classifyDatabaseError(error) {
  if (error instanceof DatabaseUnavailableError) return error;
  const code = typeof error?.code === "string" ? error.code : error?.sourceError?.cause?.code;
  const message = error?.message || "";
  const asUnavailable = (reason, retryable) => new DatabaseUnavailableError(reason, { retryable, cause: error });
  if (code === "42P01" || code === "42703" || code === "3F000") return asUnavailable("schema_missing");
  if (code === "42501") return asUnavailable("permissions");
  if (code?.startsWith("28") || code === "3D000" || /SASL:.*password|password authentication failed/i.test(message)) {
    return asUnavailable("credentials");
  }
  if (code && /^(CERT_|SELF_SIGNED|DEPTH_ZERO|UNABLE_TO_VERIFY|ERR_TLS)/.test(code)) return asUnavailable("tls");
  if (code === "57014" || /statement timeout|^Query read timeout/i.test(message)) return asUnavailable("query_timeout");
  if ((code && /^(08|53|57P0|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|ECONN|EHOST|ENET|EPIPE)/.test(code)) ||
      error?.sourceError || error?.name === "TimeoutError" ||
      /timeout|connection terminated|(?:error|failed) connecting to database|failed to connect to database|endpoint is disabled|^Server error \(HTTP status (429|5\d\d)\)/i.test(message)) {
    return asUnavailable("connection", true);
  }
  return error;
}

async function createPostgresDriver(url, timeoutMs) {
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: url,
    max: process.env.VERCEL ? 4 : 8,
    connectionTimeoutMillis: Math.min(timeoutMs, 4500),
    statement_timeout: Math.max(1, timeoutMs - 500),
    query_timeout: timeoutMs,
    idleTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });
  pool.on("error", (error) => console.warn("[db] Connexion inactive interrompue", classifyDatabaseError(error).reason || "postgres"));
  const query = async (text, params = []) => (await pool.query(text, params)).rows;
  return {
    mode: "postgres",
    transport: "postgres-tcp",
    query,
    read: query,
    readBatch: (statements) => Promise.all(statements.map(([text, params]) => query(text, params))),
    async batch(statements) {
      const client = await pool.connect();
      let failure;
      try {
        await client.query("BEGIN");
        const results = [];
        for (const [text, params = []] of statements) results.push((await client.query(text, params)).rows);
        await client.query("COMMIT");
        return results;
      } catch (error) {
        failure = error;
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release(failure);
      }
    },
    close: () => pool.end(),
  };
}

/** Une lecture peut changer de transport, jamais une écriture déjà envoyée. */
export function withNeonReadFallback(http, makeTcp) {
  let tcpPromise;
  let tcp;
  let tcpUntil = 0;
  let retryTcpAt = 0;
  const active = () => (Date.now() < tcpUntil ? tcp : http);

  function tryTcp() {
    if (Date.now() < tcpUntil) return tcp;
    if (Date.now() < retryTcpAt) return null;
    tcpPromise ??= (async () => {
      tcp ??= await makeTcp();
      await tcp.read("SELECT 1");
      tcpUntil = Date.now() + 60_000;
      console.warn("[db] Neon HTTP indisponible ; connexion PostgreSQL TLS rétablie.");
      return tcp;
    })().catch(() => {
      // Pas de tempête de connexions si les deux chemins sont indisponibles.
      retryTcpAt = Date.now() + 15_000;
      return null;
    }).finally(() => { tcpPromise = null; });
    return tcpPromise;
  }

  async function read(method, args) {
    const driver = active();
    try {
      return await driver[method](...args);
    } catch (error) {
      const safe = classifyDatabaseError(error);
      if (safe.reason !== "connection") throw safe;
      if (driver === tcp) {
        tcpUntil = 0;
        retryTcpAt = Date.now() + 15_000;
        return http[method](...args);
      }
      const fallback = await tryTcp();
      if (!fallback) throw safe;
      return fallback[method](...args);
    }
  }

  return {
    mode: "neon",
    get transport() { return active().transport; },
    read: (...args) => read("read", args),
    readBatch: (...args) => read("readBatch", args),
    query: (...args) => active().query(...args),
    batch: (...args) => active().batch(...args),
    close: async () => { await tcpPromise; await tcp?.close(); },
  };
}

export async function createRemoteDriver(url, { timeoutMs = 8000 } = {}) {
  const mode = resolveDatabase(url);
  const parsed = parseDatabaseUrl(url);
  if (isNeon(parsed)) parsed.searchParams.set("sslmode", "verify-full");
  if (mode === "postgres") return createPostgresDriver(parsed.href, timeoutMs);

  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);
  const options = () => ({ fetchOptions: { signal: AbortSignal.timeout(timeoutMs) } });
  const query = (text, params = []) => sql.query(text, params, options());
  const batch = (statements, extra = {}) => sql.transaction(
    statements.map(([text, params = []]) => sql.query(text, params)), { ...options(), ...extra }
  );
  const http = { transport: "neon-http", query, batch, read: query, readBatch: (statements) => batch(statements, { readOnly: true }) };
  return withNeonReadFallback(http, () => createPostgresDriver(parsed.href, timeoutMs));
}
