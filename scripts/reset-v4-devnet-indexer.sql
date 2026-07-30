\set ON_ERROR_STOP on

DELETE FROM rounds WHERE chain_id=31337;
DELETE FROM chain_events WHERE chain_id=31337;
DELETE FROM canonical_blocks WHERE chain_id=31337;
DELETE FROM indexer_checkpoints WHERE chain_id=31337;
DELETE FROM service_heartbeats
WHERE chain_id=31337 AND service='chain-indexer';
