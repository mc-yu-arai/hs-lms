/**
 * supabase-js の PostgrestQueryBuilder をごく簡単に模した、テスト専用のインメモリDB。
 * courseRepository.ts が使う select/insert/update/upsert/delete + eq/in/ilike/order +
 * single/maybeSingle/count(head) の組み合わせだけをサポートする（汎用ORMではない）。
 */
type Row = Record<string, any>;

function genId(): string {
  return "id-" + Math.random().toString(36).slice(2, 10);
}

function makeQueryBuilder(tableName: string, store: Map<string, Row[]>) {
  const filters: Array<(row: Row) => boolean> = [];
  let mode: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  let payload: Row[] | Row | null = null;
  let orderKey: string | null = null;
  let orderAsc = true;
  let singleMode: "single" | "maybeSingle" | null = null;
  let onConflictKey: string | null = null;
  let countOnly = false;
  let limitCount: number | null = null;

  function table(): Row[] {
    if (!store.has(tableName)) store.set(tableName, []);
    return store.get(tableName)!;
  }

  async function exec(): Promise<{ data: any; error: any; count?: number }> {
    if (mode === "select") {
      let rows = table().filter((r) => filters.every((f) => f(r)));
      if (orderKey) {
        const key = orderKey;
        rows = [...rows].sort((a, b) => {
          if (a[key] === b[key]) return 0;
          return (a[key] > b[key] ? 1 : -1) * (orderAsc ? 1 : -1);
        });
      }
      if (countOnly) return { data: null, error: null, count: rows.length };
      if (limitCount !== null) rows = rows.slice(0, limitCount);
      if (singleMode === "single") return { data: rows[0] ?? null, error: rows[0] ? null : { message: "no rows found" } };
      if (singleMode === "maybeSingle") return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    }

    if (mode === "insert") {
      const rowsToInsert = Array.isArray(payload) ? payload : [payload as Row];
      const inserted = rowsToInsert.map((row) => {
        const full: Row = { created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...row, id: row.id ?? genId() };
        table().push(full);
        return full;
      });
      if (singleMode) return { data: inserted[0], error: null };
      return { data: inserted, error: null };
    }

    if (mode === "update") {
      const matched = table().filter((r) => filters.every((f) => f(r)));
      matched.forEach((r) => Object.assign(r, payload));
      if (singleMode === "single") return { data: matched[0] ?? null, error: matched[0] ? null : { message: "no rows found" } };
      if (singleMode === "maybeSingle") return { data: matched[0] ?? null, error: null };
      return { data: matched, error: null };
    }

    if (mode === "upsert") {
      const keys = (onConflictKey ?? "id").split(",");
      const p = payload as Row;
      const existing = table().find((r) => keys.every((k) => r[k] === p[k]));
      if (existing) {
        Object.assign(existing, p);
        return { data: existing, error: null };
      }
      const full: Row = { id: p.id ?? genId(), ...p };
      table().push(full);
      return { data: full, error: null };
    }

    if (mode === "delete") {
      const remaining = table().filter((r) => !filters.every((f) => f(r)));
      const t = table();
      t.length = 0;
      t.push(...remaining);
      return { data: null, error: null };
    }

    return { data: null, error: null };
  }

  const builder: any = {
    select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) countOnly = true;
      return builder;
    },
    insert: (rows: Row | Row[]) => {
      mode = "insert";
      payload = rows;
      return builder;
    },
    update: (patch: Row) => {
      mode = "update";
      payload = patch;
      return builder;
    },
    upsert: (row: Row, opts?: { onConflict?: string }) => {
      mode = "upsert";
      payload = row;
      onConflictKey = opts?.onConflict ?? null;
      return builder;
    },
    delete: () => {
      mode = "delete";
      return builder;
    },
    eq: (col: string, val: unknown) => {
      filters.push((row) => row[col] === val);
      return builder;
    },
    in: (col: string, vals: unknown[]) => {
      filters.push((row) => vals.includes(row[col]));
      return builder;
    },
    ilike: (col: string, pattern: string) => {
      const re = new RegExp(pattern.replace(/%/g, ".*"), "i");
      filters.push((row) => re.test(String(row[col] ?? "")));
      return builder;
    },
    order: (col: string, opts?: { ascending?: boolean }) => {
      orderKey = col;
      orderAsc = opts?.ascending !== false;
      return builder;
    },
    limit: (n: number) => {
      limitCount = n;
      return builder;
    },
    single: () => {
      singleMode = "single";
      return exec();
    },
    maybeSingle: () => {
      singleMode = "maybeSingle";
      return exec();
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => exec().then(resolve, reject),
  };

  return builder;
}

export function createFakeDb() {
  const store = new Map<string, Row[]>();
  return {
    store,
    from: (tableName: string) => makeQueryBuilder(tableName, store),
  };
}

export type FakeDb = ReturnType<typeof createFakeDb>;
