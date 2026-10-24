import express, { type Express } from 'express';
import morgan from 'morgan';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth/auth.js';
import apiRouter from './routes/index.js';
import { environment } from './config/environment.js';

export function createServer(): Express {
  const app = express();

  app
    .disable('x-powered-by')
    .use(morgan(environment.NODE_ENV === 'production' ? 'combined' : 'dev'))
    .use(
      cors({
        origin: [
          environment.WEB_ORIGIN,
          'https://agentic.dabelwal.online',
          'http://localhost:3000',
        ],
        credentials: true,
        methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
        exposedHeaders: ['X-Conversation-Id'],
      })
    )
    .all('/api/v1/auth/*', toNodeHandler(auth))
    .use(express.urlencoded({ extended: true }))
    .use(express.json({ limit: '10mb' }))
    .use('/api/v1', apiRouter)
    .use((_req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });

  return app;
}
