-- Allow mixed Others pickup labels (e.g. "10 kg + 2 liters + 4 head")
ALTER TABLE "cargo_requests" ALTER COLUMN "weight" TYPE VARCHAR(120);
