/**
 * supabase-js の GoTrueClient が PKCE code_verifier / state を書き込む先として渡す
 * インメモリのストレージ実装。ブラウザのlocalStorageに相当するものがNode(サーバー)側には
 * ないため、ここで肩代わりする。中身をdump/reseedできるようにして、
 * /auth/oauth/google (開始) と /auth/oauth/google/callback (受け口) という
 * 別々のHTTPリクエスト間で値を引き継げるようにする（実際の引き継ぎはCookie経由）。
 */
export interface CapturingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  dump(): Record<string, string>;
}

export function createCapturingStorage(seed: Record<string, string> = {}): CapturingStorage {
  const store = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
    dump: () => Object.fromEntries(store.entries()),
  };
}
