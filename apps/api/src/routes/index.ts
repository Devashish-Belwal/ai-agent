import { Router } from 'express';
import { RepositoryController } from '../controllers/repository.controller.js';
import { ChatController } from '../controllers/chat.controller.js';
import { RetrievalController } from '../controllers/retrieval.controller.js';
import { LiveKitController } from '../controllers/livekit.controller.js';
import { CredentialController } from '../controllers/credential.controller.js';

const router: Router = Router();

// Health
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Repositories
router.post('/repositories', RepositoryController.register);
router.get('/repositories', RepositoryController.list);
router.get('/repositories/:id', RepositoryController.getById);
router.get('/repositories/:id/file', RepositoryController.getFile);

// Chat & RAG
router.post('/chat', ChatController.sendMessage);
router.get('/chat/:repositoryId', ChatController.getHistory);

// Retrieval (Internal / Voice Agent tools)
router.post('/retrieval/search', RetrievalController.search);
router.post('/retrieval/symbol', RetrievalController.traceSymbol);
router.get('/retrieval/file-range', RetrievalController.readFileRange);

// LiveKit WebRTC Token
router.post('/livekit/token', LiveKitController.getToken);

// Credentials
router.post('/credentials', CredentialController.create);
router.get('/credentials', CredentialController.list);

export default router;
