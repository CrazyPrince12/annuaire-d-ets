/** Découpe le DDL du projet (instructions simples, sans blocs PL/pgSQL ni chaînes multilignes). */
export function schemaStatements(sql) {
  return sql.replace(/^\s*--[^\n]*/gm, "").split(/;[ \t]*(?:\r?\n|$)/)
    .map((statement) => statement.trim()).filter(Boolean).map((statement) => [statement]);
}
