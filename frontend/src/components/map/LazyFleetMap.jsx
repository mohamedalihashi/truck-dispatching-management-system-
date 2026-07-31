import { lazy, Suspense } from "react";

const FleetMap = lazy(() =>
  import("./FleetMap").then((module) => ({ default: module.FleetMap }))
);

function MapSkeleton({ className = "" }) {
  return (
    <div
      className={`flex animate-pulse items-center justify-center bg-surface-container-low text-sm text-on-surface-variant ${className}`}
      aria-hidden
    >
      Loading map…
    </div>
  );
}

export function LazyFleetMap(props) {
  return (
    <Suspense fallback={<MapSkeleton className={props.className} />}>
      <FleetMap {...props} />
    </Suspense>
  );
}
