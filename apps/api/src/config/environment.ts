import dotenv from 'dotenv';
dotenv.config();

export const environment = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '4000', 10),
  WEB_ORIGIN: process.env.WEB_ORIGIN || 'http://localhost:3000',
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/agentic',
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || 'dev_secret_key_needs_to_be_at_least_32_characters_long_for_security',
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || 'http://localhost:4000',
  LIVEKIT_URL: process.env.LIVEKIT_URL || 'ws://localhost:7880',
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY || 'devkey',
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET || 'secret_must_be_at_least_32_characters_long',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  VAULT_MASTER_KEY: process.env.VAULT_MASTER_KEY || Buffer.from('default_32_byte_vault_master_key_for_dev_mode!!').toString('base64'),
};
