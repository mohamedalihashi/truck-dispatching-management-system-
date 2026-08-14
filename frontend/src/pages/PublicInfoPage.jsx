import { Link, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PublicSiteHeader } from "../components/PublicSiteHeader";
import { BrandLogo } from "../components/BrandLogo";
import { APP_NAME } from "../brand";

const PAGES = {
  about: {
    title: "About Us",
    body: [
      `${APP_NAME} is a Somalia-focused truck and cargo Management system. Customers submit cargo requests; admins assign drivers; drivers run the trips.`,
      "Submit a request, wait for admin assignment, follow trip status updates, confirm delivery, then pay 100% with WaafiPay (EVC / ZAAD).",
      "Only customers self-register. Drivers are created by an admin (one driver = one truck) so assignment and accountability stay clear."
    ]
  },
  contact: {
    title: "Contact",
    body: [
      "Need help with a cargo request, driver registration, or your account?",
      `Email support: ${import.meta.env.VITE_SUPPORT_EMAIL || "support@gaarihel.so"}`,
      `Phone / WhatsApp: ${import.meta.env.VITE_SUPPORT_PHONE || "+252 61 XXX XXXX"}`,
      "Drivers: contact support or an admin to be added to the fleet. Customers: use Forgot Password on the login page if you cannot sign in."
    ]
  },
  help: {
    title: "Help Center",
    body: [
      "Customer: create an account → submit a cargo request → admin assigns a driver → follow trip status → pay 100% after Delivered.",
      "Driver: admin registers you → receive assigned jobs → update status (arrived → loaded → in transit → delivered) → upload POD → get paid.",
      "Admin: register drivers, review all customer requests, assign drivers/trucks, manage payments, payouts, and reports."
    ]
  },
  faqs: {
    title: "FAQs",
    body: [
      "How do I become a driver? Only an admin can create your account. Contact support with license and truck documents.",
      "How do I book cargo? Register as a customer, submit a request. An admin assigns a driver — you do not contact drivers directly.",
      "How do payments work? For FTL, pay 100% after Delivered via WaafiPay. Shared trips pay full fare before pickup. Earnings follow platform commission settings.",
      "Where is proof of delivery stored? With Cloudinary when configured; otherwise on the API server under /uploads."
    ]
  },
  terms: {
    title: "Terms & Conditions",
    body: [
      "By using GaariHel you agree to provide accurate booking, vehicle, and contact information.",
      "Customers submit requests through the platform. Direct off-platform deals with drivers are not supported.",
      "Drivers are responsible for trip updates and delivery proof. Customers pay 100% after confirmed delivery (FTL).",
      "The platform may suspend accounts that abuse pricing or payment disputes.",
      "Platform commission and payout rules follow the admin commission settings at the time of payment.",
      "Contact support for dispute escalation. These terms may be updated; continued use means acceptance of the latest version."
    ]
  },
  privacy: {
    title: "Privacy Policy",
    body: [
      "We store account data (name, email, phone, role), cargo and trip records, payment references, and uploaded proof images.",
      "Payment card data is not stored by GaariHel; mobile wallet charges go through WaafiPay.",
      "Driver phone numbers are not shared with customers for direct contact.",
      "Documents such as licenses and truck papers are stored for admin verification and operational use.",
      `Contact ${import.meta.env.VITE_SUPPORT_EMAIL || "support@truckdispatch.so"} to request account correction or deletion subject to legal and operational retention needs.`
    ]
  }
};

export function PublicInfoPage() {
  const { pathname } = useLocation();
  const slug = pathname.replace(/^\//, "");
  const page = PAGES[slug] || PAGES.about;

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <PublicSiteHeader variant="public" />
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-[calc(5rem+env(safe-area-inset-top))]">
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-secondary-container hover:underline">
          <ArrowLeft size={16} /> Back home
        </Link>
        <div className="mb-8">
          <BrandLogo size="sm" linkToHome={false} />
        </div>
        <h1 className="text-3xl font-bold text-primary">{page.title}</h1>
        <div className="mt-6 space-y-4 text-on-surface-variant">
          {page.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </main>
    </div>
  );
}
