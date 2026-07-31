import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { LockKeyhole } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/Button";
import { BrandLogo } from "../components/BrandLogo";
import { roleHome } from "../utils/helpers";

export function ChangePasswordPage() {
  const { user, isAuthenticated, booting, changePassword } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (booting) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-on-surface-variant">
        Loading…
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (!user?.mustChangePassword) {
    return <Navigate to={roleHome(user.role)} replace />;
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError("");
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await changePassword({ currentPassword, newPassword });
      navigate(roleHome(user.role), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="hero-gradient absolute inset-0" />
      <div className="relative mx-auto flex min-h-screen max-w-lg items-center px-4 py-10">
        <div className="auth-card w-full p-6 md:p-8">
          <div className="mb-6 flex items-center gap-3">
            <BrandLogo size="sm" linkToHome={false} />
            <div>
              <h1 className="text-2xl font-bold text-primary">Set a new password</h1>
              <p className="text-sm text-on-surface-variant">
                Welcome, {user.name}. Change your temporary password to continue.
              </p>
            </div>
          </div>

          <div className="mb-6 flex items-start gap-3 rounded-xl border border-secondary-container/40 bg-secondary-fixed/30 p-4 text-sm text-on-surface">
            <LockKeyhole size={18} className="mt-0.5 shrink-0 text-secondary-container" />
            <p>
              Your account was created by an administrator. For security, you must choose a new password
              before accessing your dashboard.
            </p>
          </div>

          <form className="space-y-4" onSubmit={onSubmit}>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-on-surface-variant">Temporary password</span>
              <input
                className="stitch-input"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoFocus
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-on-surface-variant">New password</span>
              <input
                className="stitch-input"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1.5 block font-medium text-on-surface-variant">Confirm new password</span>
              <input
                className="stitch-input"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
            </label>
            {error && <p className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}
            <Button className="w-full" disabled={submitting}>
              {submitting ? "Saving…" : "Save password & continue"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
