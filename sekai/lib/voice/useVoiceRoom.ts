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
import type { VoiceParticipant } from "@/components/VoiceRoom";

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