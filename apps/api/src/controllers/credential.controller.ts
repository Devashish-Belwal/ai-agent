import type { Request, Response } from 'express';
import { prisma } from '@workspace/database';
import { CreateCredentialSchema } from '@workspace/protocol';
import { encryptCredential } from '../services/credential-vault.js';

export class CredentialController {
  static async create(req: Request, res: Response) {
    try {
      const parsed = CreateCredentialSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }

      const { providerId, label, apiKey } = parsed.data;
      const userId = (req as any).user?.id || 'default-user';

      const encrypted = encryptCredential(apiKey, {
        userId,
        providerId,
        label,
      });

      const credential = await prisma.providerCredential.upsert({
        where: {
          userId_providerId_label: {
            userId,
            providerId,
            label,
          },
        },
        create: {
          userId,
          providerId,
          label,
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          keyVersion: encrypted.keyVersion,
        },
        update: {
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
          keyVersion: encrypted.keyVersion,
        },
      });

      return res.status(201).json({
        credential: {
          id: credential.id,
          providerId: credential.providerId,
          label: credential.label,
          createdAt: credential.createdAt,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async list(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id || 'default-user';
      const credentials = await prisma.providerCredential.findMany({
        where: { userId },
        select: {
          id: true,
          providerId: true,
          label: true,
          lastUsedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return res.json({ credentials });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
}
