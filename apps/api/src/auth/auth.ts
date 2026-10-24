import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from '@workspace/database';
import { bearer } from 'better-auth/plugins';
import { environment } from '../config/environment.js';

export const auth = betterAuth({
  appName: 'Agentic Intelligence',
  baseURL: environment.BETTER_AUTH_URL,
  basePath: '/api/v1/auth',
  secret: environment.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  trustedOrigins: [
    environment.WEB_ORIGIN,
    'https://agentic.dabelwal.online',
    'http://localhost:3000',
  ],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  plugins: [bearer()],
});

export type ApplicationAuth = typeof auth;
