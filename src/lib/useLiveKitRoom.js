import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import { LIVEKIT_URL } from "./supabase";
import { getLivekitToken } from "./api";

/** Snapshot of one person in the room, for rendering a tile. */
const snapshot = (p, isLocal, speakers) => {
  const cam = p.getTrackPublication(Track.Source.Camera);
  const mic = p.getTrackPublication(Track.Source.Microphone);
  return {
    id: p.identity,
    name: p.name || p.identity,
    isLocal,
    videoTrack: cam?.track && !cam.isMuted ? cam.track : null,
    micOn: Boolean(mic?.track) && !mic.isMuted,
    speaking: speakers.has(p.identity),
  };
};

/**
 * Joins the LiveKit room for a call (1:1 or group) and keeps a list of participants
 * with their video tracks. Remote audio is played through hidden <audio> elements.
 * `enabled` = true once we should be in the room (caller: immediately; others: after joining).
 */
export const useLiveKitRoom = ({ callId, enabled, video }) => {
  const roomRef = useRef(null);
  const audioContainerRef = useRef(null);
  const [state, setState] = useState("idle"); // idle | connecting | connected | error
  const [participants, setParticipants] = useState([]); // local first, then remotes
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(video);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [error, setError] = useState(null);
  const [audioBlocked, setAudioBlocked] = useState(false); // browser autoplay policy blocked call sound
  const speakerOnRef = useRef(true);

  useEffect(() => {
    if (!enabled || !callId) return;
    if (!LIVEKIT_URL) {
      setState("error");
      setError("VITE_LIVEKIT_URL is not set — add it to .env.local.");
      return;
    }
    let cancelled = false;
    let speakers = new Set();
    const container = audioContainerRef.current;
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    roomRef.current = room;

    const refresh = () => {
      if (cancelled) return;
      setParticipants([
        snapshot(room.localParticipant, true, speakers),
        ...[...room.remoteParticipants.values()].map((p) => snapshot(p, false, speakers)),
      ]);
    };

    room
      .on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          // play the other person's voice through an <audio> element
          const el = track.attach();
          el.autoplay = true;
          el.setAttribute("playsinline", "");
          el.muted = !speakerOnRef.current;
          (audioContainerRef.current ?? document.body).appendChild(el);
          // phones/Safari block sound that wasn't started by a tap -> ask the user to tap
          el.play?.().catch(() => !cancelled && setAudioBlocked(true));
        }
        refresh();
      })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) track.detach().forEach((el) => el.remove());
        refresh();
      })
      .on(RoomEvent.TrackMuted, refresh)
      .on(RoomEvent.TrackUnmuted, refresh)
      .on(RoomEvent.LocalTrackPublished, refresh)
      .on(RoomEvent.LocalTrackUnpublished, refresh)
      .on(RoomEvent.ParticipantConnected, refresh)
      .on(RoomEvent.ParticipantDisconnected, refresh)
      .on(RoomEvent.ActiveSpeakersChanged, (list) => {
        speakers = new Set(list.map((p) => p.identity));
        refresh();
      })
      .on(RoomEvent.AudioPlaybackStatusChanged, () => !cancelled && setAudioBlocked(!room.canPlaybackAudio))
      .on(RoomEvent.Disconnected, () => !cancelled && setState("idle"));

    (async () => {
      try {
        setState("connecting");
        const { token } = await getLivekitToken(callId);
        if (cancelled) return;
        await room.connect(LIVEKIT_URL, token);
        if (cancelled) return room.disconnect();
        // unlock playback of remote audio (works when the browser still counts the user's tap)
        await room.startAudio().catch(() => {});
        if (!cancelled) setAudioBlocked(!room.canPlaybackAudio);
        await room.localParticipant.setMicrophoneEnabled(true);
        if (video) await room.localParticipant.setCameraEnabled(true);
        setState("connected");
        refresh();
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setState("error");
          setError(e.name === "NotAllowedError" ? "Microphone / camera permission was denied." : e.message || "Couldn't connect the call.");
        }
      }
    })();

    return () => {
      cancelled = true;
      room.disconnect();
      roomRef.current = null;
      container?.querySelectorAll("audio").forEach((a) => a.remove());
    };
  }, [callId, enabled, video]);

  /** Called from the "Tap to turn on sound" button (a real tap, so the browser allows playback). */
  const enableAudio = useCallback(async () => {
    const room = roomRef.current;
    try {
      await room?.startAudio();
      await Promise.all(
        [...(audioContainerRef.current?.querySelectorAll("audio") ?? [])].map((a) => a.play().catch(() => {})),
      );
      setAudioBlocked(room ? !room.canPlaybackAudio : false);
    } catch (e) {
      console.warn("enableAudio failed", e);
    }
  }, []);

  const toggleMic = useCallback(async () => {
    const next = !micOn;
    setMicOn(next);
    await roomRef.current?.localParticipant.setMicrophoneEnabled(next);
  }, [micOn]);

  const toggleCam = useCallback(async () => {
    const next = !camOn;
    setCamOn(next);
    try {
      await roomRef.current?.localParticipant.setCameraEnabled(next);
    } catch (e) {
      setCamOn(!next);
      setError(e.name === "NotAllowedError" ? "Camera permission was denied." : e.message);
    }
  }, [camOn]);

  const toggleSpeaker = useCallback(() => {
    const next = !speakerOn;
    setSpeakerOn(next);
    speakerOnRef.current = next;
    audioContainerRef.current?.querySelectorAll("audio").forEach((a) => (a.muted = !next));
  }, [speakerOn]);

  const remotes = participants.filter((p) => !p.isLocal);
  const local = participants.find((p) => p.isLocal) ?? null;

  return {
    state, error, participants, remotes, local,
    peerJoined: remotes.length > 0,
    micOn, camOn, speakerOn, audioBlocked,
    toggleMic, toggleCam, toggleSpeaker, enableAudio,
    audioContainerRef,
  };
};
