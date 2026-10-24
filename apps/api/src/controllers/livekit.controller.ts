import type { Request, Response } from 'express';
import { LiveKitTokenRequestSchema } from '@workspace/protocol';
import { LiveKitService } from '../services/livekit.service.js';
import { environment } from '../config/environment.js';

export class LiveKitController {
  static async getToken(req: Request, res: Response) {
    try {
      const parsed = LiveKitTokenRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }

      const { roomName, participantName, identity, repositoryId } = parsed.data;

      const token = await LiveKitService.createToken({
        roomName,
        participantName,
        identity,
        repositoryId,
      });

      return res.json({
        token,
        serverUrl: environment.LIVEKIT_URL,
        roomName,
        participantName,
      });
    } catch (err: any) {
      console.error('Failed to generate LiveKit token:', err);
      return res.status(500).json({ error: err.message || 'Token generation failed' });
    }
  }
}
