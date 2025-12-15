CREATE TABLE IF NOT EXISTS user_profiles (
    id INTEGER PRIMARY KEY, -- Matches ID from auth DB
    avatar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    victories INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    w_l_ratio REAL GENERATED ALWAYS AS (
      CASE
        WHEN (victories + losses) = 0 THEN 0.0
        ELSE CAST(victories AS REAL) / (victories + losses)
      END
    ) STORED
);

-- Friend requests table: stores pending/accepted/declined requests
CREATE TABLE IF NOT EXISTS friend_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id INTEGER NOT NULL,
    to_user_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending', -- pending | accepted | declined
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(from_user_id) REFERENCES user_profiles(id),
    FOREIGN KEY(to_user_id) REFERENCES user_profiles(id)
);

-- Friends table: simple bi-directional entries (one row per direction)
CREATE TABLE IF NOT EXISTS friends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    friend_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES user_profiles(id),
    FOREIGN KEY(friend_id) REFERENCES user_profiles(id)
);
