import type { MaxDiagnosticSummary } from "../../../src/lib/contracts/max-diagnostics";
export type {
  MaxDiagnostic,
  MaxDiagnosticSummary,
} from "../../../src/lib/contracts/max-diagnostics";
export type UsageRangeDays = 7 | 30 | 90;

export type DailyUsage = {
  date: string;
  newStudents: number;
  activeStudents: number;
  totalStudents: number;
};

export type ProtectedUser = {
  studentKey: string;
  firstSeenAt: string;
  lastSeenAt: string;
  activeDays: number;
  activeInRange: boolean;
};

export type UsageSummary = {
  generatedAt: string;
  rangeDays: UsageRangeDays;
  uniqueStudents: number;
  activeStudents: number;
  previousActiveStudents: number;
  newStudents: number;
  previousNewStudents: number;
  returningStudents: number;
  returningStudentsInRange: number;
  activeToday: number;
  trackingStartedAt: string | null;
  dailyTrackingStartedAt: string | null;
  lastActivityAt: string | null;
  dailyUsage: DailyUsage[];
  users: ProtectedUser[];
};

export type FeedbackStatus =
  "new" | "reviewing" | "planned" | "resolved" | "dismissed";

export const feedbackStatuses: FeedbackStatus[] = [
  "new",
  "reviewing",
  "planned",
  "resolved",
  "dismissed",
];

export type FeedbackKind = "Bug report" | "Grade question" | "Feature idea";

export type FeedbackMessage = {
  id: string;
  sender: "student" | "admin";
  message: string;
  createdAt: string;
};

export type FeedbackItem = {
  id: string;
  kind: FeedbackKind;
  message: string;
  pagePath: string;
  appVersion: string;
  status: FeedbackStatus;
  adminNote: string;
  adminReply: string;
  repliedAt: string | null;
  createdAt: string;
  updatedAt: string;
  messages: FeedbackMessage[];
};

export type ReferralPartner = {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
  active: boolean;
  referrals: number;
  lastReferralAt: string | null;
};

export type AdminUser = {
  username: string;
  displayName: string;
  role: string;
};

export type AdminSession = {
  authenticated: boolean;
  user?: AdminUser;
};

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      cache: "no-store",
      ...init,
      headers: init?.body
        ? { "Content-Type": "application/json", ...init.headers }
        : init?.headers,
    });
  } catch {
    throw new ApiError("You appear to be offline. Reconnect and try again.", 0);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new ApiError(
      body.message ??
        (response.status === 401
          ? "Your admin session has expired. Sign in again."
          : `Request failed${response.status ? ` (${response.status})` : ""}.`),
      response.status,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const adminApi = {
  maxDiagnostics: (before?: string, issuesOnly = false, signal?: AbortSignal) =>
    request<MaxDiagnosticSummary>(
      `/api/admin/max?issues=${issuesOnly ? "1" : "0"}${before ? `&before=${encodeURIComponent(before)}` : ""}`,
      { signal },
    ),
  clearMaxDiagnostics: () =>
    request<void>("/api/admin/max", { method: "DELETE" }),
  session: (signal?: AbortSignal) =>
    request<AdminSession>("/api/admin/session", { signal }),
  signIn: (username: string, password: string) =>
    request<void>("/api/admin/session", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  signOut: () => request<void>("/api/admin/session", { method: "DELETE" }),
  usage: (range: UsageRangeDays, signal?: AbortSignal) =>
    request<UsageSummary>(`/api/admin/usage?range=${range}`, { signal }),
  feedback: (signal?: AbortSignal) =>
    request<{ items: FeedbackItem[] }>("/api/admin/feedback", { signal }),
  saveFeedback: (input: {
    id: string;
    status: FeedbackStatus;
    adminNote: string;
    adminReply: string;
  }) =>
    request<void>("/api/admin/feedback", {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  sendFeedbackMessage: (id: string, message: string) =>
    request<FeedbackMessage>(
      `/api/admin/feedback/${encodeURIComponent(id)}/messages`,
      { method: "POST", body: JSON.stringify({ message }) },
    ),
  referrals: (signal?: AbortSignal) =>
    request<{ partners: ReferralPartner[] }>("/api/admin/referrals", {
      signal,
    }),
  createReferral: (input: {
    firstName: string;
    lastName: string;
    email: string;
  }) =>
    request<{ partner: ReferralPartner }>("/api/admin/referrals", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  health: () => request<{ status: string }>("/api/health"),
};

export function referralUrl(code: string): string {
  const origin =
    window.location.hostname === "admin.grademaxxing.app"
      ? "https://grademaxxing.app"
      : window.location.origin;
  return `${origin}/refer/${code}`;
}

export function downloadJson(fileName: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadCsv(
  fileName: string,
  rows: Array<Array<string | number | boolean>>,
) {
  const encode = (value: string | number | boolean) =>
    `"${String(value).replaceAll('"', '""')}"`;
  const csv = rows.map((row) => row.map(encode).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
