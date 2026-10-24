'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useVoiceAssistant,
  useRoomContext,
  useLocalParticipant,
  BarVisualizer,
  useTrackVolume,
  useMultibandTrackVolume,
} from '@livekit/components-react';
import { RoomEvent } from 'livekit-client';
import {
  Mic,
  MicOff,
  PhoneOff,
  Sparkles,
  Volume2,
  VolumeX,
  FileCode,
  Copy,
  Check,
  Code2,
  ChevronRight,
  Square,
} from 'lucide-react';
import { requestLiveKitToken, fetchFileContent } from '../../lib/api-client';

export interface CitationItem {
  filePath: string;
  startLine: number;
  endLine: number;
  timestamp: number;
}

interface VoiceAgentModalProps {
  repositoryId: string;
  repoName: string;
  isOpen: boolean;
  onClose: () => void;
  onCitationReceived: (filePath: string, startLine: number, endLine: number) => void;
}

const ROOM_CONNECT_OPTIONS = {
  autoSubscribe: true,
  peerConnectionTimeout: 30000,
};

const ROOM_AUDIO_OPTIONS = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export function VoiceAgentModal({
  repositoryId,
  repoName,
  isOpen,
  onClose,
  onCitationReceived,
}: VoiceAgentModalProps) {
  const [token, setToken] = useState<string>('');
  const [serverUrl, setServerUrl] = useState<string>('');
  const [connecting, setConnecting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [citations, setCitations] = useState<CitationItem[]>([]);
  const [activeCitationIndex, setActiveCitationIndex] = useState<number>(0);
  const requestedRef = useRef<boolean>(false);

  const handleManualClose = useCallback(() => {
    setToken('');
    setServerUrl('');
    setError('');
    setIsMuted(true);
    setCitations([]);
    setActiveCitationIndex(0);
    setConnecting(false);
    requestedRef.current = false;
    onClose();
  }, [onClose]);

  const handleRoomDisconnected = useCallback(() => {
    console.log('Voice session ended on server');
  }, []);

  const handleRoomError = useCallback((err: Error) => {
    console.warn('LiveKit Room notice:', err.message);
    if (
      !err.message.includes('negotiation timed out') &&
      !err.message.includes('cannot establish a signal session')
    ) {
      setError(err.message);
    }
  }, []);

  // Request fresh token with a unique session suffix whenever opened
  useEffect(() => {
    if (!isOpen || !repositoryId) {
      setToken('');
      setServerUrl('');
      setError('');
      setIsMuted(true);
      setCitations([]);
      setActiveCitationIndex(0);
      setConnecting(false);
      requestedRef.current = false;
      return;
    }

    if (requestedRef.current) return;
    requestedRef.current = true;

    setConnecting(true);
    setError('');
    setIsMuted(true);

    // Generate unique room ID per session to avoid colliding with lingering rooms
    const sessionSuffix = Math.random().toString(36).substring(2, 8);
    const roomName = `repo-${repositoryId}-${sessionSuffix}`;

    requestLiveKitToken(roomName, 'Developer', repositoryId)
      .then((data) => {
        setToken(data.token);
        const url = process.env.NEXT_PUBLIC_LIVEKIT_URL || data.serverUrl;
        setServerUrl(url);
        setConnecting(false);
      })
      .catch((err) => {
        console.error('Token fetch error:', err);
        setError(err.message || 'Failed to fetch LiveKit token');
        setConnecting(false);
      });
  }, [isOpen, repositoryId]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleManualClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleManualClose]);

  // Handle incoming citation from LiveKit data channel
  const handleCitationReceived = useCallback(
    (filePath: string, startLine: number, endLine: number) => {
      setCitations((prev) => {
        const existingIdx = prev.findIndex(
          (c) => c.filePath === filePath && c.startLine === startLine && c.endLine === endLine
        );
        if (existingIdx !== -1) {
          setActiveCitationIndex(existingIdx);
          return prev;
        }
        const updated = [...prev, { filePath, startLine, endLine, timestamp: Date.now() }];
        setActiveCitationIndex(updated.length - 1);
        return updated;
      });
      onCitationReceived(filePath, startLine, endLine);
    },
    [onCitationReceived]
  );

  if (!isOpen) return null;

  const hasCitations = citations.length > 0;
  const activeCitation = hasCitations ? citations[activeCitationIndex] || citations[0] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 md:p-6 transition-all">
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-[#111726] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col transition-all duration-300 ${
          hasCitations
            ? 'w-full max-w-5xl lg:max-w-6xl h-[640px] max-h-[90vh]'
            : 'w-full max-w-lg min-h-[420px]'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-[#161f33] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/40 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <span>LiveKit Voice Agent</span>
                {hasCitations && (
                  <span className="text-[10px] bg-blue-900/60 border border-blue-700/60 text-blue-300 px-2 py-0.5 rounded-full font-mono">
                    {citations.length} {citations.length === 1 ? 'citation' : 'citations'}
                  </span>
                )}
              </h3>
              <p className="text-[11px] text-slate-400">OpenAI Realtime • {repoName}</p>
            </div>
          </div>
          <button
            onClick={handleManualClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition"
            title="End Voice Session"
          >
            <PhoneOff className="w-4 h-4 text-rose-400" />
          </button>
        </div>

        {/* Content Body: Split view if citations exist */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
          {/* Left Column: Voice Assistant Panel */}
          <div
            className={`flex flex-col items-center justify-between p-6 overflow-y-auto ${
              hasCitations
                ? 'w-full md:w-[350px] lg:w-[380px] shrink-0 border-b md:border-b-0 md:border-r border-slate-800 bg-[#111726]/90'
                : 'w-full flex-1 justify-center gap-6'
            }`}
          >
            {connecting && (
              <div className="flex flex-col items-center gap-2 text-sm text-slate-400 animate-pulse my-auto">
                <Volume2 className="w-8 h-8 text-blue-400 animate-bounce" />
                <span>Connecting to real-time WebRTC room...</span>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs text-center max-w-sm">
                {error}
              </div>
            )}

            {/* LiveKit Room with key={token} for clean session recreation */}
            {token && serverUrl && (
              <LiveKitRoom
                key={token}
                token={token}
                serverUrl={serverUrl}
                connect={true}
                audio={false}
                video={false}
                connectOptions={ROOM_CONNECT_OPTIONS}
                onDisconnected={handleRoomDisconnected}
                onError={handleRoomError}
                className="w-full flex flex-col items-center gap-4"
              >
                <RoomAudioRenderer volume={1.0} />
                <VoiceSessionActive
                  isMuted={isMuted}
                  setIsMuted={setIsMuted}
                  onCitationReceived={handleCitationReceived}
                  onClose={handleManualClose}
                />
              </LiveKitRoom>
            )}

            {/* Fallback skeleton while room initializes */}
            {!token && !connecting && !error && (
              <div className="flex flex-col items-center gap-3 text-slate-500 my-auto text-xs">
                <Volume2 className="w-6 h-6 animate-pulse" />
                <span>Preparing session credentials...</span>
              </div>
            )}

            {/* Citation History Tabs on Left Column (when multiple citations exist) */}
            {hasCitations && citations.length > 1 && (
              <div className="w-full pt-4 border-t border-slate-800/80 flex flex-col gap-2">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  Referenced Code Files
                </span>
                <div className="flex flex-col gap-1 max-h-28 overflow-y-auto pr-1">
                  {citations.map((c, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveCitationIndex(idx)}
                      className={`flex items-center justify-between p-2 rounded-xl text-left text-xs transition-all ${
                        idx === activeCitationIndex
                          ? 'bg-blue-600/20 border border-blue-500/40 text-blue-200 shadow-sm'
                          : 'bg-slate-900/60 hover:bg-slate-800/60 border border-slate-800 text-slate-400'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="truncate font-mono text-[11px]">
                          {c.filePath.split('/').pop()}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500 shrink-0 ml-1">
                        L{c.startLine}-{c.endLine}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Live Citation Code Viewer (displays next to voice agent) */}
          {hasCitations && activeCitation && (
            <div className="flex-1 flex flex-col bg-[#0b0f19] min-w-0 overflow-hidden">
              <LiveCitationViewer
                repositoryId={repositoryId}
                citation={activeCitation}
                citationNumber={activeCitationIndex + 1}
                totalCitations={citations.length}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VoiceSessionActive({
  isMuted,
  setIsMuted,
  onCitationReceived,
  onClose,
}: {
  isMuted: boolean;
  setIsMuted: React.Dispatch<React.SetStateAction<boolean>>;
  onCitationReceived: (filePath: string, startLine: number, endLine: number) => void;
  onClose: () => void;
}) {
  const room = useRoomContext();
  const voiceAssistant = useVoiceAssistant();
  const { isMicrophoneEnabled } = useLocalParticipant();
  const [agentActivity, setAgentActivity] = useState<string>('');
  const [micTogglePending, setMicTogglePending] = useState<boolean>(false);
  const desiredMutedRef = useRef(isMuted);

  // Stable callback ref so onCitationReceived never triggers re-subscriptions
  const citationRef = useRef(onCitationReceived);
  useEffect(() => {
    citationRef.current = onCitationReceived;
  }, [onCitationReceived]);

  const applyDesiredMicState = useCallback(async () => {
    if (!room?.localParticipant) return;
    const shouldBeEnabled = !desiredMutedRef.current;
    if (room.localParticipant.isMicrophoneEnabled !== shouldBeEnabled) {
      setMicTogglePending(true);
      try {
        await room.localParticipant.setMicrophoneEnabled(shouldBeEnabled, ROOM_AUDIO_OPTIONS);
      } catch (e: any) {
        console.warn('Microphone toggle notice:', e.message);
        setIsMuted(!room.localParticipant.isMicrophoneEnabled);
      } finally {
        setMicTogglePending(false);
      }
    }
  }, [room, setIsMuted]);

  // Sync the requested mute state to LiveKit, then let the UI render from LiveKit's actual state.
  useEffect(() => {
    desiredMutedRef.current = isMuted;
    void applyDesiredMicState();
  }, [isMuted, applyDesiredMicState]);

  useEffect(() => {
    if (!room) return;

    const reapplyDesiredMicState = () => {
      void applyDesiredMicState();
    };

    room.on(RoomEvent.Reconnected, reapplyDesiredMicState);
    room.on(RoomEvent.LocalTrackPublished, reapplyDesiredMicState);
    return () => {
      room.off(RoomEvent.Reconnected, reapplyDesiredMicState);
      room.off(RoomEvent.LocalTrackPublished, reapplyDesiredMicState);
    };
  }, [room, applyDesiredMicState]);

  // Listen for LiveKit Data Channel citations and live agent tool activity
  useEffect(() => {
    if (!room) return;

    const handleData = (payload: Uint8Array) => {
      try {
        const text = new TextDecoder().decode(payload);
        const data = JSON.parse(text);
        if (data.type === 'rag_citation' && data.filePath) {
          citationRef.current(data.filePath, data.startLine || 1, data.endLine || 10);
        } else if (data.type === 'agent_activity' && data.activity) {
          setAgentActivity(data.activity);
        }
      } catch {
        // Ignored
      }
    };

    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room]);

  const [hasAgentJoined, setHasAgentJoined] = useState(false);
  const [canPlayAudio, setCanPlayAudio] = useState<boolean>(true);

  // Auto-mute while agent is thinking or speaking to prevent stray mic noise from aborting the answer
  const rawState = voiceAssistant.state;
  useEffect(() => {
    if (rawState === 'thinking' || rawState === 'speaking') {
      setIsMuted(true);
    }
    if (rawState === 'speaking') {
      setAgentActivity('');
    }
  }, [rawState, setIsMuted]);

  const handleInterrupt = useCallback(() => {
    if (!room?.localParticipant) return;
    try {
      const payload = JSON.stringify({ type: 'interrupt_agent' });
      room.localParticipant.publishData(new TextEncoder().encode(payload), {
        reliable: true,
      });
    } catch (err) {
      console.warn('Failed to send interrupt signal:', err);
    }
  }, [room]);

  const handleToggleMute = useCallback(() => {
    if (micTogglePending) return;
    setIsMuted(isMicrophoneEnabled);
  }, [isMicrophoneEnabled, micTogglePending, setIsMuted]);

  // Support Spacebar Push-To-Talk (Hold space to speak)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        const activeTag = document.activeElement?.tagName?.toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea') return;
        e.preventDefault();
        setIsMuted(false);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const activeTag = document.activeElement?.tagName?.toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea') return;
        e.preventDefault();
        setIsMuted(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Monitor and unlock browser audio autoplay
  useEffect(() => {
    if (!room) return;

    const checkPlayback = () => {
      setCanPlayAudio(room.canPlaybackAudio);
    };

    checkPlayback();

    const unlockAudio = () => {
      if (!room.canPlaybackAudio) {
        room.startAudio().then(() => {
          setCanPlayAudio(true);
        }).catch(() => {});
      }
    };

    unlockAudio();

    room.on(RoomEvent.AudioPlaybackStatusChanged, checkPlayback);
    window.addEventListener('click', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    return () => {
      room.off(RoomEvent.AudioPlaybackStatusChanged, checkPlayback);
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, [room]);

  useEffect(() => {
    if (voiceAssistant.agent) {
      setHasAgentJoined(true);
    }
  }, [voiceAssistant.agent]);

  const isAgentPresent = Boolean(voiceAssistant.agent) || hasAgentJoined;
  const isActuallyMuted = !isMicrophoneEnabled;

  // Determine user-friendly state
  // Only show Speaking or Thinking for the agent state
  let statusText = 'Listening';
  let badgeColor = 'bg-blue-400 animate-pulse';

  if (!isAgentPresent) {
    statusText = 'Connecting...';
    badgeColor = 'bg-amber-400 animate-pulse';
  } else if (rawState === 'speaking') {
    statusText = 'Speaking';
    badgeColor = 'bg-emerald-400 animate-ping';
  } else if (rawState === 'thinking') {
    statusText = 'Thinking';
    badgeColor = 'bg-purple-400 animate-pulse';
  } else {
    // Both 'listening' and idle between conversation turns
    statusText = micTogglePending
      ? isMuted
        ? 'Muting...'
        : 'Unmuting...'
      : isActuallyMuted
      ? 'Muted'
      : 'Listening';
    badgeColor = micTogglePending
      ? 'bg-amber-400 animate-pulse'
      : isActuallyMuted
      ? 'bg-rose-400'
      : 'bg-blue-400 animate-pulse';
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Agent Voice Waveform Visualizer */}
      <AgentAudioVisualizer
        state={rawState}
        audioTrack={voiceAssistant.audioTrack}
      />

      {/* State badge with accurate status */}
      <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-800/80 border border-slate-700 text-xs font-medium text-slate-300">
        <span className={`w-2.5 h-2.5 rounded-full ${badgeColor}`} />
        <span className="font-semibold text-slate-200">{statusText}</span>
      </div>

      {/* Browser Autoplay Blocked Banner */}
      {!canPlayAudio && (
        <button
          onClick={() => {
            room?.startAudio().then(() => setCanPlayAudio(true)).catch(() => {});
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/60 text-amber-200 text-xs font-semibold shadow-lg shadow-amber-950/40 animate-pulse transition-all cursor-pointer"
          title="Click to enable sound"
        >
          <VolumeX className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Click to Unmute Agent Voice (Browser Audio Blocked)</span>
        </button>
      )}

      {/* User Microphone Waveform & Loudness Level Line */}
      <UserMicVisualizer isMuted={isActuallyMuted} />

      {/* User Controls: Toggle Mute, Interrupt Agent, and End Session */}
      <div className="flex items-center gap-2.5 pt-1">
        <button
          onClick={handleToggleMute}
          disabled={micTogglePending}
          className={`p-3 rounded-full border transition-all ${
            isActuallyMuted
              ? 'bg-rose-950/80 border-rose-600 text-rose-400 shadow-rose-900/40 shadow-lg'
              : 'bg-blue-600 hover:bg-blue-500 border-blue-500 text-white shadow-lg shadow-blue-500/25'
          } ${micTogglePending ? 'opacity-70 cursor-wait' : ''}`}
          title={isActuallyMuted ? 'Click once to Unmute' : 'Click once to Mute'}
        >
          {isActuallyMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>

        {/* Immediate Interrupt / Barge-In Button (active when agent is speaking) */}
        {rawState === 'speaking' && (
          <button
            onClick={handleInterrupt}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-amber-500/20 hover:bg-amber-500/35 border border-amber-500/60 text-amber-300 text-xs font-semibold shadow-md animate-pulse transition-all"
            title="Interrupt agent and ask another question"
          >
            <Square className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span>Interrupt</span>
          </button>
        )}

        <button
          onClick={onClose}
          className="p-3 rounded-full bg-slate-800 hover:bg-rose-950/80 border border-slate-700 hover:border-rose-600 text-slate-400 hover:text-rose-400 transition-all shadow-md"
          title="End Voice Call"
        >
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-col items-center text-center gap-0.5">
        <span className="text-[11px] text-slate-300 font-mono">
          {isActuallyMuted ? 'Muted • Hold Space or click mic to talk' : 'Mic Live • Speaking now'}
        </span>
        <span className="text-[10px] text-slate-500">
          Hold Space to talk (Push-To-Talk) • Click Interrupt to stop speech anytime
        </span>
      </div>
    </div>
  );
}

/**
 * Agent Voice Output Visualizer
 * Uses LiveKit's official BarVisualizer to visualize the voice assistant's audio safely,
 * transitioning smoothly between states:
 * - 'speaking': Real-time frequency bars from the agent's audio track
 * - 'thinking': Pulse animation indicating active codebase search
 * - 'listening' / idle: Soft resting bars
 */
function AgentAudioVisualizer({
  state,
  audioTrack,
}: {
  state: any;
  audioTrack: any;
}) {
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center justify-center h-14 w-56 px-4 py-2 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-inner overflow-hidden">
        <BarVisualizer
          state={state}
          trackRef={audioTrack}
          barCount={9}
          options={{ minHeight: 14, maxHeight: 100 }}
        />
      </div>
    </div>
  );
}

/**
 * User Microphone Frequency & Loudness Visualizer
 * Uses LiveKit's useTrackVolume and useMultibandTrackVolume hooks.
 * Attaches mediaStream to local track if absent so LiveKit hooks function correctly.
 */
function UserMicVisualizer({ isMuted }: { isMuted: boolean }) {
  const { microphoneTrack, isMicrophoneEnabled } = useLocalParticipant();
  const effectiveMuted = isMuted || !isMicrophoneEnabled;

  // LiveKit volume hooks inspect track.mediaStream; ensure it's available for LocalAudioTrack
  useEffect(() => {
    if (
      microphoneTrack?.track &&
      !(microphoneTrack.track as any).mediaStream &&
      microphoneTrack.track.mediaStreamTrack
    ) {
      try {
        (microphoneTrack.track as any).mediaStream = new MediaStream([
          microphoneTrack.track.mediaStreamTrack,
        ]);
      } catch {}
    }
  }, [microphoneTrack]);

  const track = effectiveMuted ? undefined : (microphoneTrack?.track as any);

  const volume = useTrackVolume(track, {
    fftSize: 32,
    smoothingTimeConstant: 0.6,
  });

  const bands = useMultibandTrackVolume(track, {
    bands: 16,
    loPass: 100,
    hiPass: 400,
  });

  const volPercent = effectiveMuted ? 0 : Math.min(100, Math.round(volume * 100));
  const isSpeaking = volPercent > 6;

  return (
    <div className="w-full max-w-[320px] flex flex-col gap-2 p-3 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-inner">
      {/* Header with mic activity indicator */}
      <div className="flex items-center justify-between text-[11px] font-mono">
        <div className="flex items-center gap-2 text-slate-300">
          <span
            className={`w-2 h-2 rounded-full transition-colors ${
              effectiveMuted
                ? 'bg-rose-500'
                : isSpeaking
                ? 'bg-emerald-400 shadow-sm shadow-emerald-400/80 animate-pulse'
                : 'bg-slate-600'
            }`}
          />
          <span className="font-semibold text-slate-200">Your Voice Input</span>
          {effectiveMuted && (
            <span className="text-[10px] text-rose-400 font-normal">(Muted)</span>
          )}
        </div>
        <span className="text-[11px] font-semibold text-slate-400">
          {effectiveMuted ? '0%' : `${volPercent}%`}
        </span>
      </div>

      {/* Real-time Frequency Waveform Bars */}
      <div className="w-full h-7 flex items-center justify-between gap-1 px-1">
        {bands.map((freq, idx) => {
          const height = effectiveMuted ? 10 : Math.max(10, Math.round(freq * 100));
          const opacity = effectiveMuted ? 0.2 : height > 14 ? 0.95 : 0.35;
          return (
            <div
              key={idx}
              className="flex-1 rounded-full transition-all duration-75 bg-gradient-to-t from-blue-600 via-indigo-500 to-emerald-400"
              style={{ height: `${height}%`, opacity }}
            />
          );
        })}
      </div>

      {/* Continuous Loudness Level Line */}
      <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800/60 p-0.5">
        <div
          className="h-full rounded-full transition-all duration-75 bg-gradient-to-r from-blue-500 via-indigo-400 to-emerald-400"
          style={{ width: `${effectiveMuted ? 2 : Math.max(2, volPercent)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Live Citation Viewer
 * Renders next to or below the voice agent modal when citations are broadcasted.
 * Highlights the exact cited code ranges and auto-scrolls to them smoothly.
 */
function LiveCitationViewer({
  repositoryId,
  citation,
  citationNumber,
  totalCitations,
}: {
  repositoryId: string;
  citation: CitationItem;
  citationNumber: number;
  totalCitations: number;
}) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    fetchFileContent(repositoryId, citation.filePath)
      .then((res) => {
        if (!active) return;
        setContent(res.content || '');
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message || 'Failed to load file content');
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [repositoryId, citation.filePath]);

  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [content, citation.startLine]);

  const copyCode = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = content.split('\n');

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Citation Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800/80 bg-[#121828] shrink-0">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shrink-0">
            <Code2 className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex flex-col overflow-hidden">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-blue-300 font-semibold truncate">
                {citation.filePath}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded bg-blue-950 border border-blue-800/60 text-blue-300 font-mono shrink-0">
                L{citation.startLine}-{citation.endLine}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 flex items-center gap-1">
              <span>Voice Citation</span>
              <ChevronRight className="w-3 h-3 text-slate-600" />
              <span>
                {citationNumber} of {totalCitations}
              </span>
            </span>
          </div>
        </div>

        <button
          onClick={copyCode}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/60 text-slate-300 transition shrink-0"
          title="Copy file content"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 text-[11px]">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px]">Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Content Area */}
      <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-5 bg-[#090d16]">
        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">Loading cited code snippet...</span>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-800/40 text-rose-300 text-xs text-center my-auto">
            {error}
          </div>
        )}

        {!loading && !error && lines.length > 0 && (
          <div className="table w-full border-collapse">
            {lines.map((lineText, idx) => {
              const lineNum = idx + 1;
              const isHighlighted = lineNum >= citation.startLine && lineNum <= citation.endLine;
              const isStart = lineNum === citation.startLine;

              return (
                <div
                  key={lineNum}
                  ref={isStart ? highlightRef : undefined}
                  className={`table-row transition-colors ${
                    isHighlighted
                      ? 'bg-blue-600/15 border-l-4 border-blue-400 text-blue-100 font-medium'
                      : 'hover:bg-slate-900/40 text-slate-400'
                  }`}
                >
                  {/* Line Number */}
                  <span
                    className={`table-cell pr-4 text-right select-none font-mono text-[11px] w-12 ${
                      isHighlighted ? 'text-blue-400 font-bold' : 'text-slate-600'
                    }`}
                  >
                    {lineNum}
                  </span>

                  {/* Code Line Text */}
                  <span className="table-cell whitespace-pre font-mono pl-2">
                    {lineText || ' '}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
