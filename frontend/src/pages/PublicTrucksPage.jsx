import { PublicSiteHeader } from "../components/PublicSiteHeader";
import { PublicTrucksCatalog } from "../components/PublicTrucksCatalog";

export function PublicTrucksPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicSiteHeader variant="public" />
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-24">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-on-surface">Browse Trucks & Loads</h1>
          <p className="mt-2 text-on-surface-variant">
            FTL trucks and shared loads in one place. View details before booking, then filter by service type.
          </p>
        </div>
        <PublicTrucksCatalog />
      </main>
    </div>
  );
}
