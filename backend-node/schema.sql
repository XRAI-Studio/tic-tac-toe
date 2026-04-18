-- Cube3 MySQL schema
-- Runs idempotently; safe to re-execute.

CREATE TABLE IF NOT EXISTS users (
  user_id      VARCHAR(40)  NOT NULL PRIMARY KEY,
  email        VARCHAR(255) NOT NULL UNIQUE,
  name         VARCHAR(255) NOT NULL,
  picture      TEXT         NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_sessions (
  session_token VARCHAR(255) NOT NULL PRIMARY KEY,
  user_id       VARCHAR(40)  NOT NULL,
  expires_at    DATETIME     NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS games (
  game_id       VARCHAR(40)  NOT NULL PRIMARY KEY,
  user_id       VARCHAR(40)  NOT NULL,
  user_name     VARCHAR(255) NOT NULL,
  user_picture  TEXT         NULL,
  board_size    TINYINT      NOT NULL,
  mode          VARCHAR(20)  NOT NULL,
  result        VARCHAR(10)  NOT NULL,
  moves         INT          NOT NULL DEFAULT 0,
  duration_ms   INT          NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_seed       TINYINT(1)   NOT NULL DEFAULT 0,
  INDEX idx_user (user_id),
  INDEX idx_mode (mode),
  INDEX idx_size (board_size),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS saved_games (
  user_id     VARCHAR(40) NOT NULL PRIMARY KEY,
  board_size  TINYINT     NOT NULL,
  mode        VARCHAR(20) NOT NULL,
  moves       JSON        NOT NULL,
  updated_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS replays (
  replay_id    VARCHAR(20)  NOT NULL PRIMARY KEY,
  board_size   TINYINT      NOT NULL,
  mode         VARCHAR(20)  NOT NULL,
  moves        JSON         NOT NULL,
  winner       TINYINT      NULL,
  result       VARCHAR(10)  NULL,
  player_name  VARCHAR(255) NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
