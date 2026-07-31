import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  ClipboardEdit,
  FileText,
  Globe,
  Navigation,
  Shield,
  Share2,
  Truck,
  User,
  Video
} from "lucide-react";
import { PublicSiteHeader } from "../components/PublicSiteHeader";
import { PublicTrucksCatalog } from "../components/PublicTrucksCatalog";
import { CustomerTestimonials } from "../components/CustomerTestimonials";
import { HeroTruckCarousel } from "../components/HeroTruckCarousel";
import { BrandLogo } from "../components/BrandLogo";
import { APP_NAME, APP_TAGLINE } from "../brand";
import { useLanguage } from "../contexts/LanguageContext";

const AVATARS = [
  "https://lh3.googleusercontent.com/aida-public/AB6AXuC77B6eY93wbbmNYtn9GWLcwb02QYua2jxm-nexWh2HUes8kHlSRspl7rhnK6m-tg1V0yy6f_t7VJt1fQl3EqsLdjVzs33hOYahB5DVu1cvhxIkCJ1Xo7QuupxRaOvMRh3ZNrKlWsEYkgYiZhMyeqxnrpYFMmNhpMskL05feXSVmeE2B9nvp2Tl5FstCcEzN14RniK568MqZSFFjjb34k5ZIaHl0SR7Kv8KV0vqYPzYV3MHGEyaGqsmK6zWYg8q2HNz9TipvsrtkRE",
  "https://lh3.googleusercontent.com/aida-public/AB6AXuA3HA9XQzJ_yZllijQOa-Ek2xig9lietI-DnFW6yMC9Cpxi6IPjV4ncf_GILLwW27bw0awvxqn95rrp6y1xW-H1c1HC7EeXF_Lyr5_LTCLYISM3uQueSLT-bOSDMN8o2zyFG-DQcLIDy-DDZfektJP7oWOQbSqRVUt2N9wL01QHohqJcqlrSkSOb7kda1ZhPjF1xM_c1vP21ycujAa84KsmaP-8REtja6s1s8Lezvn-Vkp2q6l_nM2NIZGTomTku8Hhzhdbdl58XtE",
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCiheeQ4vnfX2DZ_2hRSMDXb7Xu8tqPX208ff-P76Nvu9EKKUQ0IWRZF-rOYA09zTo3HnnpbQYxcPVfVVhWX6KN6KFcUZRcUoCxk0sTJEk7qrGbSOy8JuHYfxDyxwmvxuKwfm9PtI0ZB223_6q8xM0K_D04CQTTYC8os3WJsiTYq_6FpJGsfOV75Q04M25f-jzewqVCmVh3d3-cLxYXidHavgNg1zfe_KIoXS4lRkY3bKQqOLW-y-k05xX6EmGexD3J9zSTWq9vaWs"
];

export function LandingPage() {
  const { hash } = useLocation();
  const { t } = useLanguage();

  useEffect(() => {
    if (!hash) return;
    const id = hash.replace("#", "");
    const element = document.getElementById(id);
    if (!element) return;

    const timer = window.setTimeout(() => {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [hash]);

  return (
    <div className="bg-background text-on-surface selection:bg-secondary-fixed selection:text-on-secondary-fixed">
      <PublicSiteHeader variant="landing" />

      <main className="pt-[calc(4rem+env(safe-area-inset-top))] sm:pt-20">
        <section className="hero-gradient relative flex min-h-[min(100svh,720px)] items-start overflow-hidden sm:min-h-[760px]">
          <div className="pointer-events-none absolute inset-0 opacity-10">
            <div className="absolute right-[-10%] top-20 h-[600px] w-[600px] rounded-full bg-secondary-container blur-[120px]" />
            <div className="absolute bottom-[-10%] left-[-5%] h-[400px] w-[400px] rounded-full bg-tertiary-fixed-dim blur-[100px]" />
          </div>
          <div className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-8 px-6 pb-14 pt-8 sm:pt-10 lg:grid-cols-2 lg:px-6 lg:pb-16 lg:pt-12">
            <div className="space-y-4 text-white">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-on-primary-fixed-variant/20 px-4 py-1.5 backdrop-blur-md">
                <span className="h-2 w-2 animate-pulse rounded-full bg-secondary-container" />
                <span className="text-xs font-medium uppercase tracking-widest text-secondary-fixed">{t("landing.badge")}</span>
              </div>
              <h1 className="text-5xl font-extrabold leading-[1.1] md:text-6xl">
                {t("landing.title")}
                <br />
                <span className="text-secondary-fixed-dim">{t("landing.titleAccent")}</span>
              </h1>
              <p className="max-w-lg text-lg text-on-primary-container">
                {t("landing.subtitle")}
              </p>
              <div className="flex flex-wrap gap-4 pt-2">
                <Link
                  to="/register"
                  className="group flex items-center gap-2 rounded-xl bg-secondary-container px-8 py-4 text-sm font-semibold text-on-secondary transition hover:shadow-xl"
                >
                  {t("landing.registerCta")} <ArrowRight className="transition group-hover:translate-x-1" size={18} />
                </Link>
                <Link
                  to="/trucks"
                  className="rounded-xl border border-white/20 bg-white/10 px-8 py-4 text-sm font-semibold text-white backdrop-blur-md hover:bg-white/20"
                >
                  {t("landing.browseCta")}
                </Link>
                <Link
                  to="/login"
                  className="rounded-xl border border-white/20 bg-white/10 px-8 py-4 text-sm font-semibold text-white backdrop-blur-md hover:bg-white/20"
                >
                  Explore Platform
                </Link>
              </div>
              <div className="flex items-center gap-8 border-t border-white/10 pt-8">
                <div className="flex -space-x-3">
                  {AVATARS.map((src) => (
                    <img key={src} src={src} alt="" className="h-10 w-10 rounded-full border-2 border-[#0d1c32] object-cover" />
                  ))}
                </div>
                <p className="text-xs text-on-primary-container">
                  Trusted by <span className="font-bold text-white">10,000+</span> GaariHel professionals worldwide
                </p>
              </div>
            </div>

            <HeroTruckCarousel className="mt-4 lg:mt-0" />
          </div>
        </section>

        <section className="bg-primary py-12">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-6 lg:grid-cols-4">
            {[
              ["25K+", "Deliveries Completed"],
              ["10K+", "Happy Customers"],
              ["5K+", "Trucks on Road"],
              ["99%", "On-Time Delivery"]
            ].map(([value, label]) => (
              <div key={label} className="text-center">
                <p className="text-2xl font-semibold text-white md:text-[24px]">{value}</p>
                <p className="mt-1 text-xs font-medium uppercase tracking-widest text-on-primary-container">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="px-6 py-24">
          <div className="mx-auto max-w-7xl">
            <div className="mb-16 space-y-4 text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-secondary">{t("Platform Excellence")}</p>
              <h2 className="text-[32px] font-bold tracking-tight text-primary">{t("landing.featuresTitle")}</h2>
              <p className="mx-auto max-w-2xl text-on-surface-variant">
                {t("We provide the most robust infrastructure for modern truck dispatch, built for precision and speed.")}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <article className="bento-card flex flex-col justify-between rounded-3xl border border-outline-variant/30 bg-surface-container-lowest p-6 md:col-span-1">
                <div>
                  <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary-fixed text-secondary">
                    <Shield size={28} />
                  </div>
                  <h3 className="mb-4 text-xl font-semibold text-primary">{t("Reliable & Safe")}</h3>
                  <p className="text-on-surface-variant">{t("Every truck and driver on our platform undergoes a rigorous 5-step verification process to ensure safety.")}</p>
                </div>
              </article>
              <article className="bento-card relative min-h-[300px] overflow-hidden rounded-3xl bg-primary-container p-6 text-white md:col-span-2">
                <div className="relative z-10 flex h-full flex-col justify-between">
                  <div>
                    <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 backdrop-blur">
                      <Navigation size={28} />
                    </div>
                    <h3 className="mb-4 text-xl font-semibold">{t("Real-time Tracking")}</h3>
                    <p className="max-w-md text-on-primary-container">{t("GPS integration across all fleet vehicles provides sub-meter accuracy for real-time shipment monitoring and predictive ETA.")}</p>
                  </div>
                  <div className="mt-8 flex gap-2">
                    <div className="h-1.5 w-12 rounded-full bg-secondary-container" />
                    <div className="h-1.5 w-6 rounded-full bg-white/20" />
                    <div className="h-1.5 w-6 rounded-full bg-white/20" />
                  </div>
                </div>
                <div className="pointer-events-none absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-secondary-container/20 to-transparent opacity-30" />
              </article>
              <article className="bento-card flex min-h-[300px] items-center gap-8 rounded-3xl border border-outline-variant/30 bg-surface-container-low p-6 md:col-span-2">
                <div className="flex-1">
                  <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-on-tertiary-container/10 text-on-tertiary-container">
                    <BookOpen size={28} />
                  </div>
                  <h3 className="mb-4 text-xl font-semibold text-primary">{t("Easy Booking")}</h3>
                  <p className="max-w-sm text-on-surface-variant">{t("Browse FTL trucks and shared loads, view details first, then book directly with the driver in a few taps.")}</p>
                </div>
                <div className="hidden w-1/3 rotate-3 aspect-square rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-4 shadow-inner sm:block">
                  <div className="flex h-full w-full flex-col gap-2 rounded-lg bg-surface-container-high p-2">
                    <div className="h-4 w-3/4 rounded bg-outline-variant/20" />
                    <div className="h-4 w-1/2 rounded bg-outline-variant/20" />
                    <div className="mt-auto h-8 w-full rounded bg-secondary-container/10" />
                  </div>
                </div>
              </article>
              <article className="bento-card flex flex-col justify-between rounded-3xl border border-outline-variant/30 bg-surface-container-lowest p-6 md:col-span-1">
                <div>
                  <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50 text-green-600">
                    <FileText size={28} />
                  </div>
                  <h3 className="mb-4 text-xl font-semibold text-primary">{t("Secure Payments")}</h3>
                  <p className="text-on-surface-variant">{t("Multi-layer encryption and escrow-based payment releases ensure every transaction is protected and transparent.")}</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section id="process" className="bg-surface-container-lowest py-24">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-20 text-center">
              <h2 className="text-[32px] font-bold text-primary">{t("landing.processTitle")}</h2>
              <p className="mt-4 text-on-surface-variant">
                {t("From browsing to delivery — customers and drivers connect directly on one marketplace")}
              </p>
            </div>
            <div className="relative">
              <div className="absolute left-0 top-12 hidden h-[2px] w-full border-t border-dashed border-outline-variant lg:block" />
              <div className="relative z-10 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
                {[
                  [Truck, "1. Browse Trucks & Loads", "See FTL trucks and shared trips together. Filter by type, view full details, then choose what fits."],
                  [ClipboardEdit, "2. Book with the Driver", "Book a full truck or shared capacity. Tell us if you are sending or receiving the cargo — no middleman."],
                  [Navigation, "3. Track in Real Time", "Follow live GPS from pickup to delivery. Drivers update status and share location across Somalia."],
                  [Shield, "4. Deliver & Pay", "Confirm delivery, pay securely with WaafiPay, and the driver receives their share automatically."]
                ].map(([Icon, title, text]) => (
                  <div key={title} className="group text-center">
                    <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full border-4 border-background bg-surface-container-lowest shadow-md transition duration-300 group-hover:border-secondary-container">
                      <Icon className="text-primary" size={36} />
                    </div>
                    <h4 className="mb-2 text-xl font-semibold">{t(title)}</h4>
                    <p className="text-sm text-on-surface-variant">{t(text)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="trucks" className="bg-surface-container-low py-24">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-10 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
              <div>
                <h2 className="text-[32px] font-bold text-primary">Browse Trucks & Loads</h2>
                <p className="mt-3 max-w-2xl text-on-surface-variant">
                  FTL trucks and shared loads together. Filter by service type, view full details, then book when ready.
                </p>
              </div>
              <Link to="/trucks" className="text-sm font-semibold text-secondary-container hover:underline">
                Open full browser
              </Link>
            </div>
            <PublicTrucksCatalog limit={6} compact showViewAll />
          </div>
        </section>

        <CustomerTestimonials />

        <section className="relative overflow-hidden bg-primary-container py-24">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(254,107,0,0.08),transparent)]" />
          <div className="relative z-10 mx-auto max-w-7xl px-6 text-center text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary-fixed-dim">
              Somalia Truck Marketplace
            </p>
            <h2 className="mt-3 text-[32px] font-bold">Join the GaariHel Marketplace</h2>
            <p className="mx-auto mt-4 max-w-2xl text-on-primary-container">
              Browse FTL trucks and shared loads, book directly with drivers, and track every shipment across Somalia.
            </p>
            <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
              {[
                {
                  icon: User,
                  title: "Customer",
                  text: "Browse trucks, book FTL or shared capacity, track shipments, and pay after delivery.",
                  to: "/register",
                  cta: "Create Account"
                },
                {
                  icon: Truck,
                  title: "Driver",
                  text: "Register with your truck, accept FTL jobs, post shared trips, and get paid when customers pay.",
                  to: "/register",
                  cta: "Register as Driver"
                },
                {
                  icon: Shield,
                  title: "Admin",
                  text: "Verify drivers, manage fleet and users, handle payouts, and run platform reports.",
                  to: "/login",
                  cta: "Admin Portal"
                }
              ].map(({ icon: Icon, title, text, to, cta }) => (
                <Link
                  key={title}
                  to={to}
                  className="group rounded-3xl border border-white/10 bg-white/10 p-8 text-left backdrop-blur transition hover:bg-white/20"
                >
                  <Icon className="mb-4 block text-secondary-fixed-dim" size={36} />
                  <h4 className="mb-2 text-xl font-semibold">{title}</h4>
                  <p className="mb-6 text-sm text-on-primary-container">{text}</p>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold group-hover:underline">
                    {cta}
                    <ArrowRight size={16} className="transition group-hover:translate-x-1" />
                  </span>
                </Link>
              ))}
            </div>
            <p className="mt-10 text-sm text-on-primary-container">
              Already registered?{" "}
              <Link to="/login" className="font-semibold text-secondary-fixed-dim underline-offset-4 hover:underline">
                Sign in to your account
              </Link>
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-outline-variant bg-background pb-12 pt-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="mb-6">
                <BrandLogo size="md" linkToHome={false} />
              </div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-secondary">
                {APP_TAGLINE}
              </p>
              <p className="mb-8 text-sm text-on-surface-variant">
                {APP_NAME} connects shippers and drivers for seamless deliveries across Somalia.
              </p>
              <div className="flex gap-4">
                {[Share2, Globe, Video].map((Icon) => (
                  <span key={Icon.name} className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container text-primary">
                    <Icon size={18} />
                  </span>
                ))}
              </div>
            </div>
            <div>
              <h5 className="mb-6 text-sm font-semibold text-primary">Company</h5>
              <ul className="space-y-4 text-on-surface-variant">
                <li><Link to="/about" className="hover:text-primary">About Us</Link></li>
                <li><Link to="/contact" className="hover:text-primary">Contact</Link></li>
                <li><Link to="/register" className="hover:text-primary">Create account</Link></li>
              </ul>
            </div>
            <div>
              <h5 className="mb-6 text-sm font-semibold text-primary">Support</h5>
              <ul className="space-y-4 text-on-surface-variant">
                <li><Link to="/help" className="hover:text-primary">Help Center</Link></li>
                <li><Link to="/faqs" className="hover:text-primary">FAQs</Link></li>
                <li><Link to="/terms" className="hover:text-primary">Terms & Conditions</Link></li>
                <li><Link to="/privacy" className="hover:text-primary">Privacy Policy</Link></li>
              </ul>
            </div>
            <div>
              <h5 className="mb-6 text-sm font-semibold text-primary">Get started</h5>
              <p className="mb-4 text-sm text-on-surface-variant">Book a truck or register as a customer or driver.</p>
              <div className="flex flex-wrap gap-2">
                <Link to="/register" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white">Register</Link>
                <Link to="/login" className="rounded-lg border border-outline-variant px-4 py-2 text-sm font-semibold">Sign in</Link>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center justify-between gap-4 border-t border-outline-variant pt-8 md:flex-row">
            <p className="text-sm text-on-surface-variant">© {new Date().getFullYear()} GaariHel. All rights reserved.</p>
            <div className="flex gap-6 text-sm text-on-surface-variant">
              <Link to="/privacy" className="hover:text-primary">Privacy</Link>
              <Link to="/terms" className="hover:text-primary">Terms</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
