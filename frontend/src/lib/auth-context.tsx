"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiFetchBlob, ApiError, type ApiFetchOptions } from "./api";
import type { AuthUser } from "./types";

const STORAGE_KEY = "hslms.session";
// 仕様書のセッションタイムアウト要件（非操作30分）に合わせる
const IDLE_TIMEOUT_MS = Number(process.env.NEXT_PUBLIC_SESSION_TIMEOUT_MINUTES ?? 30) * 60_000;

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  setSession: (session: StoredSession) => void;
  loginWithTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => Promise<void>;
  authFetch: <T>(path: string, options?: ApiFetchOptions) => Promise<T>;
  authFetchBlob: (path: string) => Promise<Blob>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSessionState] = useState<StoredSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback((next: StoredSession | null) => {
    setSessionState(next);
    if (typeof window === "undefined") return;
    if (next) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const logout = useCallback(async () => {
    const token = session?.accessToken;
    persist(null);
    router.push("/login");
    if (token) {
      // ログアウトAPI自体が失敗しても、クライアント側のセッションは既に破棄済みなので無視する
      await apiFetch("/v1/auth/logout", { method: "POST", accessToken: token }).catch(() => undefined);
    }
  }, [session, persist, router]);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      logout();
    }, IDLE_TIMEOUT_MS);
  }, [logout]);

  useEffect(() => {
    // localStorageはSSR時に存在しないため、Next.jsのハイドレーション不整合を避けて
    // マウント後にだけ読み込む必要がある（意図的な一度きりの外部システム同期）。
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSessionState(JSON.parse(raw) as StoredSession);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!session || typeof window === "undefined") return;
    resetIdleTimer();
    const events = ["mousemove", "keydown", "click", "scroll"] as const;
    const handleActivity = () => resetIdleTimer();
    events.forEach((eventName) => window.addEventListener(eventName, handleActivity));
    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, handleActivity));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session !== null, resetIdleTimer]);

  const setSession = useCallback(
    (next: StoredSession) => {
      persist(next);
    },
    [persist],
  );

  const loginWithTokens = useCallback(
    async (accessToken: string, refreshToken: string) => {
      const { user } = await apiFetch<{ user: AuthUser }>("/v1/users/me", { accessToken });
      persist({ accessToken, refreshToken, user });
    },
    [persist],
  );

  const authFetch = useCallback(
    async <T,>(path: string, options: ApiFetchOptions = {}): Promise<T> => {
      if (!session) throw new ApiError(401, "unauthorized", "ログインが必要です");

      try {
        return await apiFetch<T>(path, { ...options, accessToken: session.accessToken });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          try {
            const refreshed = await apiFetch<{ accessToken: string; refreshToken: string }>("/v1/auth/refresh", {
              method: "POST",
              body: { refreshToken: session.refreshToken },
            });
            const nextSession = { ...session, accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken };
            persist(nextSession);
            return await apiFetch<T>(path, { ...options, accessToken: refreshed.accessToken });
          } catch {
            await logout();
          }
        }
        throw err;
      }
    },
    [session, persist, logout],
  );

  const authFetchBlob = useCallback(
    async (path: string): Promise<Blob> => {
      if (!session) throw new ApiError(401, "unauthorized", "ログインが必要です");

      try {
        return await apiFetchBlob(path, { accessToken: session.accessToken });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          try {
            const refreshed = await apiFetch<{ accessToken: string; refreshToken: string }>("/v1/auth/refresh", {
              method: "POST",
              body: { refreshToken: session.refreshToken },
            });
            const nextSession = { ...session, accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken };
            persist(nextSession);
            return await apiFetchBlob(path, { accessToken: refreshed.accessToken });
          } catch {
            await logout();
          }
        }
        throw err;
      }
    },
    [session, persist, logout],
  );

  const refreshUser = useCallback(async () => {
    if (!session) return;
    const { user } = await authFetch<{ user: AuthUser }>("/v1/users/me");
    persist({ ...session, user });
  }, [session, authFetch, persist]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      isLoading,
      setSession,
      loginWithTokens,
      logout,
      authFetch,
      authFetchBlob,
      refreshUser,
    }),
    [session, isLoading, setSession, loginWithTokens, logout, authFetch, authFetchBlob, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
