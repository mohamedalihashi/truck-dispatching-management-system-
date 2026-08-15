import { ExternalLink, FileText } from "lucide-react";
import { resolveUploadUrl } from "../../config/api.js";

function isLikelyImage(url, forceImage = false) {
  if (!url || String(url).startsWith("mock://")) return false;
  if (forceImage) return true;
  // Local uploads and Cloudinary image URLs often lack a file extension in the path
  if (/\/uploads\//i.test(url) || /res\.cloudinary\.com/i.test(url) || /\/image\//i.test(url)) {
    return true;
  }
  return /\.(jpe?g|png|webp|gif|bmp|heic)(\?|#|$)/i.test(url);
}

export function DocumentCard({ label, url, meta, asImage = false }) {
  if (!url || String(url).startsWith("mock://")) {
    return (
      <div className="rounded-lg border border-dashed border-outline-variant bg-surface-container-low/40 p-3">
        <p className="text-xs font-medium uppercase tracking-wider text-on-surface-variant">{label}</p>
        <p className="mt-2 text-sm text-on-surface-variant">Not uploaded</p>
        {meta ? <p className="mt-1 text-xs text-on-surface-variant">{meta}</p> : null}
      </div>
    );
  }

  const href = resolveUploadUrl(url);
  const image = isLikelyImage(url, asImage);

  return (
    <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest">
      <div className="flex items-center justify-between gap-2 border-b border-outline-variant px-3 py-2">
        <p className="text-xs font-medium uppercase tracking-wider text-on-surface-variant">{label}</p>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-secondary-container hover:underline"
        >
          Open <ExternalLink size={12} />
        </a>
      </div>
      {image ? (
        <a href={href} target="_blank" rel="noreferrer" className="block bg-surface-container-low">
          <img
            src={href}
            alt={label}
            className="max-h-64 w-full object-contain"
            onError={(e) => {
              e.currentTarget.style.display = "none";
              const fallback = e.currentTarget.nextElementSibling;
              if (fallback) fallback.hidden = false;
            }}
          />
          <span hidden className="flex h-40 items-center justify-center text-sm text-on-surface-variant">
            Image failed to load — use Open
          </span>
        </a>
      ) : (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="flex h-40 flex-col items-center justify-center gap-2 bg-surface-container-low text-on-surface-variant hover:bg-surface-container"
        >
          <FileText size={28} className="text-secondary-container" />
          <span className="text-sm font-medium">View document</span>
        </a>
      )}
      {meta ? <p className="border-t border-outline-variant px-3 py-2 text-xs text-on-surface-variant">{meta}</p> : null}
    </div>
  );
}

export function DocumentsGrid({ title = "Documents", children }) {
  return (
    <div className="mt-6 rounded-xl border border-outline-variant bg-surface-container-low/30 p-4">
      <h3 className="mb-3 text-sm font-semibold text-on-surface">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

/** Cargo + delivery proof photos for trip / request View modals. */
export function TripPhotosSection({ cargoImageUrl, deliveryProofUrl, title = "Photos" }) {
  const cargo = cargoImageUrl && !String(cargoImageUrl).startsWith("mock://") ? cargoImageUrl : null;
  const proof = deliveryProofUrl && !String(deliveryProofUrl).startsWith("mock://") ? deliveryProofUrl : null;
  if (!cargo && !proof) return null;

  return (
    <DocumentsGrid title={title}>
      {cargo ? <DocumentCard label="Cargo photo" url={cargo} asImage /> : null}
      {proof ? <DocumentCard label="Delivery proof" url={proof} asImage /> : null}
    </DocumentsGrid>
  );
}
