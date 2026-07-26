import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Mail,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";

import emailAPI from "@/api/email.api";

import { Button } from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Spinner from "@/components/ui/Spinner";

// ─────────────────────────────────────────────────────────────
// Email → Settings
//
// The old "email + app password" modal is gone. Connecting a mailbox is
// now a Google OAuth 2.0 flow (like HubSpot / Salesforce / Zoho):
//
//   Continue with Google  ->  Google consent screen  ->  backend callback
//                         ->  back here with ?connected=1
//
// No password is ever typed or stored; the backend keeps an encrypted
// refresh token and sends mail through Gmail over OAuth2.
// ─────────────────────────────────────────────────────────────

/** Official Google "G" mark (lucide has no brand logos). */
function GoogleIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

function getErrorMessage(error, fallback) {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    fallback
  );
}

// Friendly text for the ?error codes the OAuth callback can bounce back.
function prettyOAuthError(code) {
  const map = {
    access_denied: "Google sign-in was cancelled.",
    missing_code: "Google did not return an authorization code. Please try again.",
    invalid_state: "Your sign-in session expired. Please try connecting again.",
    token_exchange_failed: "Could not complete Google sign-in. Please try again.",
    connection_failed: "Could not connect your Gmail account. Please try again.",
  };
  return map[code] || "Google sign-in failed. Please try again.";
}

export default function Settings() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [connecting, setConnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const { data: account, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["email", "google-account"],
    queryFn: () => emailAPI.getGoogleAccount(),
    refetchOnWindowFocus: false,
  });

  // Handle the return trip from Google's consent screen (runs once).
  useEffect(() => {
    const connected = searchParams.get("connected");
    const oauthError = searchParams.get("error");
    if (!connected && !oauthError) return;

    if (connected) {
      const email = searchParams.get("email");
      toast.success(email ? `Connected ${email}` : "Gmail connected.");
      queryClient.invalidateQueries({ queryKey: ["email", "google-account"] });
      queryClient.invalidateQueries({ queryKey: ["email", "accounts"] });
    } else if (oauthError) {
      toast.error(prettyOAuthError(oauthError));
    }

    // Strip the OAuth params so a refresh doesn't re-fire the toast.
    ["connected", "error", "email"].forEach((k) => searchParams.delete(k));
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch the consent URL (authenticated), then leave the SPA for Google.
  const handleConnect = async () => {
    try {
      setConnecting(true);
      const { url } = await emailAPI.getGoogleAuthUrl();
      window.location.href = url;
    } catch (e) {
      setConnecting(false);
      toast.error(getErrorMessage(e, "Could not start Google sign-in."));
    }
  };

  const disconnectMutation = useMutation({
    mutationFn: () => emailAPI.disconnectGoogle(),
    onSuccess: async () => {
      setConfirmDisconnect(false);
      toast.success("Gmail disconnected.");
      await queryClient.invalidateQueries({ queryKey: ["email", "google-account"] });
      await queryClient.invalidateQueries({ queryKey: ["email", "accounts"] });
    },
    onError: (e) => toast.error(getErrorMessage(e, "Could not disconnect.")),
  });

  const isConnected = Boolean(account?.connected);

  return (
    <div className="flex flex-1 flex-col gap-6">
      {/* Page header */}
      <div>
        <h1 className="text-[20px] font-bold" style={{ color: "var(--text-primary)" }}>
          Email Accounts
        </h1>
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          Connect the Gmail account this CRM sends from. Secured with Google
          OAuth — no password is ever stored.
        </p>
      </div>

      {/* Loading connection status */}
      {isLoading && (
        <div className="flex min-h-[220px] items-center justify-center">
          <Spinner size="lg" />
        </div>
      )}

      {/* Status query failed */}
      {isError && !isLoading && (
        <div
          className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-xl border p-6 text-center"
          style={{ borderColor: "var(--border)" }}
        >
          <AlertCircle size={22} style={{ color: "var(--danger)" }} />
          <p style={{ color: "var(--text-secondary)" }}>
            {getErrorMessage(error, "Could not load your Gmail connection.")}
          </p>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {/* ── Connected ─────────────────────────────────────────── */}
      {!isLoading && !isError && isConnected && (
        <div
          className="mx-auto w-full max-w-xl rounded-2xl border p-6 sm:p-8"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <div className="flex flex-col items-center gap-4 text-center">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full"
              style={{ background: "var(--success-bg, rgba(34,197,94,0.12))" }}
            >
              <CheckCircle2 size={28} style={{ color: "var(--success, #16a34a)" }} />
            </div>

            <div className="flex flex-col items-center gap-1">
              <Badge variant="success" dot>
                Connected
              </Badge>
              <p
                className="mt-1 text-[16px] font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {account.email}
              </p>
              {account.displayName && account.displayName !== account.email && (
                <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                  {account.displayName}
                </p>
              )}
              <p
                className="mt-1 flex items-center gap-1.5 text-[13px]"
                style={{ color: "var(--text-secondary)" }}
              >
                <ShieldCheck size={15} style={{ color: "var(--success, #16a34a)" }} />
                Connected via Google OAuth
              </p>
            </div>

            <Button
              variant="destructive"
              onClick={() => setConfirmDisconnect(true)}
              className="mt-2"
            >
              Disconnect
            </Button>
          </div>
        </div>
      )}

      {/* ── Not connected ─────────────────────────────────────── */}
      {!isLoading && !isError && !isConnected && (
        <div
          className="mx-auto w-full max-w-xl rounded-2xl border p-6 sm:p-8"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <div className="flex flex-col items-center gap-4 text-center">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full"
              style={{ background: "var(--surface-2)" }}
            >
              <Mail size={26} style={{ color: "var(--text-secondary)" }} />
            </div>

            <div className="flex flex-col items-center gap-1">
              <h2
                className="text-[17px] font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                Connect Gmail
              </h2>
              <p
                className="max-w-sm text-[13px]"
                style={{ color: "var(--text-muted)" }}
              >
                Send and sync email from inside the CRM using your Google
                account.
              </p>
            </div>

            <button
              type="button"
              onClick={handleConnect}
              disabled={connecting}
              className="mt-1 inline-flex items-center justify-center gap-2.5 rounded-lg border bg-white px-5 py-2.5 text-[14px] font-semibold text-[#3c4043] shadow-sm transition hover:bg-[#f8f9fa] disabled:cursor-not-allowed disabled:opacity-70"
              style={{ borderColor: "#dadce0" }}
            >
              {connecting ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <GoogleIcon size={18} />
              )}
              {connecting ? "Redirecting…" : "Continue with Google"}
            </button>

            <p
              className="flex items-center gap-1.5 text-[12px]"
              style={{ color: "var(--text-muted)" }}
            >
              <ShieldCheck size={14} />
              Secure OAuth authentication. No password required.
            </p>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        onConfirm={() => disconnectMutation.mutate()}
        loading={disconnectMutation.isPending}
        title="Disconnect Gmail?"
        description={
          account?.email
            ? `${account.email} will stop sending and syncing. You can reconnect any time.`
            : "This mailbox will stop sending and syncing. You can reconnect any time."
        }
        confirmLabel="Disconnect"
      />
    </div>
  );
}