import { Link } from "react-router-dom";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "../components/ui/Button";
import { OtpCodeBanner } from "../components/ui/OtpCodeBanner";
import { PublicSiteHeader } from "../components/PublicSiteHeader";
import { BrandLogo } from "../components/BrandLogo";
import { api } from "../services/api";

export function ForgotPasswordPage() {
  const [step, setStep] = useState("email");
  const [pendingEmail, setPendingEmail] = useState("");
  const [devCode, setDevCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resending, setResending] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { isSubmitting }
  } = useForm();

  async function onSendCode(values) {
    setError("");
    setMessage("");
    try {
      const result = await api.forgotPassword(values.email);
      setPendingEmail(values.email);
      setStep("reset");
      setDevCode(result.devCode || "");
      setMessage(result.message || "Reset code sent. Check your inbox.");
    } catch (err) {
      setError(err.message);
    }
  }

  async function onReset(values) {
    setError("");
    setMessage("");
    try {
      const result = await api.resetPassword({
        email: pendingEmail,
        code: values.code,
        password: values.password
      });
      setMessage(result.message || "Password reset successfully.");
      setStep("done");
    } catch (err) {
      setError(err.message);
    }
  }

  async function onResend() {
    if (!pendingEmail) {
      setError("Enter your email first.");
      return;
    }
    setError("");
    setMessage("");
    setResending(true);
    try {
      const result = await api.resendCode({ email: pendingEmail, purpose: "reset" });
      setMessage(result.message || "A new reset code was sent.");
      setDevCode(result.devCode || "");
      setValue("code", result.devCode || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <PublicSiteHeader variant="auth" className="border-transparent bg-transparent" />
      <div className="hero-gradient absolute inset-0" />
      <div className="relative mx-auto flex min-h-screen max-w-lg items-center px-4 pb-[env(safe-area-inset-bottom)] pt-[calc(5rem+env(safe-area-inset-top))] lg:py-10">
        <div className="auth-card w-full p-6 md:p-8">
          <Link to="/" className="mb-6 inline-flex items-center">
            <BrandLogo size="sm" linkToHome={false} />
          </Link>
          <h1 className="text-3xl font-bold text-primary">Reset password</h1>
          <p className="mt-2 text-sm text-on-surface-variant">
            {step === "email"
              ? "Enter your email and we'll send a verification code."
              : "Enter the code from your email and choose a new password."}
          </p>

          {step === "email" ? (
            <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSendCode)}>
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-on-surface-variant">Email</span>
                <input className="stitch-input" type="email" {...register("email", { required: true })} />
              </label>
              {error && <p className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}
              <Button className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Sending…" : "Send reset code"}
              </Button>
            </form>
          ) : step === "reset" ? (
            <form className="mt-6 space-y-4" onSubmit={handleSubmit(onReset)}>
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-on-surface-variant">6-digit code</span>
                <input
                  className="stitch-input text-center text-2xl font-semibold tracking-[0.5em]"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={6}
                  placeholder="• • • • • •"
                  {...register("code", {
                    required: true,
                    minLength: 6,
                    maxLength: 6,
                    pattern: /^[0-9]{6}$/
                  })}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
                    e.target.value = digits;
                    setValue("code", digits, { shouldValidate: true });
                  }}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-on-surface-variant">New password</span>
                <input className="stitch-input" type="password" {...register("password", { required: true, minLength: 6 })} />
              </label>
              <OtpCodeBanner code={devCode || undefined} message={message} />
              {error && <p className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}
              <Button className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Resetting…" : "Reset password"}
              </Button>
              <div className="text-right text-sm">
                <button
                  type="button"
                  className="font-semibold text-secondary-container hover:underline disabled:opacity-60"
                  onClick={onResend}
                  disabled={resending}
                >
                  {resending ? "Sending…" : "Resend code"}
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-6 space-y-4">
              <p className="rounded-lg bg-primary-fixed px-3 py-2 text-sm text-primary-container">{message}</p>
              <Link to="/login">
                <Button className="w-full">Back to sign in</Button>
              </Link>
            </div>
          )}

          {step !== "done" && (
            <p className="mt-6 text-center text-sm text-on-surface-variant">
              Remembered it?{" "}
              <Link className="font-semibold text-secondary-container hover:underline" to="/login">
                Back to sign in
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
