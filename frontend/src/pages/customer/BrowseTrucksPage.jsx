import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { Button } from "../../components/ui/Button";
import { PublicTrucksCatalog } from "../../components/PublicTrucksCatalog";

export function BrowseTrucksPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-8">
      <PageHeader
        title="FTL Book"
        subtitle="Full truck booking — browse available FTL trucks, view details, then book."
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate("/customer/post-request")}>
              Post open request for bids
            </Button>
            <Button variant="secondary" onClick={() => navigate("/customer/shared-marketplace")}>
              Shared Book instead
            </Button>
          </>
        }
      />
      <PublicTrucksCatalog defaultServiceFilter="ftl" />
    </div>
  );
}
