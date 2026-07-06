"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./auth-context";

export function useRequireAdmin() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role !== "admin" && user.role !== "super_admin") {
      router.replace("/dashboard");
    }
  }, [isLoading, user, router]);

  const isAuthorized = !isLoading && !!user && (user.role === "admin" || user.role === "super_admin");
  return { user, isLoading, isAuthorized };
}
