import { voice, defineAgent, type JobContext } from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';
import { createRagTools } from './tools.js';

export default defineAgent({
  entry: async (ctx: JobContext) => {
    await ctx.connect();
    const roomName = ctx.room.name || 'default-room';
    console.log(`🎙️ Voice Agent connected to LiveKit room: ${roomName}`);

    // Wait for the human user to join
    const participant = await ctx.waitForParticipant();
    console.log(`👤 Participant joined: ${participant.identity}`);

    // Parse repositoryId from participant metadata, room metadata, or room name
    let repositoryId: string | undefined;

    if (participant.metadata) {
      try {
        const parsed = JSON.parse(participant.metadata);
        if (parsed.repositoryId) repositoryId = parsed.repositoryId;
      } catch {}
    }

    if (!repositoryId && ctx.room.metadata) {
      try {
        const parsed = JSON.parse(ctx.room.metadata);
        if (parsed.repositoryId) repositoryId = parsed.repositoryId;
      } catch {}
    }

    if (!repositoryId && roomName.startsWith('repo-')) {
      const match = roomName.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      repositoryId = match ? match[1] : roomName.replace('repo-', '');
    }

    console.log(`📦 Resolved Repository ID for voice session: ${repositoryId}`);

    // Fetch repository display name from API backend
    let repoName = 'active repository';
    if (repositoryId) {
      try {
        const apiBase = (process.env.API_URL || 'http://localhost:4000').replace(/\/+$/, '');
        const res = await fetch(`${apiBase}/api/v1/repositories/${repositoryId}`);
        if (res.ok) {
          const repoData = (await res.json()) as any;
          repoName = repoData.fullName || repoData.name || repositoryId;
        }
      } catch (err: any) {
        console.warn('Could not fetch repository metadata:', err.message);
      }
    }
    console.log(`📂 Active repository target: "${repoName}" (${repositoryId})`);

    const publishCitation = (citation: { filePath: string; startLine: number; endLine: number; snippet?: string }) => {
      try {
        if (!ctx.room.localParticipant) return;
        const payload = JSON.stringify({
          type: 'rag_citation',
          ...citation,
        });
        ctx.room.localParticipant.publishData(Buffer.from(payload), {
          reliable: true,
          topic: 'citations',
        });
        console.log(`📡 Broadcasted citation: ${citation.filePath}#L${citation.startLine}-L${citation.endLine}`);
      } catch (err) {
        console.error('Failed to broadcast citation to data channel:', err);
      }
    };

    const publishActivity = (activity: string) => {
      try {
        if (!ctx.room.localParticipant) return;
        const payload = JSON.stringify({
          type: 'agent_activity',
          activity,
        });
        ctx.room.localParticipant.publishData(Buffer.from(payload), {
          reliable: true,
          topic: 'activity',
        });
        console.log(`⚡ Activity: ${activity}`);
      } catch (err) {
        console.error('Failed to broadcast activity to data channel:', err);
      }
    };

    const ragTools = createRagTools({
      repositoryId,
      publishCitation,
      publishActivity,
    });

    const agent = new voice.Agent({
      instructions: `You are an expert AI voice programming assistant explaining the repository "${repoName}".
CRITICAL OPERATING RULES:
1. The active repository is "${repoName}" (${repositoryId}). It is ALREADY active and fully indexed. NEVER ask the user what repository they want to talk about or explore!
2. When the user asks any question about architecture, auth, functions, or how something works, IMMEDIATELY call your 'searchCodebase' tool with relevant search keywords.
3. Do NOT ask for clarification before calling 'searchCodebase'—always search the codebase first!
4. You may inspect a specific file with 'readFileRange' if needed, but prioritize answering as soon as you have sufficient context. Do NOT run repetitive or redundant searches before answering.
5. Keep your verbal answers direct, concise, and conversational (2-4 spoken sentences).
6. Do not read long snippets of raw code or syntax verbatim—the user's browser automatically opens and highlights the exact code lines in their code viewer drawer!`,
      tools: ragTools,
    });

    const modelName = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-mini';
    console.log(`🧠 Initializing OpenAI Realtime session with model: ${modelName}`);

    const realtimeLlm = new openai.realtime.RealtimeModel({
      model: modelName,
      voice: 'alloy',
      apiKey: process.env.OPENAI_API_KEY,
      turnDetection: {
        type: 'server_vad',
        threshold: 0.6,
        prefix_padding_ms: 400,
        silence_duration_ms: 1200,
        create_response: true,
        // MUST be false: avoids OpenAI server VAD false interrupts from ambient noise, breathing, or comfort noise.
        // Interruption is triggered on-demand via the Interrupt button.
        interrupt_response: false,
      },
    });

    const session = new voice.AgentSession({
      llm: realtimeLlm,
      userAwayTimeout: 120,
      maxToolSteps: 3,
      turnHandling: {
        // Keep turn boundaries with the realtime model so the SDK does not run its
        // own audio-activity interruption path while the browser mic is muted.
        turnDetection: 'realtime_llm',
        interruption: {
          enabled: true,
          discardAudioIfUninterruptible: true,
        },
      },
    } as any);

    // Listen for manual interrupt commands sent over WebRTC data channel
    ctx.room.on('dataReceived', (payload) => {
      try {
        const text = new TextDecoder().decode(payload);
        const data = JSON.parse(text);
        if (data.type === 'interrupt_agent') {
          console.log(`🛑 User interrupted: stopping agent speech cleanly`);
          try {
            session.interrupt({ force: true });
          } catch (err: any) {
            console.warn('Session interrupt notice:', err?.message);
          }
        }
      } catch {}
    });

    await session.start({
      agent,
      room: ctx.room,
      inputOptions: {
        closeOnDisconnect: false,
      },
    });

    console.log(`✨ OpenAI Realtime Agent session active for participant ${participant.identity}`);
  },
});
