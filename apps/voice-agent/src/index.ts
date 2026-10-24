import { cli, ServerOptions } from '@livekit/agents';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';

dotenv.config();

const currentDir = path.dirname(fileURLToPath(import.meta.url));
let agentPath = path.resolve(currentDir, './agent.js');

if (!fs.existsSync(agentPath)) {
  const distPath = path.resolve(currentDir, '../dist/agent.js');
  if (fs.existsSync(distPath)) {
    agentPath = distPath;
  }
}

cli.runApp(new ServerOptions({ agent: agentPath }));
