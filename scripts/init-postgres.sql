-- PostgreSQL initialization script for Job Application Copilot
-- This script runs automatically when the container starts

-- Create database if not exists (usually done by POSTGRES_DB env var, but explicit for safety)
CREATE DATABASE IF NOT EXISTS job_copilot ENCODING 'UTF8';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE job_copilot TO job_copilot;

-- Connect to the database
\c job_copilot

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO job_copilot;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO job_copilot;

-- Create indexes for performance
-- (Prisma migrations will create most of these, but explicit creation ensures they exist)

COMMENT ON DATABASE job_copilot IS 'Job Application Copilot - Production Database';
