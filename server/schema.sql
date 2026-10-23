-- CallConnect PostgreSQL Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE user_role AS ENUM ('customer', 'agent', 'admin');
CREATE TYPE agent_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE call_type AS ENUM ('audio', 'video');
CREATE TYPE call_status AS ENUM ('ringing', 'active', 'ended', 'missed');
CREATE TYPE withdrawal_status AS ENUM ('pending', 'approved', 'paid', 'rejected');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'customer',
  name VARCHAR(100) NOT NULL,
  wallet_balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name VARCHAR(100) NOT NULL,
  age INT NOT NULL CHECK (age >= 18 AND age <= 99),
  photo_url TEXT NOT NULL DEFAULT '/uploads/default-avatar.svg',
  bio TEXT DEFAULT '',
  status agent_status NOT NULL DEFAULT 'pending',
  audio_rate DECIMAL(8, 2) NOT NULL DEFAULT 5,
  video_rate DECIMAL(8, 2) NOT NULL DEFAULT 20,
  is_online BOOLEAN NOT NULL DEFAULT false,
  total_earnings DECIMAL(12, 2) NOT NULL DEFAULT 0,
  available_balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE wallet_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL,
  type VARCHAR(50) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE calls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES users(id),
  agent_id UUID NOT NULL REFERENCES agents(id),
  call_type call_type NOT NULL,
  rate_per_min DECIMAL(8, 2) NOT NULL,
  status call_status NOT NULL DEFAULT 'ringing',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INT DEFAULT 0,
  total_charge DECIMAL(12, 2) DEFAULT 0,
  platform_fee DECIMAL(12, 2) DEFAULT 0,
  agent_earning DECIMAL(12, 2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE withdrawals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES agents(id),
  gross_amount DECIMAL(12, 2) NOT NULL,
  platform_fee DECIMAL(12, 2) NOT NULL,
  net_amount DECIMAL(12, 2) NOT NULL,
  status withdrawal_status NOT NULL DEFAULT 'pending',
  month_label VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_calls_customer ON calls(customer_id);
CREATE INDEX idx_calls_agent ON calls(agent_id);

-- Default admin (password: admin123 - change in production)
-- Hash generated at runtime in setup-db.js
