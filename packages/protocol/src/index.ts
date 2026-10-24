import { z } from 'zod';

// ==========================================
// REPOSITORY SCHEMAS & DTOS
// ==========================================

export const RepositoryStatusEnum = z.enum(['PENDING', 'INDEXING', 'READY', 'ERROR']);
export type RepositoryStatus = z.infer<typeof RepositoryStatusEnum>;

export const RegisterRepositorySchema = z.object({
  url: z.string().url().regex(/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\/)?$/, {
    message: 'Must be a valid GitHub repository URL (e.g., https://github.com/owner/repo)',
  }),
  defaultBranch: z.string().default('main'),
});
export type RegisterRepositoryInput = z.infer<typeof RegisterRepositorySchema>;

export const RepositoryDtoSchema = z.object({
  id: z.string().uuid(),
  url: z.string().url(),
  owner: z.string(),
  name: z.string(),
  defaultBranch: z.string(),
  currentCommitSha: z.string().nullable().optional(),
  status: RepositoryStatusEnum,
  fileCount: z.number().int(),
  chunkCount: z.number().int(),
  totalSizeBytes: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type RepositoryDto = z.infer<typeof RepositoryDtoSchema>;

// ==========================================
// INGESTION & JOB SCHEMAS
// ==========================================

export const IngestionJobStatusEnum = z.enum(['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED']);
export type IngestionJobStatus = z.infer<typeof IngestionJobStatusEnum>;

export const IngestionJobDtoSchema = z.object({
  id: z.string().uuid(),
  repositoryId: z.string().uuid(),
  commitSha: z.string(),
  status: IngestionJobStatusEnum,
  progressPercentage: z.number().min(0).max(100),
  filesProcessed: z.number().int(),
  chunksCreated: z.number().int(),
  errorMessage: z.string().nullable().optional(),
  startedAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
});
export type IngestionJobDto = z.infer<typeof IngestionJobDtoSchema>;

// ==========================================
// CHAT, RAG & CITATIONS
// ==========================================

export const ValidatedCitationSchema = z.object({
  filePath: z.string(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  snippet: z.string(),
  similarityScore: z.number().optional(),
});
export type ValidatedCitation = z.infer<typeof ValidatedCitationSchema>;

export const SendMessageSchema = z.object({
  repositoryId: z.string().uuid(),
  question: z.string().min(1).max(4000),
  conversationId: z.string().uuid().optional(),
  topK: z.number().int().min(1).max(20).default(8),
});
export type SendMessageInput = z.infer<typeof SendMessageSchema>;

export const PipelineStreamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('token'),
    token: z.string(),
  }),
  z.object({
    type: z.literal('citations'),
    citations: z.array(ValidatedCitationSchema),
  }),
  z.object({
    type: z.literal('meta'),
    meta: z.object({
      latencyMs: z.number(),
      retrievedChunksCount: z.number(),
      tokensUsed: z
        .object({
          promptTokens: z.number(),
          completionTokens: z.number(),
          totalTokens: z.number(),
        })
        .optional(),
    }),
  }),
  z.object({
    type: z.literal('done'),
  }),
  z.object({
    type: z.literal('error'),
    error: z.string(),
  }),
]);
export type PipelineStreamEvent = z.infer<typeof PipelineStreamEventSchema>;

// ==========================================
// CODE GRAPH SCHEMAS
// ==========================================

export const RelationTypeEnum = z.enum(['CALLS', 'IMPORTS', 'USES_TYPE', 'EXTENDS']);
export type RelationType = z.infer<typeof RelationTypeEnum>;

export const CodeEdgeDtoSchema = z.object({
  id: z.string().uuid(),
  repositoryId: z.string().uuid(),
  commitSha: z.string(),
  sourceChunkId: z.string().uuid(),
  targetChunkId: z.string().uuid(),
  relationType: RelationTypeEnum,
  symbolName: z.string(),
  sourceFile: z.string(),
  targetFile: z.string(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string().datetime(),
});
export type CodeEdgeDto = z.infer<typeof CodeEdgeDtoSchema>;

export const GraphNeighborChunkSchema = z.object({
  chunkId: z.string().uuid(),
  filePath: z.string(),
  startLine: z.number().int(),
  endLine: z.number().int(),
  content: z.string(),
  relationType: z.string(),
  symbolName: z.string(),
  direction: z.enum(['outgoing', 'incoming']),
  depth: z.number().int(),
});
export type GraphNeighborChunk = z.infer<typeof GraphNeighborChunkSchema>;

// ==========================================
// LIVEKIT VOICE AGENT CONTRACTS
// ==========================================

export const LiveKitTokenRequestSchema = z.object({
  roomName: z.string().min(1),
  participantName: z.string().min(1).default('User'),
  identity: z.string().min(1).optional(),
  repositoryId: z.string().uuid().optional(),
});
export type LiveKitTokenRequest = z.infer<typeof LiveKitTokenRequestSchema>;

export const LiveKitTokenResponseSchema = z.object({
  token: z.string(),
  serverUrl: z.string(),
  roomName: z.string(),
  participantName: z.string(),
});
export type LiveKitTokenResponse = z.infer<typeof LiveKitTokenResponseSchema>;

// Payload sent over LiveKit Room Data Channel to update the frontend code viewer
export const LiveKitDataMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('rag_citation'),
    filePath: z.string(),
    startLine: z.number().int(),
    endLine: z.number().int(),
    snippet: z.string().optional(),
    symbolName: z.string().optional(),
  }),
  z.object({
    type: z.literal('agent_state'),
    state: z.enum(['listening', 'thinking', 'speaking', 'searching']),
    detail: z.string().optional(),
  }),
]);
export type LiveKitDataMessage = z.infer<typeof LiveKitDataMessageSchema>;

// ==========================================
// CREDENTIAL VAULT SCHEMAS
// ==========================================

export const ProviderIdEnum = z.enum(['google', 'openai', 'anthropic']);
export type ProviderId = z.infer<typeof ProviderIdEnum>;

export const CreateCredentialSchema = z.object({
  providerId: ProviderIdEnum,
  label: z.string().min(1).max(100),
  apiKey: z.string().min(8),
});
export type CreateCredentialInput = z.infer<typeof CreateCredentialSchema>;

export const CredentialDtoSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  providerId: ProviderIdEnum,
  label: z.string(),
  lastUsedAt: z.string().datetime().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CredentialDto = z.infer<typeof CredentialDtoSchema>;
