CREATE TABLE IF NOT EXISTS routing_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT DEFAULT (datetime('now')),
  amount_sgd REAL,
  target_server_url TEXT,
  tool_name TEXT,
  chosen_rail TEXT,
  success INTEGER DEFAULT 1,
  latency_ms INTEGER,
  cost_sgd REAL,
  observatory_trust_score REAL
);
