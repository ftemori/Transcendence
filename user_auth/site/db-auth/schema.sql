CREATE TABLE IF NOT EXISTS credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  two_factor_enabled INTEGER NOT NULL DEFAULT 0,
  two_factor_secret TEXT
);
