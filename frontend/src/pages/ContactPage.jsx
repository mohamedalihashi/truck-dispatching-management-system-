import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, MessageCircle, Phone, Send } from "lucide-react";
import { PublicSiteHeader } from "../components/PublicSiteHeader";
import { BrandLogo } from "../components/BrandLogo";
import { Button } from "../components/ui/Button";
import { APP_NAME } from "../brand";
import { useLanguage } from "../contexts/LanguageContext";
import { useSupportContact } from "../hooks/useApi";
import { api } from "../services/api";

function whatsappHref(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits || digits.length < 7) return null;
  return `https://wa.me/${digits}`;
}

function isPlaceholder(value) {
  const v = String(value || "").trim();
  return !v || /XXX/i.test(v);
}

export function ContactPage() {
  const { language, t } = useLanguage();
  const so = language === "so";
  const { data: supportContact, isLoading, isError } = useSupportContact();
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [sentHint, setSentHint] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const supportEmail = String(supportContact?.supportEmail || "").trim();
  const supportPhone = String(supportContact?.supportPhone || "").trim();
  const wa = whatsappHref(supportPhone);

  function update(field) {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSentHint("");
    setSending(true);
    try {
      const result = await api.createContactMessage({
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim(),
        message: form.message.trim(),
      });
      setForm({ name: "", email: "", phone: "", message: "" });
      setSentHint(
        result?.message ||
          (so
            ? "Fariinta waa la kaydiyay. Support ayaa ku soo noqon doona."
            : "Message saved. Support will get back to you soon.")
      );
    } catch (err) {
      setError(err.message || (so ? "Fariinta lama diri karin" : "Could not send message"));
    } finally {
      setSending(false);
    }
  }

  const channels = [
    {
      icon: Mail,
      label: so ? "Email" : "Email",
      value: isPlaceholder(supportEmail)
        ? so
          ? "Lama dejin Settings"
          : "Not set in Settings"
        : supportEmail,
      href: isPlaceholder(supportEmail) ? null : `mailto:${supportEmail}`,
      action: so ? "Dir email" : "Send email",
    },
    {
      icon: Phone,
      label: so ? "Telefoon" : "Phone",
      value: isPlaceholder(supportPhone)
        ? so
          ? "Lama dejin Settings"
          : "Not set in Settings"
        : supportPhone,
      href: isPlaceholder(supportPhone) ? null : `tel:${supportPhone.replace(/\s/g, "")}`,
      action: so ? "Wac" : "Call",
    },
    {
      icon: MessageCircle,
      label: "WhatsApp",
      value: isPlaceholder(supportPhone)
        ? so
          ? "Lama dejin Settings"
          : "Not set in Settings"
        : supportPhone,
      href: wa,
      action: so ? "Fur WhatsApp" : "Open WhatsApp",
    },
  ];

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <PublicSiteHeader variant="public" />

      <main className="pt-[calc(4rem+env(safe-area-inset-top))] sm:pt-20">
        <section className="hero-gradient relative overflow-hidden px-6 py-16 text-white sm:py-20">
          <div className="pointer-events-none absolute inset-0 opacity-15">
            <div className="absolute left-[-8%] bottom-0 h-[360px] w-[360px] rounded-full bg-secondary-container blur-[100px]" />
          </div>
          <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-start gap-8 sm:flex-row sm:items-center sm:gap-12">
            <div className="shrink-0 rounded-2xl bg-white/95 p-4 shadow-lg sm:p-5">
              <BrandLogo size="lg" layout="stack" linkToHome showTagline tone="default" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary-fixed">
                {so ? "Taageero" : "Support"}
              </p>
              <h1 className="mt-3 text-4xl font-extrabold tracking-tight sm:text-5xl">
                {so ? "Nala soo xiriir" : "Contact us"}
              </h1>
              <p className="mt-4 max-w-2xl text-lg text-on-primary-container">
                {so
                  ? "Kaalmayn booking, akoon, ama diiwaangelinta darawalka — kooxda operations ayaa kuu diyaar."
                  : "Help with booking, your account, or driver registration — our operations team is ready."}
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-10 px-6 py-14 lg:grid-cols-2">
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-primary">
              {so ? "Siyaabaha xiriirka" : "Reach us"}
            </h2>
            {isLoading ? (
              <p className="text-sm text-on-surface-variant">
                {so ? "Waa la soo rarayaa Settings…" : "Loading support contacts…"}
              </p>
            ) : null}
            {isError ? (
              <p className="rounded-lg bg-error/10 px-3 py-2 text-sm text-error">
                {so
                  ? "Lama heli karin xiriirka support. Hubi in server-ku shaqeynayo."
                  : "Could not load support contacts. Check that the API is running."}
              </p>
            ) : null}
            {channels.map(({ icon: Icon, label, value, href, action }) => (
              <div
                key={label}
                className="flex items-start gap-4 rounded-2xl border border-outline-variant bg-surface-container-lowest p-5"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary-fixed text-secondary">
                  <Icon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                    {label}
                  </p>
                  <p className="mt-1 break-all font-semibold text-on-surface">{value}</p>
                  {href ? (
                    <a
                      href={href}
                      target={href.startsWith("http") ? "_blank" : undefined}
                      rel={href.startsWith("http") ? "noreferrer" : undefined}
                      className="mt-2 inline-block text-sm font-semibold text-secondary-container hover:underline"
                    >
                      {action}
                    </a>
                  ) : (
                    <p className="mt-2 text-xs text-on-surface-variant">
                      {so
                        ? "Admin: Settings → Support email / phone"
                        : "Admin: Settings → Support email / phone"}
                    </p>
                  )}
                </div>
              </div>
            ))}
            <p className="text-sm text-on-surface-variant">
              {so
                ? "Darawal: nala soo xiriir si admin uu kuu diiwaangeliyo. Macmiil: isticmaal Forgot Password haddii aadan soo geli karin."
                : "Drivers: contact us so an admin can register you. Customers: use Forgot Password on login if you cannot sign in."}
            </p>
          </div>

          <div className="rounded-3xl border border-outline-variant bg-surface-container-lowest p-6 sm:p-8">
            <h2 className="text-xl font-bold text-primary">
              {so ? "Dir fariin" : "Send a message"}
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              {so
                ? "Fariinta waxaa lagu kaydiyaa database — admin Support page ka wuu arki doonaa."
                : "Your message is saved in the database — admins see it on the Support page."}
            </p>
            <form className="mt-6 space-y-4" onSubmit={onSubmit}>
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-on-surface-variant">
                  {so ? "Magaca" : "Name"}
                </span>
                <input
                  className="stitch-input w-full"
                  value={form.name}
                  onChange={update("name")}
                  required
                  maxLength={150}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-on-surface-variant">
                  {so ? "Email (ikhtiyaari)" : "Email (optional)"}
                </span>
                <input
                  className="stitch-input w-full"
                  type="email"
                  value={form.email}
                  onChange={update("email")}
                  maxLength={254}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-on-surface-variant">
                  {so ? "Telefoon" : "Phone"}
                </span>
                <input
                  className="stitch-input w-full"
                  type="tel"
                  value={form.phone}
                  onChange={update("phone")}
                  required
                  maxLength={20}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium text-on-surface-variant">
                  {so ? "Fariinta" : "Message"}
                </span>
                <textarea
                  className="stitch-input min-h-28 w-full"
                  value={form.message}
                  onChange={update("message")}
                  required
                  minLength={10}
                  rows={4}
                  maxLength={2000}
                />
              </label>
              {error ? <p className="text-sm text-error">{error}</p> : null}
              {sentHint ? (
                <p className="rounded-lg bg-secondary-fixed/30 px-3 py-2 text-sm text-on-surface">
                  {sentHint}
                </p>
              ) : null}
              <Button type="submit" className="w-full gap-2" disabled={sending}>
                <Send size={16} />
                {sending
                  ? so
                    ? "Waa la dirayaa…"
                    : "Sending…"
                  : so
                    ? "Dir fariinta"
                    : "Send message"}
              </Button>
            </form>
          </div>
        </section>
      </main>

      <footer className="border-t border-outline-variant px-6 py-8 text-center text-sm text-on-surface-variant">
        © {new Date().getFullYear()} {APP_NAME}.{" "}
        <Link to="/about" className="font-semibold text-primary hover:underline">
          {t("public.about")}
        </Link>
        {" · "}
        <Link to="/" className="font-semibold text-primary hover:underline">
          {t("public.home")}
        </Link>
      </footer>
    </div>
  );
}
