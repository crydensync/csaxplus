"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { IconAlertTriangle, IconCheck } from "./icons";

export type ToastTone = "success" | "error";

export type Toast = {
  id: string;
  message: string;
  tone: ToastTone;
};

export type ToastApi = {
  /** Confirms an action that already succeeded. */
  success: (message: string) => void;
  /** Reports a failure with the message the caller already made human-readable. */
  error: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const DISMISS_AFTER_MS = 5000;

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) {
    throw new Error("useToast must be used inside a ToastProvider");
  }
  return api;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ReadonlyArray<Toast>>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const remove = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (message: string, tone: ToastTone) => {
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { id, message, tone }]);
      timers.current.set(
        id,
        setTimeout(() => remove(id), DISMISS_AFTER_MS),
      );
    },
    [remove],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push(message, "success"),
      error: (message) => push(message, "error"),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={toast.tone === "error" ? "toast error" : "toast"}>
            {toast.tone === "error" ? <IconAlertTriangle /> : <IconCheck />}
            <span>{toast.message}</span>
            <button
              type="button"
              className="toast-dismiss"
              onClick={() => remove(toast.id)}
              aria-label="Dismiss notification"
            >
              Close
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
