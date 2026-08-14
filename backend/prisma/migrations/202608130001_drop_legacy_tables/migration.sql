-- Remove unused legacy tables: bids, dispatcher_profiles, truck_types
DROP TABLE IF EXISTS "bids";
DROP TABLE IF EXISTS "dispatcher_profiles";
DROP TABLE IF EXISTS "truck_types";
DROP TYPE IF EXISTS "bid_status";
