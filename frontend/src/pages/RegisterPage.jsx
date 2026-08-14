import { Link, Navigate, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useState, useEffect } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { Button } from "../components/ui/Button";
import { OtpCodeBanner } from "../components/ui/OtpCodeBanner";
import { PublicSiteHeader } from "../components/PublicSiteHeader";
import { FULL_NAME_PATTERN, roleHome } from "../utils/helpers";
import {
  clearRegisterVerification,
  loadRegisterVerification,
  saveRegisterVerification
} from "../utils/verificationStorage";

export function RegisterPage() {
  const { register: registerUser, verifyRegister, resendCode, isAuthenticated, user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [step, setStep] = useState("form");
  const [pendingEmail, setPendingEmail] = useState("");
  const [devCode, setDevCode] = useState("");
  const [info, setInfo] = useState("");
  const [resending, setResending] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { isSubmitting }
  } = useForm({
    defaultValues: { code: "" }
  });

  useEffect(() => {
    const stored = loadRegisterVerification();
    if (stored?.email) setPendingEmail(stored.email);
  }, []);

  if (isAuthenticated) return <Navigate to={roleHome(user.role)} replace />;

  function buildCustomerPayload(values) {
    const payload = new FormData();
    ["name", "username", "email", "phone", "password"].forEach((key) => payload.append(key, values[key]));
    payload.append("role", "customer");
    payload.append("city", values.city);
    payload.append("address", values.address);
    return payload;
  }

  function extractError(err) {
    const details = err.details;
    const issueMessage = details?.issues?.[0]?.message;
    const fieldErrors = details?.fieldErrors
      ? Object.values(details.fieldErrors).flat().filter(Boolean)
      : [];
    const formErrors = details?.formErrors?.filter(Boolean) || [];
    return issueMessage || fieldErrors[0] || formErrors[0] || err.message;
  }

  async function onSubmitForm(values) {
    setError("");
    setInfo("");
    try {
      const result = await registerUser(buildCustomerPayload(values));
      if (result.verificationRequired) {
        setPendingEmail(values.email);
        saveRegisterVerification(values.email, null);
        setDevCode(result.devCode || "");
        setStep("verify");
        setInfo(result.message);
        setValue("code", "");
        return;
      }
      navigate(roleHome(result.user.role));
    } catch (err) {
      setError(extractError(err));
    }
  }

  async function onSubmitCode(values) {
    setError("");
    try {
      const result = await verifyRegister({ email: pendingEmail, code: values.code });
      clearRegisterVerification();
      navigate(roleHome(result.user.role));
    } catch (err) {
      setError(err.message);
    }
  }

  async function onResend() {
    setError("");
    setInfo("");
    const stored = loadRegisterVerification();
    const email = pendingEmail || stored?.email;

    if (!email) {
      setError("Session expired. Please fill the registration form again.");
      return;
    }

    setResending(true);
    try {
      const result = await resendCode({
        email,
        purpose: "register"
      });
      setPendingEmail(email);
      setInfo(result.message || "A new verification code was sent.");
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
      <div className="absolute inset-0 opacity-20">
        <div className="absolute left-[-8%] top-10 h-[500px] w-[500px] rounded-full bg-secondary-container blur-[120px]" />
      </div>
      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-4 pb-[env(safe-area-inset-bottom)] pt-[calc(5rem+env(safe-area-inset-top))] lg:grid-cols-2 lg:py-10">
        <div className="text-white">
          <Link to="/" className="mb-8 inline-flex items-center rounded-2xl bg-white/95 px-3 py-2 shadow-xl">
            <BrandLogo size="lg" linkToHome={false} />
          </Link>
          <h1 className="text-4xl font-bold leading-tight md:text-5xl">{t("Join the cargo Management system")}</h1>
          <p className="mt-4 max-w-md text-on-primary-container">
            {t("Create a customer account and start booking trucks. Drivers are registered by an admin only.")}
          </p>
        </div>

        <div className="auth-card p-6 md:p-8">
          {step === "form" ? (
            <>
              <h2 className="text-2xl font-bold text-primary">{t("Create customer account")}</h2>
              <p className="mt-1 text-sm text-on-surface-variant">
                {t("Register and start booking trucks right away. Your account role is Customer.")}
              </p>
              <p className="mt-4 rounded-lg bg-surface-container px-3 py-2 text-sm text-on-surface-variant">
                {t("Are you a driver?")}{" "}
                <Link to="/contact" className="font-semibold text-secondary-container hover:underline">
                  {t("Contact us to be added by an admin")}
                </Link>
              </p>

              <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit(onSubmitForm)}>
                <Field label="Full name">
                  <input
                    className="stitch-input"
                    type="text"
                    placeholder="e.g. Cabdi Axmed Xaashi"
                    maxLength={150}
                    autoComplete="name"
                    {...register("name", {
                      required: true,
                      minLength: 2,
                      maxLength: 150,
                      pattern: FULL_NAME_PATTERN
                    })}
                  />
                </Field>
                <Field label="Phone">
                  <input className="stitch-input" type="tel" inputMode="tel" maxLength={20} {...register("phone", { required: true, minLength: 7, maxLength: 20 })} />
                </Field>
                <Field label="Email">
                  <input className="stitch-input" type="email" maxLength={254} {...register("email", { required: true, maxLength: 254 })} />
                </Field>
                <Field label="City">
                  <input className="stitch-input" type="text" maxLength={100} {...register("city", { required: true, maxLength: 100 })} />
                </Field>
                <Field label="Address" className="sm:col-span-2">
                  <input className="stitch-input" type="text" maxLength={255} {...register("address", { required: true, maxLength: 255 })} />
                </Field>
                <Field label="Username" className="sm:col-span-2">
                  <input
                    className="stitch-input"
                    autoComplete="username"
                    maxLength={30}
                    {...register("username", { required: true, minLength: 3, pattern: /^[a-zA-Z0-9._-]+$/ })}
                  />
                </Field>
                <Field label="Password" className="sm:col-span-2">
                  <input
                    className="stitch-input"
                    type="password"
                    {...register("password", { required: true, minLength: 6 })}
                  />
                  <span className="mt-1 block text-xs text-on-surface-variant">At least 6 characters.</span>
                </Field>

                {error && (
                  <p className="sm:col-span-2 rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
                    {error}
                  </p>
                )}
                <div className="sm:col-span-2">
                  <Button className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? "Creating account…" : "Create account"}
                  </Button>
                </div>
              </form>
            </>
          ) : null}

          {step === "verify" ? (
            <form className="space-y-4" onSubmit={handleSubmit(onSubmitCode)}>
              <div>
                <h2 className="text-2xl font-bold text-primary">Verify your email</h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Enter the 6-digit code sent to <strong>{pendingEmail}</strong>
                </p>
              </div>
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-on-surface-variant">Verification code</span>
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
              <OtpCodeBanner code={devCode || undefined} message={info} />
              {error && <p className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}
              <Button className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Verifying…" : "Verify & continue"}
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  className="font-semibold text-on-surface-variant hover:underline"
                  onClick={() => {
                    setStep("form");
                    setError("");
                    setInfo("");
                  }}
                >
                  Back
                </button>
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
          ) : null}

          <p className="mt-6 text-center text-sm text-on-surface-variant">
            Already registered?{" "}
            <Link className="font-semibold text-secondary-container" to="/login">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children, className = "" }) {
  const { t } = useLanguage();
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1.5 block font-medium text-on-surface-variant">{t(label)}</span>
      {children}
    </label>
  );
}
