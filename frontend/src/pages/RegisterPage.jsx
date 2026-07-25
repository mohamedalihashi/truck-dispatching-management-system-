import { Link, Navigate, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useState, useEffect } from "react";
import { Truck } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui/Button";
import { OtpCodeBanner } from "../components/ui/OtpCodeBanner";
import { PublicSiteHeader } from "../components/PublicSiteHeader";
import { roleHome } from "../utils/helpers";
import {
  clearRegisterVerification,
  loadRegisterVerification,
  saveRegisterVerification
} from "../utils/verificationStorage";

export function RegisterPage() {
  const { register: registerUser, verifyRegister, resendCode, isAuthenticated, user } = useAuth();
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
    defaultValues: {
      code: ""
    }
  });

  useEffect(() => {
    const stored = loadRegisterVerification();
    if (stored?.email) setPendingEmail(stored.email);
  }, []);

  if (isAuthenticated) return <Navigate to={roleHome(user.role)} replace />;

  function buildPayload(values) {
    const payload = new FormData();
    ["name", "username", "email", "phone", "password"].forEach((key) => payload.append(key, values[key]));
    payload.append("role", "customer");
    payload.append("city", values.city);
    payload.append("address", values.address);
    return payload;
  }

  async function onSubmitForm(values) {
    setError("");
    setInfo("");
    try {
      const payload = buildPayload(values);
      const result = await registerUser(payload);
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
      const details = err.details;
      const issueMessage = details?.issues?.[0]?.message;
      const fieldErrors = details?.fieldErrors
        ? Object.values(details.fieldErrors).flat().filter(Boolean)
        : [];
      const formErrors = details?.formErrors?.filter(Boolean) || [];
      setError(issueMessage || fieldErrors[0] || formErrors[0] || err.message);
    }
  }

  async function onSubmitCode(values) {
    setError("");
    try {
      const result = await verifyRegister({ email: pendingEmail, code: values.code });
      clearRegisterVerification();
      if (result.verificationPending) {
        navigate("/login", { replace: true, state: { email: pendingEmail } });
        return;
      }
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
          <Link to="/" className="mb-8 inline-flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-secondary-container shadow-xl">
              <Truck />
            </span>
            <span className="text-2xl font-bold">TruckDispatch</span>
          </Link>
          <h1 className="text-4xl font-bold leading-tight md:text-5xl">Join the cargo marketplace</h1>
          <p className="mt-4 max-w-md text-on-primary-container">
            Create an account to start using TruckDispatch
          </p>
        </div>

        <div className="auth-card p-6 md:p-8">
          {step === "form" ? (
            <>
              <h2 className="text-2xl font-bold text-primary">Create account</h2>
              <p className="mt-1 text-sm text-on-surface-variant">Register as a customer. Driver accounts are created by an administrator.</p>

              <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit(onSubmitForm)}>
                <Field label="Full name"><input className="stitch-input" {...register("name", { required: true })} /></Field>
                <Field label="Phone"><input className="stitch-input" type="tel" {...register("phone", { required: true })} /></Field>
                <Field label="Email (Gmail)"><input className="stitch-input" type="email" {...register("email", { required: true })} /></Field>
                <Field label="City"><input className="stitch-input" {...register("city", { required: true })} /></Field>
                <Field label="Address" className="sm:col-span-2"><input className="stitch-input" {...register("address", { required: true })} /></Field>
                <Field label="Username" className="sm:col-span-2">
                  <input className="stitch-input" autoComplete="username" {...register("username", { required: true, minLength: 3, pattern: /^[a-zA-Z0-9._-]+$/ })} />
                </Field>
                <Field label="Password" className="sm:col-span-2">
                  <input className="stitch-input" type="password" {...register("password", { required: true, minLength: 6 })} />
                </Field>

                {error && <p className="sm:col-span-2 rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">{error}</p>}
                <div className="sm:col-span-2">
                  <Button className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? "Creating account…" : "Create account"}
                  </Button>
                </div>
              </form>
            </>
          ) : (
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
                {isSubmitting ? "Creating account…" : "Verify & create account"}
              </Button>
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  className="font-semibold text-on-surface-variant hover:underline"
                  onClick={() => { setStep("form"); setError(""); setInfo(""); }}
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
          )}

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
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1.5 block font-medium text-on-surface-variant">{label}</span>
      {children}
    </label>
  );
}
