export const schema = `
CREATE TABLE IF NOT EXISTS wallets (
  address TEXT PRIMARY KEY,
  label TEXT,
  connected_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS token_balances (
  id TEXT PRIMARY KEY,
  wallet TEXT NOT NULL,
  mint TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  decimals INTEGER NOT NULL,
  ui_amount REAL NOT NULL,
  value_usd REAL NOT NULL,
  logo_uri TEXT,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (wallet) REFERENCES wallets(address)
);

CREATE TABLE IF NOT EXISTS positions (
  id TEXT PRIMARY KEY,
  wallet TEXT NOT NULL,
  protocol TEXT NOT NULL,
  strategy TEXT NOT NULL,
  asset TEXT NOT NULL,
  amount REAL NOT NULL,
  value_usd REAL NOT NULL,
  apy REAL NOT NULL,
  apy_sources TEXT NOT NULL, -- JSON
  risk_level TEXT NOT NULL,
  risk_factors TEXT NOT NULL, -- JSON
  entry_timestamp INTEGER NOT NULL,
  last_update INTEGER NOT NULL,
  FOREIGN KEY (wallet) REFERENCES wallets(address)
);

CREATE TABLE IF NOT EXISTS yield_sources (
  id TEXT PRIMARY KEY,
  protocol TEXT NOT NULL,
  strategy TEXT NOT NULL,
  asset TEXT NOT NULL,
  apy REAL NOT NULL,
  apy_sources TEXT NOT NULL, -- JSON
  tvl REAL NOT NULL,
  risk_level TEXT NOT NULL,
  risk_factors TEXT NOT NULL, -- JSON
  managed INTEGER NOT NULL DEFAULT 0,
  audited INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS protocol_snapshots (
  id TEXT PRIMARY KEY,
  protocol TEXT NOT NULL,
  tvl REAL NOT NULL,
  tvl_change_24h REAL,
  tvl_change_7d REAL,
  apy REAL,
  status TEXT NOT NULL DEFAULT 'healthy',
  snapshot_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS stablecoin_pegs (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  symbol TEXT NOT NULL,
  price REAL NOT NULL,
  deviation REAL NOT NULL,
  recorded_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS whale_flows (
  id TEXT PRIMARY KEY,
  protocol TEXT NOT NULL,
  direction TEXT NOT NULL,
  amount REAL NOT NULL,
  token TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  tx_signature TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS simulation_runs (
  id TEXT PRIMARY KEY,
  config TEXT NOT NULL, -- JSON
  scenario_params TEXT, -- JSON
  results TEXT NOT NULL, -- JSON
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS intelligence_cache (
  id TEXT PRIMARY KEY,
  prompt_hash TEXT NOT NULL,
  response TEXT NOT NULL, -- JSON
  context_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS action_history (
  id TEXT PRIMARY KEY,
  wallet TEXT NOT NULL,
  action_type TEXT NOT NULL,
  protocol TEXT NOT NULL,
  strategy TEXT NOT NULL,
  diff TEXT NOT NULL, -- JSON
  status TEXT NOT NULL DEFAULT 'pending',
  tx_signatures TEXT, -- JSON
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (wallet) REFERENCES wallets(address)
);

CREATE TABLE IF NOT EXISTS yield_snapshots (
  id TEXT PRIMARY KEY,
  pool_id TEXT,
  protocol TEXT NOT NULL,
  strategy TEXT NOT NULL,
  asset TEXT NOT NULL,
  apy REAL NOT NULL,
  tvl REAL NOT NULL,
  snapshot_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_yield_snapshots_protocol ON yield_snapshots(protocol);
CREATE INDEX IF NOT EXISTS idx_yield_snapshots_time ON yield_snapshots(snapshot_at);
CREATE INDEX IF NOT EXISTS idx_yield_snapshots_pool ON yield_snapshots(pool_id);

CREATE INDEX IF NOT EXISTS idx_token_balances_wallet ON token_balances(wallet);
CREATE INDEX IF NOT EXISTS idx_positions_wallet ON positions(wallet);
CREATE INDEX IF NOT EXISTS idx_positions_protocol ON positions(protocol);
CREATE INDEX IF NOT EXISTS idx_yield_sources_protocol ON yield_sources(protocol);
CREATE INDEX IF NOT EXISTS idx_protocol_snapshots_protocol ON protocol_snapshots(protocol);
CREATE INDEX IF NOT EXISTS idx_protocol_snapshots_time ON protocol_snapshots(snapshot_at);
CREATE INDEX IF NOT EXISTS idx_stablecoin_pegs_symbol ON stablecoin_pegs(symbol);
CREATE INDEX IF NOT EXISTS idx_whale_flows_protocol ON whale_flows(protocol);
CREATE INDEX IF NOT EXISTS idx_intelligence_cache_hash ON intelligence_cache(prompt_hash);
CREATE INDEX IF NOT EXISTS idx_action_history_wallet ON action_history(wallet);
`
