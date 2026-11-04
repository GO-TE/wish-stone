-- =============================================================================
-- StoneWish MSA Database-per-Service 초기화 스크립트 (MySQL 8.0)
-- 근거: dash_board/데이터 모델.md (user_db / wish_db / interaction_db / group_db 분리)
-- =============================================================================

CREATE DATABASE IF NOT EXISTS user_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS wish_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS interaction_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS group_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 1. user_db (user-auth-service :8081)
-- -----------------------------------------------------------------------------
USE user_db;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  nickname VARCHAR(12) NULL,
  is_guest BOOLEAN NOT NULL DEFAULT FALSE,
  last_checked_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL
);

CREATE TABLE IF NOT EXISTS user_identities (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  provider VARCHAR(20) NOT NULL COMMENT 'apple / kakao / google',
  provider_sub VARCHAR(128) NOT NULL,
  linked_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uk_provider_sub (provider, provider_sub),
  INDEX idx_user_identities_user (user_id)
);

-- -----------------------------------------------------------------------------
-- 2. wish_db (wish-tower-service :8082)
-- 다른 서비스(user_db, group_db)에 대한 물리적 외래키(FK) 없이 ID만 저장한다.
-- -----------------------------------------------------------------------------
USE wish_db;

CREATE TABLE IF NOT EXISTS categories (
  code VARCHAR(20) PRIMARY KEY,
  label VARCHAR(30) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

INSERT IGNORE INTO categories (code, label, sort_order) VALUES
  ('job', '취업', 1),
  ('study', '학업', 2),
  ('health', '건강', 3),
  ('relation', '관계', 4),
  ('etc', '기타', 5);

CREATE TABLE IF NOT EXISTS wishes (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL COMMENT '논리 참조: user_db.users.id',
  group_id VARCHAR(36) NULL COMMENT '논리 참조: group_db.groups.id (null이면 공개 돌탑)',
  category_code VARCHAR(20) NOT NULL,
  content VARCHAR(200) NOT NULL,
  stone_shape VARCHAR(20) NOT NULL DEFAULT 'round',
  stone_color VARCHAR(10) NOT NULL DEFAULT '#A89F91',
  pose JSON NOT NULL,
  cheer_count INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE / FULFILLED / HIDDEN / DELETED',
  bloom_type VARCHAR(20) NULL COMMENT 'flower / sprout / moss',
  fulfilled_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX idx_wishes_global_tower (group_id, status, created_at DESC),
  INDEX idx_wishes_category_tower (group_id, category_code, status, created_at DESC),
  INDEX idx_wishes_user (user_id, created_at DESC)
);

-- Kafka 이벤트 중복 수신 방지 (Idempotent Consumer 보장)
CREATE TABLE IF NOT EXISTS processed_events (
  event_id VARCHAR(36) PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  processed_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
);

-- -----------------------------------------------------------------------------
-- 3. interaction_db (interaction-service :8083)
-- -----------------------------------------------------------------------------
USE interaction_db;

CREATE TABLE IF NOT EXISTS cheers (
  wish_id VARCHAR(36) NOT NULL COMMENT '논리 참조: wish_db.wishes.id',
  user_id VARCHAR(36) NOT NULL COMMENT '논리 참조: user_db.users.id',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (wish_id, user_id),
  INDEX idx_cheers_wish_created (wish_id, created_at)
);

CREATE TABLE IF NOT EXISTS reports (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  wish_id VARCHAR(36) NOT NULL,
  reporter_id VARCHAR(36) NOT NULL,
  reason VARCHAR(30) NOT NULL COMMENT 'abuse / hate / sexual / personal_info / spam / etc',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uk_wish_reporter (wish_id, reporter_id),
  INDEX idx_reports_wish (wish_id)
);

-- -----------------------------------------------------------------------------
-- 4. group_db (group-service :8084)
-- -----------------------------------------------------------------------------
USE group_db;

CREATE TABLE IF NOT EXISTS `groups` (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(20) NOT NULL,
  invite_code VARCHAR(12) NOT NULL UNIQUE,
  owner_id VARCHAR(36) NOT NULL COMMENT '논리 참조: user_db.users.id',
  max_members INT NOT NULL DEFAULT 50,
  stone_count INT NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'MEMBER' COMMENT 'OWNER / MEMBER',
  joined_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (group_id, user_id),
  INDEX idx_group_members_user (user_id)
);
