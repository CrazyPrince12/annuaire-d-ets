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
  return process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim() || "";
}

export function resolveDatabase(url) {
  let parsed;
  try {
    parsed = new URL(url);
    if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.username || !parsed.hostname || parsed.pathname.length < 2) {
      throw new Error();
    }
    [parsed.username, parsed.password, parsed.pathname].forEach(decodeURIComponent);
    return /\.neon\.tech$/i.test(parsed.hostname) ? "neon" : "postgres";
  } catch {
    throw new DatabaseUnavailableError("invalid_url");
  }
}

export function classifyDatabaseError(error) {
  if (error instanceof DatabaseUnavailableError) return error;
  const code = typeof error?.code === "string" ? error.code : error?.sourceError?.cause?.code;
  const asUnavailable = (reason, retryable) => new DatabaseUnavailableError(reason, { retryable, cause: error });
  if (code === "42P01" || code === "42703" || code === "3F000") return asUnavailable("schema_missing");
  if (code === "42501") return asUnavailable("permissions");
  if (code?.startsWith("28") || code === "3D000") return asUnavailable("credentials");
  if (code && /^(08|53|57P0|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|ECONN|EHOST|ENET|EPIPE)/.test(code)) {
    return asUnavailable("connection", true);
  }
  if (code && /^(CERT_|SELF_SIGNED|DEPTH_ZERO|UNABLE_TO_VERIFY|ERR_TLS)/.test(code)) return asUnavailable("tls");
  if (error?.sourceError || error?.name === "TimeoutError" || code === "57014" ||
      /timeout|connection terminated|error connecting to database|endpoint is disabled|^Server error \(HTTP status (429|5\d\d)\)/i.test(error?.message || "")) {
    return asUnavailable("connection", true);
  }
  return error;
}

export async function createRemoteDriver(url, { timeoutMs = 5500 } = {}) {
  const mode = resolveDatabase(url);
  if (mode === "neon") {
    const { neon } = await import("@neondatabase/serverless");
    let sql;
    try { sql = neon(url); } catch (cause) { throw new DatabaseUnavailableError("invalid_url", { cause }); }
    const options = () => ({ fetchOptions: { signal: AbortSignal.timeout(timeoutMs) } });
    return {
      mode,
      query: (text, params = []) => sql.query(text, params, options()),
      batch: (statements) => sql.transaction(statements.map(([text, params = []]) => sql.query(text, params)), options()),
      close: async () => {},
    };
  }
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: url,
    max: process.env.VERCEL ? 4 : 8,
    connectionTimeoutMillis: 3500,
    statement_timeout: timeoutMs - 500,
    query_timeout: timeoutMs,
    idleTimeoutMillis: 10000,
    allowExitOnIdle: true,
  });
  pool.on("error", (error) => console.warn("[db] Connexion inactive interrompue", classifyDatabaseError(error).reason || "postgres"));
  return {
    mode,
    query: async (text, params = []) => (await pool.query(text, params)).rows,
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
