import PageMeta from "@/components/common/PageMeta";
import Button from "@/components/ui/button/Button";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Badge from "@/components/ui/badge/Badge";
import { useAuth } from "@/context/AuthContext";
import {
  adminApi,
  ApiError,
  referralUrl,
  type ReferralPartner,
} from "@/lib/api";
import { dateTime, relativeTime } from "@/lib/format";
import { CopyIcon, CopySmIcon, PlusLineIcon, UserMoneyIcon } from "@/icons";
import { useCallback, useEffect, useState } from "react";

export default function ReferralsPage() {
  const { refresh } = useAuth();
  const [partners, setPartners] = useState<ReferralPartner[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const load = useCallback(async () => {
    setMessage(undefined);
    try {
      const result = await adminApi.referrals();
      setPartners(result.partners);
      setLoaded(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await refresh();
        return;
      }
      setMessage(
        error instanceof ApiError && error.status === 0
          ? "You appear to be offline. Reconnect and try again."
          : error instanceof Error
            ? error.message
            : "Unable to load referrals.",
      );
      setLoaded(true);
    }
  }, [refresh]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createReferrer(event: React.FormEvent) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setMessage(undefined);
    setNotice(undefined);
    try {
      const result = await adminApi.createReferral({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
      });
      setFirstName("");
      setLastName("");
      setEmail("");
      setNotice(`${result.partner.firstName}'s referral link is ready.`);
      await load();
    } catch (error) {
      setMessage(
        error instanceof ApiError && error.status === 0
          ? "You appear to be offline. Reconnect and try again."
          : error instanceof Error
            ? error.message
            : "Unable to create a referral link.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function copyLink(code: string) {
    try {
      await navigator.clipboard.writeText(referralUrl(code));
      setCopiedCode(code);
      window.setTimeout(() => {
        if (copiedCode === code) setCopiedCode(undefined);
      }, 1500);
    } catch {
      setMessage(
        "Copy failed. Open the link in a new tab and copy it from the address bar.",
      );
    }
  }

  const totalReferrals = partners.reduce(
    (sum, partner) => sum + partner.referrals,
    0,
  );

  return (
    <>
      <PageMeta
        title="Grademaxxing Admin — Referrals"
        description="Manage Grademaxxing referral partners and links."
      />
      <div className="mx-auto max-w-(--breakpoint-2xl) p-4 sm:p-6">
        <div className="mb-6">
          <p className="text-sm text-gray-500 dark:text-gray-400">Growth</p>
          <h1 className="mt-1 text-title-xl font-semibold text-gray-800 dark:text-white/90">
            Referral leaderboard
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {partners.length} partners · {totalReferrals} referrals attributed
          </p>
        </div>

        {message && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-error-500 bg-error-50 px-4 py-3 text-sm text-error-600 dark:border-error-500/30 dark:bg-error-500/15 dark:text-error-400"
          >
            {message}
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="mb-4 rounded-xl border border-success-500 bg-success-50 px-4 py-3 text-sm text-success-600 dark:border-success-500/30 dark:bg-success-500/15 dark:text-success-500"
          >
            {notice}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-6 xl:col-span-2 dark:border-gray-800 dark:bg-white/[0.03]">
            <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
              Partners
            </h2>
            <div className="mt-4 max-w-full overflow-x-auto">
              <Table>
                <TableHeader className="border-t border-gray-100 dark:border-gray-800">
                  <TableRow>
                    <TableCell
                      isHeader
                      className="px-6 py-3 text-start text-theme-xs text-gray-500 dark:text-gray-400"
                    >
                      Partner
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-6 py-3 text-start text-theme-xs text-gray-500 dark:text-gray-400"
                    >
                      Referral link
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-6 py-3 text-start text-theme-xs text-gray-500 dark:text-gray-400"
                    >
                      Referrals
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-6 py-3 text-start text-theme-xs text-gray-500 dark:text-gray-400"
                    >
                      Last referral
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-6 py-3 text-start text-theme-xs text-gray-500 dark:text-gray-400"
                    >
                      Status
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {partners.map((partner) => (
                    <TableRow key={partner.id}>
                      <TableCell className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-500 dark:bg-brand-500/15 dark:text-brand-400">
                            {partner.firstName.charAt(0)}
                            {partner.lastName.charAt(0)}
                          </div>
                          <div>
                            <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">
                              {partner.firstName} {partner.lastName}
                            </p>
                            <p className="text-theme-xs text-gray-400">
                              {partner.email}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <button
                          onClick={() => void copyLink(partner.code)}
                          className="inline-flex items-center gap-1.5 text-theme-sm text-brand-500 hover:text-brand-600 dark:text-brand-400"
                        >
                          {copiedCode === partner.code ? (
                            <CopySmIcon className="size-4 text-success-500" />
                          ) : (
                            <CopyIcon className="size-4" />
                          )}
                          {copiedCode === partner.code ? "Copied" : "Copy link"}
                        </button>
                        <p className="mt-1 text-theme-xs text-gray-400">
                          /refer/{partner.code}
                        </p>
                      </TableCell>
                      <TableCell className="px-6 py-4 text-theme-sm font-semibold text-gray-800 dark:text-white/90">
                        {partner.referrals}
                      </TableCell>
                      <TableCell className="whitespace-nowrap px-6 py-4 text-theme-sm text-gray-500 dark:text-gray-400">
                        {partner.lastReferralAt
                          ? relativeTime(partner.lastReferralAt)
                          : "—"}
                      </TableCell>
                      <TableCell className="px-6 py-4">
                        <Badge
                          color={partner.active ? "success" : "light"}
                          size="sm"
                        >
                          {partner.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {loaded && partners.length === 0 && (
                    <TableRow>
                      <TableCell className="px-6 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                        No referral partners yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {partners.length > 0 && (
              <p className="mt-4 text-theme-xs text-gray-400">
                First partner created {dateTime(partners[0].createdAt)}.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-xl bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400">
                <UserMoneyIcon className="size-6" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-800 dark:text-white/90">
                  New referral partner
                </h2>
                <p className="text-theme-xs text-gray-400">
                  Generates a shareable /refer/ link.
                </p>
              </div>
            </div>
            <form onSubmit={createReferrer} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="ref-first-name"
                  className="block text-theme-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  First name
                </label>
                <input
                  id="ref-first-name"
                  required
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  className="mt-1.5 h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:text-white/90"
                />
              </div>
              <div>
                <label
                  htmlFor="ref-last-name"
                  className="block text-theme-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Last name
                </label>
                <input
                  id="ref-last-name"
                  required
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  className="mt-1.5 h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:text-white/90"
                />
              </div>
              <div>
                <label
                  htmlFor="ref-email"
                  className="block text-theme-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Email address
                </label>
                <input
                  id="ref-email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-1.5 h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:text-white/90"
                />
              </div>
              <Button
                className="w-full"
                size="sm"
                disabled={creating}
                startIcon={<PlusLineIcon className="size-5" />}
              >
                {creating ? "Generating…" : "Generate link"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
