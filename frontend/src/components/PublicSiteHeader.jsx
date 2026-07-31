import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Home,
  LayoutDashboard,
  LogIn,
  Menu,
  Truck,
  UserPlus,
  X
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useLanguage } from "../contexts/LanguageContext";
import { ThemeToggle } from "./ThemeToggle";
import { LanguageToggle } from "./LanguageToggle";
import { BrandLogo } from "./BrandLogo";
import { roleHome } from "../utils/helpers";

const LANDING_LINKS = [
  { href: "#features", labelKey: "public.features" },
  { href: "#process", labelKey: "public.howItWorks" },
  { href: "#testimonials", labelKey: "public.clients" }
];

const PUBLIC_ROUTES = [
  { to: "/trucks", labelKey: "public.browseTrucks" }
];

export function PublicSiteHeader({ variant = "landing", className = "" }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeAnchor, setActiveAnchor] = useState("");
  const { isAuthenticated, user } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const showLandingNav = variant === "landing" || variant === "public";
  const onHome = location.pathname === "/";
  const onLoginPage = location.pathname === "/login";
  const onRegisterPage = location.pathname === "/register";
  const primaryAuthClass =
    "rounded-lg bg-secondary-container px-6 py-2.5 text-sm font-semibold text-on-secondary shadow-md transition hover:shadow-lg active:scale-95";
  const mobilePrimaryAuthClass =
    "flex items-center gap-3 rounded-lg bg-secondary-container px-3 py-3 text-sm font-semibold text-on-secondary";

  useEffect(() => {
    if (!showLandingNav || !onHome) {
      setActiveAnchor("");
      return;
    }

    const sections = LANDING_LINKS
      .map((link) => ({
        href: link.href,
        element: document.querySelector(link.href)
      }))
      .filter((entry) => entry.element);

    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!visible) return;
        const match = sections.find((section) => section.element === visible.target);
        if (match) setActiveAnchor(match.href);
      },
      {
        rootMargin: "-35% 0px -45% 0px",
        threshold: [0.2, 0.4, 0.6]
      }
    );

    sections.forEach((section) => observer.observe(section.element));
    return () => observer.disconnect();
  }, [location.pathname, showLandingNav, onHome]);

  function closeMenu() {
    setMenuOpen(false);
  }

  function goAnchor(href) {
    closeMenu();
    setActiveAnchor(href);
    if (onHome) {
      document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    const hash = href.startsWith("#") ? href.slice(1) : href;
    navigate({ pathname: "/", hash });
  }

  return (
    <>
      <header
        className={`glass-effect fixed inset-x-0 top-0 z-50 h-16 border-b border-outline-variant/20 px-4 pt-[env(safe-area-inset-top)] sm:h-20 sm:px-6 md:px-12 ${className}`}
      >
        <nav className="mx-auto flex h-full max-w-7xl items-center justify-between">
          <Link to="/" className="flex min-w-0 items-center" onClick={closeMenu}>
            <BrandLogo size="sm" linkToHome={false} className="max-h-10 sm:max-h-12" />
          </Link>

          <div className="hidden items-center gap-8 lg:flex">
            {PUBLIC_ROUTES.map((link) => (
              <Link
                key={link.to}
                className={`text-sm font-semibold transition ${
                  location.pathname === link.to
                    ? "text-secondary"
                    : "text-on-surface-variant hover:text-secondary"
                }`}
                to={link.to}
              >
                {t(link.labelKey)}
              </Link>
            ))}
            {showLandingNav
              ? LANDING_LINKS.map((link) => (
                  <button
                    key={link.href}
                    type="button"
                    onClick={() => goAnchor(link.href)}
                    className={`text-sm font-semibold transition ${
                      activeAnchor === link.href
                        ? "text-secondary"
                        : "text-on-surface-variant hover:text-secondary"
                    }`}
                  >
                    {t(link.labelKey)}
                  </button>
                ))
              : null}
            <div className="h-6 w-px bg-outline-variant" />
            <LanguageToggle />
            <ThemeToggle />
            <div className="h-6 w-px bg-outline-variant" />
            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => navigate(roleHome(user.role))}
                className="rounded-lg bg-secondary-container px-6 py-2.5 text-sm font-semibold text-on-secondary shadow-md"
              >
                {t("public.openDashboard")}
              </button>
            ) : onRegisterPage ? (
              <Link to="/login" className={primaryAuthClass}>
                {t("public.logIn")}
              </Link>
            ) : onLoginPage ? (
              <Link to="/register" className={primaryAuthClass}>
                {t("public.register")}
              </Link>
            ) : (
              <>
                <Link className="text-sm font-semibold text-primary hover:text-secondary-container" to="/login">
                  {t("public.logIn")}
                </Link>
                <Link to="/register" className={primaryAuthClass}>
                  {t("public.register")}
                </Link>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <LanguageToggle compact />
            <ThemeToggle />
            <button
              type="button"
              className="rounded-lg border border-outline-variant p-2.5 text-on-surface"
              onClick={() => setMenuOpen(true)}
              aria-label={t("common.openMenu")}
            >
              <Menu size={20} />
            </button>
          </div>
        </nav>
      </header>

      {menuOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-[60] bg-black/40 lg:hidden"
          onClick={closeMenu}
          aria-label="Close menu overlay"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 right-0 z-[70] flex w-[min(100%,300px)] flex-col border-l border-outline-variant/30 bg-surface-container-lowest p-5 shadow-2xl transition duration-300 lg:hidden ${
          menuOpen ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top))" }}
      >
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm font-bold uppercase tracking-wide text-on-surface-variant">{t("common.menu")}</p>
          <button type="button" className="rounded-lg p-1.5 hover:bg-surface-container" onClick={closeMenu} aria-label={t("common.closeMenu")}>
            <X size={18} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {PUBLIC_ROUTES.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={closeMenu}
              className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold transition ${
                location.pathname === link.to
                  ? "bg-secondary-container/10 text-secondary"
                  : "text-on-surface hover:bg-surface-container"
              }`}
            >
              <Truck size={18} />
              {t(link.labelKey)}
            </Link>
          ))}
          {showLandingNav
            ? LANDING_LINKS.map((link) => (
                <button
                  key={link.href}
                  type="button"
                  onClick={() => goAnchor(link.href)}
                  className={`rounded-lg px-3 py-3 text-left text-sm font-semibold transition ${
                    activeAnchor === link.href
                      ? "bg-secondary-container/10 text-secondary"
                      : "text-on-surface hover:bg-surface-container"
                  }`}
                >
                  {t(link.labelKey)}
                </button>
              ))
            : (
              <button
                type="button"
                onClick={() => {
                  closeMenu();
                  navigate("/");
                }}
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-semibold text-on-surface hover:bg-surface-container"
              >
                <Home size={18} />
                {t("public.home")}
              </button>
            )}

          <div className="my-3 h-px bg-outline-variant/40" />

          {isAuthenticated ? (
            <button
              type="button"
              onClick={() => {
                closeMenu();
                navigate(roleHome(user.role));
              }}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-semibold text-on-surface hover:bg-surface-container"
            >
              <LayoutDashboard size={18} />
              {t("public.openDashboard")}
            </button>
          ) : onRegisterPage ? (
            <Link to="/login" onClick={closeMenu} className={mobilePrimaryAuthClass}>
              <LogIn size={18} />
              {t("public.logIn")}
            </Link>
          ) : onLoginPage ? (
            <Link to="/register" onClick={closeMenu} className={mobilePrimaryAuthClass}>
              <UserPlus size={18} />
              {t("public.register")}
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                onClick={closeMenu}
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold text-on-surface hover:bg-surface-container"
              >
                <LogIn size={18} />
                {t("public.logIn")}
              </Link>
              <Link to="/register" onClick={closeMenu} className={mobilePrimaryAuthClass}>
                <UserPlus size={18} />
                {t("public.register")}
              </Link>
            </>
          )}
        </nav>
      </aside>
    </>
  );
}
