-- CPHub V4 — Initial Schema Migration
-- Migration: 001_init

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    name VARCHAR(100) NOT NULL,
    avatar_url VARCHAR(500),
    auth_provider VARCHAR(20) NOT NULL DEFAULT 'email',
    google_id VARCHAR(100),
    is_onboarded BOOLEAN DEFAULT FALSE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Linked Accounts
CREATE TABLE linked_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL,
    provider_user_id VARCHAR(100),
    handle VARCHAR(100),
    access_token VARCHAR(500),
    refresh_token VARCHAR(500),
    token_expiry TIMESTAMPTZ,
    rating INT DEFAULT 0,
    max_rating INT DEFAULT 0,
    avatar_url VARCHAR(500),
    is_connected BOOLEAN DEFAULT TRUE,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_linked_accounts_user ON linked_accounts(user_id);

-- Problems
CREATE TABLE problems (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(20) NOT NULL,
    problem_id VARCHAR(50) NOT NULL,
    title VARCHAR(300) NOT NULL,
    statement TEXT,
    input_spec TEXT,
    output_spec TEXT,
    difficulty INT DEFAULT 0,
    time_limit VARCHAR(20),
    memory_limit VARCHAR(20),
    tags TEXT DEFAULT '[]',
    url VARCHAR(500),
    status VARCHAR(20) DEFAULT 'unsolved',
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider, problem_id)
);

-- Test Cases
CREATE TABLE test_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    input TEXT NOT NULL,
    output TEXT NOT NULL,
    is_sample BOOLEAN DEFAULT TRUE,
    is_custom BOOLEAN DEFAULT FALSE,
    "order" INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_test_cases_problem ON test_cases(problem_id);

-- Problem Logs
CREATE TABLE problem_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    action VARCHAR(20) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_problem_logs_user ON problem_logs(user_id);
CREATE INDEX idx_problem_logs_problem ON problem_logs(problem_id);

-- Local Submissions
CREATE TABLE local_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem_id UUID NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
    language VARCHAR(20) NOT NULL,
    source_code TEXT NOT NULL,
    verdict VARCHAR(20),
    runtime INT DEFAULT 0,
    memory INT DEFAULT 0,
    passed_tests INT DEFAULT 0,
    total_tests INT DEFAULT 0,
    error_message TEXT,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_local_submissions_user ON local_submissions(user_id);
CREATE INDEX idx_local_submissions_problem ON local_submissions(problem_id);

-- External Submissions
CREATE TABLE external_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    problem_id UUID REFERENCES problems(id) ON DELETE SET NULL,
    provider VARCHAR(20) NOT NULL,
    submission_id VARCHAR(50) NOT NULL,
    problem_title VARCHAR(300),
    problem_ref VARCHAR(50),
    language VARCHAR(30),
    verdict VARCHAR(30),
    runtime INT DEFAULT 0,
    memory INT DEFAULT 0,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider, submission_id)
);

CREATE INDEX idx_external_submissions_user ON external_submissions(user_id);

-- Snippets
CREATE TABLE snippets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    language VARCHAR(20) NOT NULL,
    code TEXT NOT NULL,
    tags TEXT DEFAULT '[]',
    description TEXT,
    version INT DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_snippets_user ON snippets(user_id);

-- User Settings
CREATE TABLE user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    default_language VARCHAR(20) DEFAULT 'cpp17',
    default_theme VARCHAR(10) DEFAULT 'dark',
    auto_sync BOOLEAN DEFAULT TRUE,
    editor_font_size INT DEFAULT 14,
    tab_size INT DEFAULT 4,
    templates JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
