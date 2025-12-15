CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player1_id TEXT NOT NULL,
  player2_id TEXT NOT NULL,
  player1_username TEXT NOT NULL,
  player2_username TEXT NOT NULL,
  player1_score INTEGER NOT NULL,
  player2_score INTEGER NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'online', -- e.g., online, offline, tournament
  played_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
