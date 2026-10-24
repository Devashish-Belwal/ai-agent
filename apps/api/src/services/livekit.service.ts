import { AccessToken } from 'livekit-server-sdk';
import { environment } from '../config/environment.js';

export interface GenerateTokenOptions {
  roomName: string;
  participantName: string;
  identity?: string;
  repositoryId?: string;
  ttlSeconds?: number;
}

export class LiveKitService {
  static async createToken(options: GenerateTokenOptions): Promise<string> {
    const identity = options.identity || `user-${Math.random().toString(36).substring(2, 9)}`;

    let repositoryId = options.repositoryId;
    if (!repositoryId && options.roomName.startsWith('repo-')) {
      const match = options.roomName.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      repositoryId = match ? match[1] : options.roomName.replace('repo-', '');
    }

    const at = new AccessToken(environment.LIVEKIT_API_KEY, environment.LIVEKIT_API_SECRET, {
      identity,
      name: options.participantName,
      metadata: JSON.stringify({ repositoryId: repositoryId || '' }),
      ttl: options.ttlSeconds || 3600 * 2, // 2 hours
    });

    at.addGrant({
      room: options.roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return await at.toJwt();
  }
}
