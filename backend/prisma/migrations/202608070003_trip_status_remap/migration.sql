-- Remap legacy trip/request statuses onto the simplified flow.
-- Must run after 202608070002 (new enum values committed).

UPDATE "trips" SET "status" = 'En Route to Pickup' WHERE "status"::text = 'Accepted';
UPDATE "trips" SET "status" = 'Arrived at Pickup' WHERE "status"::text = 'Arrived Pickup';
UPDATE "trips" SET "status" = 'Picked Up' WHERE "status"::text = 'Loaded';
UPDATE "trips" SET "status" = 'In Transit' WHERE "status"::text = 'Delayed';

UPDATE "cargo_requests" SET "status" = 'En Route to Pickup' WHERE "status"::text = 'Accepted';
UPDATE "cargo_requests" SET "status" = 'Arrived at Pickup' WHERE "status"::text = 'Arrived Pickup';
UPDATE "cargo_requests" SET "status" = 'Picked Up' WHERE "status"::text = 'Loaded';
