import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { Eye, EyeOff } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/Button";
import { OtpCodeBanner } from "../components/ui/OtpCodeBanner";
import { PublicSiteHeader } from "../components/PublicSiteHeader";
import { BrandLogo } from "../components/BrandLogo";
import { roleHome } from "../utils/helpers";
import { useOtpAutoSubmit, useResendCooldown } from "../hooks/useOtpVerification";
import {
  clearLoginVerification,
  loadLoginVerification,
  saveLoginVerification
} from "../utils/verificationStorage";
import { useLanguage } from "../contexts/LanguageContext";

export function LoginPage() {
  const { login, verifyLogin, resendCode, isAuthenticated, user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState(location.state?.step === "verify" ? "verify" : "credentials");
  const [pendingEmail, setPendingEmail] = useState(location.state?.email || "");
  const [pendingPassword, setPendingPassword] = useState(location.state?.password || "");
  const [devCode, setDevCode] = useState("");
  const [info, setInfo] = useState(location.state?.step === "verify" ? "Check your email for the verification code." : "");
  const [resending, setResending] = useState(false);
  const { secondsLeft, startCooldown, canResend } = useResendCooldown(60);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting }
  } = useForm({
    defaultValues: {
      identifier: location.state?.email || "",
      password: location.state?.password || "",
      code: ""
    }
  });

  const codeValue = watch("code");

  useEffect(() => {
    if (step === "verify") startCooldown(60);
  }, [step, startCooldown]);

  useEffect(() => {
    if (location.state?.email) setValue("identifier", location.state.email);
    if (location.state?.password) setValue("password", location.state.password);
    const stored = loadLoginVerification();
    if (stored?.email) setPendingEmail(stored.email);
    if (stored?.password) setPendingPassword(stored.password);
  }, [location.state, setValue]);

  async function onSubmitCredentials(values) {
    setError("");
    setInfo("");
    try {
      const result = await login(values);
      if (result.verificationRequired) {
        setPendingEmail(result.email || values.identifier);
        setPendingPassword(values.password);
        saveLoginVerification(result.email || values.identifier, values.password);
        setDevCode(result.devCode || "");
        setStep("verify");
        startCooldown(60);
        setInfo(result.message || "Verification code sent to your account email. Check your inbox.");
        setValue("code", "");
        return;
      }
      navigate(roleHome(result.user.role));
    } catch (err) {
      const hint =
        err.message === "Invalid username/email or password"
          ? " Check your username/email and password, or use Forgot password."
          : "";
      setError(`${err.message}${hint}`);
    }
  }

  async function onSubmitCode(values) {
    setError("");
    setInfo("");
    try {
      const result = await verifyLogin({ email: pendingEmail, code: values.code });
      clearLoginVerification();
      if (result.user?.mustChangePassword) {
        navigate("/change-password", { replace: true });
        return;
      }
      navigate(roleHome(result.user.role));
    } catch (err) {
      setError(err.message);
    }
  }

  const submitCode = useCallback(() => {
    handleSubmit(onSubmitCode)();
  }, [handleSubmit, pendingEmail, verifyLogin, navigate]);

  useOtpAutoSubmit({
    code: codeValue,
    enabled: step === "verify",
    submitting: isSubmitting,
    onComplete: submitCode
  });

  async function onResend() {
    setError("");
    setInfo("");
    const stored = loadLoginVerification();
    const email = pendingEmail || stored?.email;
    const password = pendingPassword || stored?.password;

    if (!email || !password) {
      setError("Session expired. Go back and sign in again.");
      return;
    }

    setResending(true);
    try {
      const result = await resendCode({
        email,
        password,
        purpose: "login"
      });
      setPendingEmail(email);
      setPendingPassword(password);
      saveLoginVerification(email, password);
      setInfo(result.message || "A new verification code was sent.");
      setDevCode(result.devCode || "");
      setValue("code", result.devCode || "");
      startCooldown(60);
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  }

  if (isAuthenticated) return <Navigate to={roleHome(user.role)} replace />;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <PublicSiteHeader variant="auth" className="border-transparent bg-transparent" />
      <div className="hero-gradient absolute inset-0" />
      <div className="absolute inset-0 opacity-20">
        <div className="absolute right-[-8%] top-10 h-[500px] w-[500px] rounded-full bg-secondary-container blur-[120px]" />
      </div>
      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-4 pb-[env(safe-area-inset-bottom)] pt-[calc(5rem+env(safe-area-inset-top))] lg:grid-cols-2 lg:py-10">
        <div className="text-white">
          <Link to="/" className="mb-8 inline-flex items-center rounded-2xl bg-white/95 px-3 py-2 shadow-xl">
            <BrandLogo size="lg" linkToHome={false} />
          </Link>
          <h1 className="text-4xl font-bold leading-tight md:text-5xl">
            {t("auth.loginTitle")}
          </h1>
          <p className="mt-4 max-w-md text-on-primary-container">
            {t("auth.loginSubtitle")}
          </p>
        </div>

        <div className="auth-card p-6 md:p-8">
          {step === "credentials" ? (
            <form className="space-y-4" onSubmit={handleSubmit(onSubmitCredentials)}>
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-on-surface-variant">{t("auth.emailOrPhone")}</span>
                <input className="stitch-input" autoComplete="username" {...register("identifier", { required: true })} />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-on-surface-variant">{t("auth.password")}</span>
                <div className="relative">
                  <input 
                    className="stitch-input w-full pr-10" 
                    type={showPassword ? "text" : "password"} 
                    {...register("password", { required: true })} 
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>
              {error && <p className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}
              <div className="flex items-center justify-between text-sm">
                <span />
                <Link className="font-semibold text-secondary-container hover:underline" to="/forgot-password">
                  Forgot password?
                </Link>
              </div>
              <Button className="w-full" disabled={isSubmitting}>
                {isSubmitting ? t("common.loading") : t("auth.signIn")}
              </Button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit(onSubmitCode)}>
              <div>
                <h2 className="text-xl font-bold text-primary">{t("auth.verifyTitle")}</h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Code sent to <strong>{pendingEmail}</strong>
                </p>
              </div>
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-on-surface-variant">{t("auth.code")}</span>
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
              <p className="text-xs text-on-surface-variant">
                Geli 6-digit code-ka email-kaaga (eeg spam). Marka 6 xaraf la buuxiyo, si toos ah ayaa loo xaqiijinayaa.
              </p>
              {secondsLeft > 0 && (
                <p className="text-xs font-medium text-secondary-container">
                  Resend code available in {secondsLeft}s
                </p>
              )}
              <OtpCodeBanner code={devCode || undefined} message={info} />
              {error && <p className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}
              <Button className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Verifying…" : "Sign in"}
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  className="font-semibold text-on-surface-variant hover:underline"
                  onClick={() => { setStep("credentials"); setError(""); setInfo(""); }}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="font-semibold text-secondary-container hover:underline disabled:opacity-60"
                  onClick={onResend}
                  disabled={resending || !canResend}
                >
                  {resending ? "Sending…" : canResend ? "Resend code" : `Resend in ${secondsLeft}s`}
                </button>
              </div>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-on-surface-variant">
            New here?{" "}
            <Link className="font-semibold text-secondary-container hover:underline" to="/register">
              Create account
            </Link>
          </p>

        </div>
      </div>
    </div>
  );
}
