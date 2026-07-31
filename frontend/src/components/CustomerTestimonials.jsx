import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, MapPin, Star } from "lucide-react";
import { api } from "../services/api";

function usePageSize() {
  const [pageSize, setPageSize] = useState(3);

  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px)");
    const medium = window.matchMedia("(min-width: 768px)");
    const update = () => setPageSize(wide.matches ? 3 : medium.matches ? 2 : 1);
    update();
    wide.addEventListener("change", update);
    medium.addEventListener("change", update);
    return () => {
      wide.removeEventListener("change", update);
      medium.removeEventListener("change", update);
    };
  }, []);

  return pageSize;
}

function initials(name) {
  const parts = String(name || "C").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "C";
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function CustomerTestimonials() {
  const pageSize = usePageSize();
  const [page, setPage] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["public-testimonials"],
    queryFn: () => api.listPublicTestimonials({ limit: 24 })
  });

  const items = data?.data || [];
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount, pageSize]);

  const visible = useMemo(() => {
    const start = page * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  function goPrev() {
    setPage((current) => (current - 1 + pageCount) % pageCount);
  }

  function goNext() {
    setPage((current) => (current + 1) % pageCount);
  }

  return (
    <section id="testimonials" className="overflow-hidden py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-16 flex flex-col items-end justify-between gap-4 lg:flex-row">
          <div className="max-w-xl">
            <h2 className="text-[32px] font-bold text-primary">What Our Customers Say</h2>
            <p className="mt-4 text-on-surface-variant">
              Real reviews from customers after their shipments are delivered on GaariHel.
            </p>
          </div>
          {items.length > pageSize ? (
            <div className="flex gap-4">
              <button
                type="button"
                onClick={goPrev}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-outline-variant transition hover:bg-secondary-container hover:text-white"
                aria-label="Previous reviews"
              >
                <ChevronLeft />
              </button>
              <button
                type="button"
                onClick={goNext}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-outline-variant transition hover:bg-secondary-container hover:text-white"
                aria-label="Next reviews"
              >
                <ChevronRight />
              </button>
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <p className="py-16 text-center text-sm text-on-surface-variant">Loading customer reviews…</p>
        ) : !items.length ? (
          <div className="rounded-3xl border border-outline-variant/30 bg-surface-container-lowest p-10 text-center">
            <p className="font-semibold text-on-surface">No public reviews yet</p>
            <p className="mt-2 text-sm text-on-surface-variant">
              When customers rate their delivered trips, their feedback will appear here automatically.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              {visible.map((item) => (
                <article
                  key={item.id}
                  className="rounded-3xl border border-outline-variant/30 bg-surface-container-lowest p-6 shadow-sm"
                >
                  <div className="mb-4 flex gap-1 text-secondary-container">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Star
                        key={index}
                        size={18}
                        fill={index < item.rating ? "currentColor" : "none"}
                        className={index < item.rating ? "" : "text-outline-variant"}
                      />
                    ))}
                  </div>
                  <p className="mb-8 text-lg italic text-primary">&ldquo;{item.comment}&rdquo;</p>
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary-container/15 text-sm font-bold text-secondary-container">
                      {initials(item.customerName)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-primary">{item.customerName}</p>
                      <p className="flex items-center gap-1 text-xs text-on-surface-variant">
                        {item.customerCity ? (
                          <>
                            <MapPin size={12} />
                            {item.customerCity}
                          </>
                        ) : item.route ? (
                          item.route
                        ) : (
                          "Verified customer"
                        )}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {items.length > pageSize ? (
              <p className="mt-8 text-center text-sm text-on-surface-variant">
                Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, items.length)} of {items.length} reviews
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
