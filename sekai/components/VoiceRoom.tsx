"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  LocalParticipant,
  RemoteParticipant,
  Participant,
} from "livekit-client";
import {
  Camera,
  CameraOff,
  LoaderCircle,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Volume2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface VoiceParticipant {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  isSpeaking: boolean;
  isMuted: boolean;
  isCameraOn: boolean;
  isSharingScreen: boolean;
  videoStreamElementId: string;
}

interface UseVoiceRoomOptions {
  channelId: string;
  currentUser: { id: string; displayName: string; avatarUrl?: string | null };
}

function elementIdFor(identity: string) {
  return `voice-track-${identity}`;
}

export function useVoiceRoom({ channelId, currentUser }: UseVoiceRoomOptions) {
  const roomRef = useRef<Room | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [localState, setLocalState] = useState({
    isMuted: true,
    isCameraOn: false,
    isSharingScreen: false,
  });

  const rebuildParticipants = useCallback((room: Room, speakers: Set<string>) => {
    const all: Participant[] = [room.localParticipant, ...Array.from(room.remoteParticipants.values())];

    setParticipants(
      all.map((p) => {
        const isLocal = p instanceof LocalParticipant;
        const cam = p.getTrackPublication(Track.Source.Camera);
        const screen = p.getTrackPublication(Track.Source.ScreenShare);

        return {
          id: p.identity,
          displayName: isLocal ? currentUser.displayName : p.name || p.identity,
          avatarUrl: isLocal ? currentUser.avatarUrl : undefined,
          isSpeaking: speakers.has(p.identity),
          isMuted: p.isMicrophoneEnabled === false,
          isCameraOn: !!cam && !cam.isMuted,
          isSharingScreen: !!screen && !screen.isMuted,
          videoStreamElementId: elementIdFor(p.identity),
        };
      })
    );
  }, [currentUser]);

  // Anexa/desanexa trilhas de vídeo/tela na div correspondente (id = videoStreamElementId)
  const attachTrack = useCallback((participant: Participant, pub: any) => {
    if (!pub.track || (pub.source !== Track.Source.Camera && pub.source !== Track.Source.ScreenShare)) return;
    const el = document.getElementById(elementIdFor(participant.identity));
    if (!el) return;
    el.innerHTML = "";
    const mediaEl = pub.track.attach();
    mediaEl.style.width = "100%";
    mediaEl.style.height = "100%";
    mediaEl.style.objectFit = "cover";
    el.appendChild(mediaEl);
  }, []);

  useEffect(() => {
    if (!channelId) return;
    let cancelled = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    const speakers = new Set<string>();

    async function connect() {
      setConnecting(true);
      setError(null);
      try {
        if (!process.env.NEXT_PUBLIC_LIVEKIT_URL) {
          throw new Error(
            "Voz não configurada: falta NEXT_PUBLIC_LIVEKIT_URL no .env.local (veja o guia de configuração do LiveKit)."
          );
        }

        const supabase = (await import("@/lib/supabase/client")).createClient();
        const { data: { session } } = await supabase.auth.getSession();

        const res = await fetch(`/api/livekit-token?channelId=${channelId}`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Falha ao obter token de voz (HTTP ${res.status})`);
        }

        const { token } = await res.json();
        if (cancelled) return;

        await room.connect(process.env.NEXT_PUBLIC_LIVEKIT_URL, token);
        await room.localParticipant.setMicrophoneEnabled(false); // entra mutado por padrão

        setConnected(true);
        rebuildParticipants(room, speakers);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Não foi possível conectar à chamada de voz.");
      } finally {
        if (!cancelled) setConnecting(false);
      }
    }

    room
      .on(RoomEvent.ParticipantConnected, () => rebuildParticipants(room, speakers))
      .on(RoomEvent.ParticipantDisconnected, () => rebuildParticipants(room, speakers))
      .on(RoomEvent.TrackSubscribed, (_track, pub, participant) => {
        attachTrack(participant, pub);
        rebuildParticipants(room, speakers);
      })
      .on(RoomEvent.TrackUnsubscribed, () => rebuildParticipants(room, speakers))
      .on(RoomEvent.LocalTrackPublished, (pub) => {
        attachTrack(room.localParticipant, pub);
        rebuildParticipants(room, speakers);
      })
      .on(RoomEvent.ActiveSpeakersChanged, (activeSpeakers) => {
        speakers.clear();
        activeSpeakers.forEach((p) => speakers.add(p.identity));
        rebuildParticipants(room, speakers);
      });

    connect();

    return () => {
      cancelled = true;
      room.disconnect();
      roomRef.current = null;
      setConnected(false);
    };
  }, [channelId, rebuildParticipants, attachTrack]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !room.localParticipant.isMicrophoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(next);
    setLocalState((s) => ({ ...s, isMuted: !next }));
  }, []);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !room.localParticipant.isCameraEnabled;
    await room.localParticipant.setCameraEnabled(next);
    setLocalState((s) => ({ ...s, isCameraOn: next }));
  }, []);

  const toggleScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !room.localParticipant.isScreenShareEnabled;
    await room.localParticipant.setScreenShareEnabled(next, { audio: true });
    setLocalState((s) => ({ ...s, isSharingScreen: next }));
  }, []);

  const disconnect = useCallback(() => {
    roomRef.current?.disconnect();
  }, []);

  return { connected, connecting, error, participants, localState, toggleMic, toggleCamera, toggleScreenShare, disconnect };
}

interface VoiceRoomProps {
  channelName: string;
  participants: VoiceParticipant[];
  connecting: boolean;
  error: string | null;
  localState: {
    isMuted: boolean;
    isCameraOn: boolean;
    isSharingScreen: boolean;
  };
  onToggleMic: () => void | Promise<void>;
  onToggleCamera: () => void | Promise<void>;
  onToggleScreenShare: () => void | Promise<void>;
  onDisconnect: () => void;
}

export function VoiceRoom({
  channelName,
  participants,
  connecting,
  error,
  localState,
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
  onDisconnect,
}: VoiceRoomProps) {
  return (
    <section className="flex h-full min-h-0 flex-1 flex-col bg-discord-bg-primary">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/20 px-4 shadow-sm">
        <Volume2 className="h-5 w-5 text-discord-text-muted" />
        <h1 className="font-semibold text-discord-header-primary">{channelName}</h1>
        <span className="ml-auto text-xs text-discord-text-muted">
          {connecting ? "Conectando…" : `${participants.length} ${participants.length === 1 ? "participante" : "participantes"}`}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {connecting && participants.length === 0 ? (
          <div className="flex h-full min-h-40 items-center justify-center gap-2 text-sm text-discord-text-muted">
            <LoaderCircle className="h-5 w-5 animate-spin" />
            Conectando à sala de voz…
          </div>
        ) : participants.length === 0 ? (
          <div className="flex h-full min-h-40 items-center justify-center text-sm text-discord-text-muted">
            Ninguém está na sala de voz ainda.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {participants.map((participant) => (
              <article
                key={participant.id}
                className={cn(
                  "overflow-hidden rounded-xl border bg-discord-bg-secondary",
                  participant.isSpeaking ? "border-discord-brand shadow-[0_0_0_1px_var(--discord-brand)]" : "border-black/20"
                )}
              >
                <div className="relative aspect-video bg-discord-bg-dark">
                  <div id={participant.videoStreamElementId} className="absolute inset-0 overflow-hidden" />
                  {!participant.isCameraOn && !participant.isSharingScreen && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                      <div className="h-16 w-16 overflow-hidden rounded-full bg-discord-brand">
                        {participant.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={participant.avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xl font-bold text-white">
                            {participant.displayName[0]?.toUpperCase() ?? "?"}
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-discord-text-muted">Câmera desligada</span>
                    </div>
                  )}
                  {participant.isSharingScreen && (
                    <span className="absolute left-2 top-2 flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-xs text-white">
                      <MonitorUp className="h-3.5 w-3.5" /> Tela
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="truncate text-sm font-medium text-discord-header-primary">
                    {participant.displayName}
                  </span>
                  {participant.isMuted ? (
                    <MicOff aria-label="Microfone desligado" className="h-4 w-4 shrink-0 text-red-400" />
                  ) : (
                    <Mic aria-label="Microfone ligado" className="h-4 w-4 shrink-0 text-discord-text-muted" />
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-center gap-3 border-t border-black/20 bg-discord-bg-secondary px-4 py-3">
        <button
          type="button"
          onClick={onToggleMic}
          disabled={connecting}
          aria-label={localState.isMuted ? "Ativar microfone" : "Desativar microfone"}
          title={localState.isMuted ? "Ativar microfone" : "Desativar microfone"}
          className={cn(
            "rounded-full p-3 text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            localState.isMuted ? "bg-red-600 hover:bg-red-500" : "bg-discord-bg-dark hover:bg-discord-bg-modifier-hover"
          )}
        >
          {localState.isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={onToggleCamera}
          disabled={connecting}
          aria-label={localState.isCameraOn ? "Desativar câmera" : "Ativar câmera"}
          title={localState.isCameraOn ? "Desativar câmera" : "Ativar câmera"}
          className="rounded-full bg-discord-bg-dark p-3 text-white transition-colors hover:bg-discord-bg-modifier-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {localState.isCameraOn ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={onToggleScreenShare}
          disabled={connecting}
          aria-label={localState.isSharingScreen ? "Parar compartilhamento" : "Compartilhar tela"}
          title={localState.isSharingScreen ? "Parar compartilhamento" : "Compartilhar tela"}
          className={cn(
            "rounded-full p-3 text-white transition-colors hover:bg-discord-bg-modifier-hover disabled:cursor-not-allowed disabled:opacity-50",
            localState.isSharingScreen ? "bg-discord-brand" : "bg-discord-bg-dark"
          )}
        >
          <MonitorUp className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onDisconnect}
          aria-label="Sair da sala de voz"
          title="Sair da sala de voz"
          className="rounded-full bg-red-600 p-3 text-white transition-colors hover:bg-red-500"
        >
          <PhoneOff className="h-5 w-5" />
        </button>
      </footer>
    </section>
  );
}
