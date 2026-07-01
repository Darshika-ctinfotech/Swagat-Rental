-- Swagat Rentals Database Schema
-- Generated from backend code usage

CREATE DATABASE IF NOT EXISTS swagat_rentals
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE swagat_rentals;

-- =========================
-- Admins
-- =========================
CREATE TABLE IF NOT EXISTS admins (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NULL,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(191) NOT NULL,
  password VARCHAR(255) NOT NULL,
  profile_image TEXT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'admin',
  email_otp VARCHAR(10) NULL,
  is_verified TINYINT(1) NOT NULL DEFAULT 0,
  is_disabled TINYINT(1) NOT NULL DEFAULT 0,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  forgot_code VARCHAR(255) NULL,
  forgot_code_expires_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_admins_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================
-- Clients
-- =========================
CREATE TABLE IF NOT EXISTS clients (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  u_unique_id VARCHAR(32) NOT NULL,
  full_name VARCHAR(200) NOT NULL,
  email VARCHAR(191) NOT NULL,
  password VARCHAR(255) NOT NULL,
  profile_image TEXT NULL,
  country_code VARCHAR(10) NULL,
  phone_number VARCHAR(20) NULL,
  fcm_token TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  email_otp VARCHAR(10) NULL,
  is_verified TINYINT(1) NOT NULL DEFAULT 0,
  is_disabled TINYINT(1) NOT NULL DEFAULT 0,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  forgot_code VARCHAR(255) NULL,
  forgot_code_expires_at DATETIME NULL,
  dob DATE NULL,
  country VARCHAR(100) NULL,
  kyc_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  kyc_submitted_at DATETIME NULL,
  kyc_approved_at DATETIME NULL,
  kyc_rejected_at DATETIME NULL,
  kyc_reject_reason TEXT NULL,
  kyc_verified_by_admin_id BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_clients_uid (u_unique_id),
  UNIQUE KEY uniq_clients_email (email),
  KEY idx_clients_kyc_status (kyc_status),
  CONSTRAINT fk_clients_kyc_admin
    FOREIGN KEY (kyc_verified_by_admin_id) REFERENCES admins(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================
-- Employees
-- =========================
CREATE TABLE IF NOT EXISTS employees (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  e_unique_id VARCHAR(32) NOT NULL,
  full_name VARCHAR(200) NOT NULL,
  email VARCHAR(191) NOT NULL,
  password VARCHAR(255) NULL,
  profile_image TEXT NULL,
  country_code VARCHAR(10) NULL,
  phone_number VARCHAR(20) NULL,
  fcm_token TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  role VARCHAR(20) NOT NULL DEFAULT 'employee',
  email_otp VARCHAR(10) NULL,
  is_verified TINYINT(1) NOT NULL DEFAULT 1,
  is_disabled TINYINT(1) NOT NULL DEFAULT 0,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  forgot_code VARCHAR(255) NULL,
  forgot_code_expires_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_employees_uid (e_unique_id),
  UNIQUE KEY uniq_employees_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================
-- Systems
-- =========================
CREATE TABLE IF NOT EXISTS systems (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  system_uid VARCHAR(32) NOT NULL,
  system_uuid CHAR(36) NOT NULL,
  hardware_fingerprint VARCHAR(64) NULL,
  device_type VARCHAR(100) NULL,
  client_id BIGINT UNSIGNED NOT NULL,
  installed_by_employee_id BIGINT UNSIGNED NULL,
  installation_date DATE NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  full_response LONGTEXT NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_systems_uid (system_uid),
  UNIQUE KEY uniq_systems_uuid (system_uuid),
  UNIQUE KEY uniq_systems_fingerprint (hardware_fingerprint),
  KEY idx_systems_system_uid (system_uid),
  KEY idx_systems_uuid (system_uuid),
  KEY idx_systems_client (client_id),
  KEY idx_systems_employee (installed_by_employee_id),
  CONSTRAINT fk_systems_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_systems_employee
    FOREIGN KEY (installed_by_employee_id) REFERENCES employees(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================
-- System Snapshots
-- =========================
CREATE TABLE IF NOT EXISTS system_snapshots (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  system_id BIGINT UNSIGNED NOT NULL,
  system_uuid CHAR(36) NOT NULL,
  original_snapshot_json LONGTEXT NULL,
  latest_snapshot_json LONGTEXT NULL,
  diff_json LONGTEXT NULL,
  changed_at DATETIME NULL,
  is_changed TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_system_snapshots_system (system_id),
  KEY idx_system_snapshots_uuid (system_uuid),
  CONSTRAINT fk_system_snapshots_system
    FOREIGN KEY (system_id) REFERENCES systems(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================
-- Employee System Assignments
-- =========================
CREATE TABLE IF NOT EXISTS employee_system_assignments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  employee_id BIGINT UNSIGNED NOT NULL,
  system_id BIGINT UNSIGNED NOT NULL,
  assigned_at DATETIME NOT NULL,
  unassigned_at DATETIME NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_assign_employee (employee_id),
  KEY idx_assign_system (system_id),
  CONSTRAINT fk_assign_employee
    FOREIGN KEY (employee_id) REFERENCES employees(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_assign_system
    FOREIGN KEY (system_id) REFERENCES systems(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================
-- Client KYC
-- =========================
CREATE TABLE IF NOT EXISTS client_kyc (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_id BIGINT UNSIGNED NOT NULL,
  doc_id CHAR(36) NOT NULL,
  doc_type VARCHAR(50) NOT NULL,
  doc_path TEXT NOT NULL,
  selfie_path TEXT NOT NULL,
  submitted_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_kyc_client (client_id),
  UNIQUE KEY uniq_kyc_doc (doc_id),
  CONSTRAINT fk_kyc_client
    FOREIGN KEY (client_id) REFERENCES clients(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================
-- User Blocks (Chat)
-- =========================
CREATE TABLE IF NOT EXISTS user_blocks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  blocker_id BIGINT UNSIGNED NOT NULL,
  blocked_id BIGINT UNSIGNED NOT NULL,
  reason TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_block (blocker_id, blocked_id),
  CONSTRAINT fk_blocker_client
    FOREIGN KEY (blocker_id) REFERENCES clients(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_blocked_client
    FOREIGN KEY (blocked_id) REFERENCES clients(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================
-- Conversations & Groups (Chat)
-- =========================
CREATE TABLE IF NOT EXISTS conversations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(20) NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_conversations_created_by (created_by),
  CONSTRAINT fk_conversations_created_by
    FOREIGN KEY (created_by) REFERENCES clients(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS conversation_participants (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'member',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_muted TINYINT(1) NOT NULL DEFAULT 0,
  muted_until DATETIME NULL,
  last_read_at DATETIME NULL,
  left_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_conv_user (conversation_id, user_id),
  KEY idx_cp_user (user_id),
  CONSTRAINT fk_cp_conversation
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_cp_user
    FOREIGN KEY (user_id) REFERENCES clients(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS groups (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT NULL,
  group_image TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_group_conversation (conversation_id),
  CONSTRAINT fk_groups_conversation
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================
-- Stories & Messages (Chat)
-- =========================
CREATE TABLE IF NOT EXISTS stories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  media_url TEXT NOT NULL,
  media_type VARCHAR(30) NOT NULL,
  caption TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NULL,
  CONSTRAINT fk_stories_user
    FOREIGN KEY (user_id) REFERENCES clients(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id BIGINT UNSIGNED NOT NULL,
  sender_id BIGINT UNSIGNED NOT NULL,
  message_text TEXT NULL,
  message_type VARCHAR(20) NOT NULL,
  parent_message_id BIGINT UNSIGNED NULL,
  story_id BIGINT UNSIGNED NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_messages_conversation (conversation_id),
  KEY idx_messages_sender (sender_id),
  CONSTRAINT fk_messages_conversation
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_messages_sender
    FOREIGN KEY (sender_id) REFERENCES clients(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_messages_parent
    FOREIGN KEY (parent_message_id) REFERENCES messages(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_messages_story
    FOREIGN KEY (story_id) REFERENCES stories(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS message_media (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  message_id BIGINT UNSIGNED NOT NULL,
  file_id VARCHAR(100) NULL,
  url TEXT NOT NULL,
  file_type VARCHAR(50) NULL,
  file_size BIGINT NULL,
  storage_key VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_media_message
    FOREIGN KEY (message_id) REFERENCES messages(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS message_delivery_status (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  message_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'sent',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_mds (message_id, user_id),
  CONSTRAINT fk_mds_message
    FOREIGN KEY (message_id) REFERENCES messages(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_mds_user
    FOREIGN KEY (user_id) REFERENCES clients(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================
-- Inventory Types
-- =========================
CREATE TABLE IF NOT EXISTS asset_category (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  is_active TINYINT(1) DEFAULT 1,
  is_deleted TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO asset_category (name) VALUES
  ('time'),
  ('os_info'),
  ('cpu'),
  ('processor'),
  ('current_load'),
  ('memory'),
  ('ram'),
  ('ram_module'),
  ('rom'),
  ('hard_disk'),
  ('file_system'),
  ('graphics'),
  ('display'),
  ('network'),
  ('battery'),
  ('uuid'),
  ('baseboard'),
  ('motherboard'),
  ('mac_address'),
  ('ip_address'),
  ('device_name'),
  ('device_uuid');

-- =========================
-- Assets
-- =========================
CREATE TABLE IF NOT EXISTS assets (
  asset_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  asset_category_id INT NOT NULL,
  brand VARCHAR(100) NULL,
  model VARCHAR(150) NULL,
  serial_number VARCHAR(150) NULL,
  manufacturer VARCHAR(150) NULL,
  spec_json LONGTEXT NULL,
  is_available TINYINT(1) NOT NULL DEFAULT 1,
  status ENUM('in_stock','rented','damaged','retired') NOT NULL DEFAULT 'in_stock',
  is_deleted TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_assets_category (asset_category_id),
  KEY idx_assets_serial (serial_number),
  CONSTRAINT fk_assets_category
    FOREIGN KEY (asset_category_id) REFERENCES asset_category(id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS asset_details (
  asset_detail_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  asset_id BIGINT UNSIGNED NOT NULL,
  field_name VARCHAR(150) NOT NULL,
  field_value TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_asset_detail (asset_id),
  CONSTRAINT fk_asset_detail
    FOREIGN KEY (asset_id) REFERENCES assets(asset_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================
-- System Assets
-- =========================
CREATE TABLE IF NOT EXISTS system_assets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  system_id BIGINT UNSIGNED NOT NULL,
  asset_id BIGINT UNSIGNED NOT NULL,
  installed_at DATETIME NULL,
  removed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  KEY idx_system_assets_system (system_id),
  KEY idx_system_assets_asset (asset_id),
  CONSTRAINT fk_system_assets_system
    FOREIGN KEY (system_id) REFERENCES systems(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_system_assets_asset
    FOREIGN KEY (asset_id) REFERENCES assets(asset_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
