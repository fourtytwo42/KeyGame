\pset pager off

SELECT service,block_number,updated_at
FROM indexer_checkpoints
WHERE chain_id=31337;

SELECT count(*) AS rounds,min(round_id),max(round_id)
FROM rounds
WHERE chain_id=31337;

SELECT round_id,deployment_block,contract_address
FROM rounds
WHERE chain_id=31337
ORDER BY round_id
LIMIT 8;

SELECT event_name,count(*)
FROM chain_events
WHERE chain_id=31337
GROUP BY event_name
ORDER BY event_name;

SELECT count(*) AS contributions,
       coalesce(sum(usdg_amount),0) AS usdg,
       coalesce(sum(points),0) AS points
FROM stock_pot_contributions
WHERE deployment_key LIKE '31337:%';
