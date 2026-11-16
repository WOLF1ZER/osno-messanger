import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { FiMic, FiMicOff, FiVolume2, FiVolumeX, FiPhoneOff, FiPhone, FiVideo, FiVideoOff, FiUsers } from "react-icons/fi";
import Avatar from "../ui/Avatar";
import DisplayName from "../ui/DisplayName";
import { useLiveKitRoom } from "../../lib/useLiveKitRoom";
import { formatDuration } from "../../lib/format";

const T = "[@media(min-height:700px)]:"; // roomier spacing on taller screens

const Control = ({ active, onClick, label, children }) => (
  <div className="flex flex-col items-center gap-3">
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full grid place-items-center border transition-all duration-300 ${
        active ? "bg-white text-black border-white" : "border-white/25 text-white hover:border-white bg-white/5 backdrop-blur-md"
      }`}
    >
      {children}
    </button>
    <span className="eyebrow">{label}</span>
  </div>
);

const RoundAction = ({ onClick, label, filled, children }) => (
  <div className="flex flex-col items-center gap-3">
    <button
      onClick={onClick}
      aria-label={label}
      className={`w-[72px] h-[72px] sm:w-20 sm:h-20 rounded-full grid place-items-center transition-transform hover:scale-105 active:scale-95 ${
        filled ? "bg-white text-black" : "border-2 border-white text-white bg-white/5 backdrop-blur-md"
      }`}
    >
      {children}
    </button>
    <span className="eyebrow text-white">{label}</span>
  </div>
);

/** A LiveKit video track rendered into a <video>. */
const VideoView = ({ track, mirror, className = "" }) => {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!track || !el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return <video ref={ref} autoPlay playsInline muted className={`${className} ${mirror ? "-scale-x-100" : ""}`} />;
};

/** One person in a group call grid. */
const Tile = ({ p, profile }) => (
  <div
    className={`relative overflow-hidden rounded-2xl bg-white/[0.04] border transition-colors duration-200 grid place-items-center min-h-0 ${
      p.speaking ? "border-white shadow-[0_0_0_2px_rgba(255,255,255,0.6)]" : "border-white/10"
    }`}
  >
    {p.videoTrack ? (
      <VideoView track={p.videoTrack} mirror={p.isLocal} className="absolute inset-0 w-full h-full object-cover" />
    ) : (
      <div className="pb-6">
        <Avatar name={profile?.name ?? p.name} src={profile?.avatar} size="md" className="sm:hidden" />
        <Avatar name={profile?.name ?? p.name} src={profile?.avatar} size="lg" className="hidden sm:block" />
      </div>
    )}
    <div className="absolute left-2 bottom-2 right-2 flex items-center gap-2">
      <span className="max-w-full truncate px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-[12px] text-white">
        {p.isLocal ? "You" : profile?.name ?? p.name}
      </span>
      {!p.micOn && (
        <span className="w-6 h-6 shrink-0 grid place-items-center rounded-full bg-black/60 text-white">
          <FiMicOff size={12} />
        </span>
      )}
    </div>
  </div>
);

const gridClass = (n) =>
  n <= 1 ? "grid-cols-1" : n === 2 ? "grid-cols-1 sm:grid-cols-2" : n <= 4 ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-3";

/**
 * Full-screen call UI: incoming ring, outgoing ring and the live call.
 * 1:1 calls show the other person full screen; group calls show a grid of everyone (max 5).
 */
const CallScreen = ({ call, title, avatarUser, people, onAccept, onDecline, onHangUp }) => {
  const incomingRinging = call.direction === "incoming" && call.status === "ringing";
  const inRoom = call.direction === "outgoing" || call.status === "active";
  const lk = useLiveKitRoom({ callId: call.id, enabled: inRoom, video: call.video });
  const live = lk.peerJoined;

  const [startedAt, setStartedAt] = useState(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (live && !startedAt) setStartedAt(call.answeredAt ?? Date.now());
  }, [live, startedAt, call.answeredAt]);
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && (incomingRinging ? onDecline() : onHangUp());
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [incomingRinging, onDecline, onHangUp]);

  const caller = people[call.peerId];
  const statusText = incomingRinging
    ? call.isGroup
      ? `${caller?.name ?? "Someone"} is calling the group`
      : call.video ? "Incoming video call" : "Incoming call"
    : lk.state === "error"
      ? "Connection problem"
      : !live
        ? call.direction === "outgoing" && call.status === "ringing"
          ? call.isGroup ? "Calling the group…" : "Calling…"
          : "Connecting…"
        : formatDuration((now - (startedAt ?? now)) / 1000);

  const showGrid = call.isGroup && inRoom && lk.state === "connected" && live;
  const remote = lk.remotes[0];
  const showRemoteVideo = !call.isGroup && Boolean(remote?.videoTrack);
  const compactHeader = showGrid || showRemoteVideo;

  return (
    <motion.div
      className="fixed inset-0 z-[200] bg-space flex flex-col overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-label={`Call with ${title}`}
    >
      <div ref={lk.audioContainerRef} className="hidden" />

      {/* 1:1: other person's video fills the screen */}
      {showRemoteVideo && (
        <>
          <VideoView track={remote.videoTrack} className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80 pointer-events-none" />
        </>
      )}
      {!showRemoteVideo && <div className="absolute inset-0 bg-grid opacity-60 pointer-events-none" />}

      {/* 1:1: my camera, picture-in-picture */}
      {!call.isGroup && lk.local?.videoTrack && (
        <VideoView
          track={lk.local.videoTrack}
          mirror
          className="absolute top-6 right-6 z-10 w-28 sm:w-44 aspect-[3/4] object-cover rounded-2xl border border-white/20 shadow-2xl"
        />
      )}

      {/* header / ringing view */}
      <div
        className={`relative flex flex-col items-center px-6 text-center ${
          compactHeader ? "shrink-0 pt-6 pb-4" : `flex-1 min-h-0 py-6 justify-center overflow-hidden`
        }`}
      >
        <p className={`eyebrow ${compactHeader ? "mb-2" : `mb-6 ${T}mb-10`} flex items-center gap-2`}>
          {call.isGroup && <FiUsers size={12} />}
          {call.isGroup ? "Group" : "OSNO"} {call.video ? "video" : "voice"}
          {showGrid && ` · ${lk.participants.length} in call`}
        </p>
        {!compactHeader && (
          <div className="relative grid place-items-center">
            {!live &&
              [0, 0.8, 1.6].map((d) => (
                <span
                  key={d}
                  className={`absolute w-28 h-28 ${T}w-36 ${T}h-36 rounded-full border border-white/30 animate-ring`}
                  style={{ animationDelay: `${d}s` }}
                />
              ))}
            <Avatar name={title} src={avatarUser?.avatar} size="xl" group={call.isGroup} className={`${T}hidden`} />
            <Avatar name={title} src={avatarUser?.avatar} size="2xl" group={call.isGroup} className={`hidden ${T}block`} />
          </div>
        )}
        <DisplayName
          as="h1"
          name={title}
          size={compactHeader ? "md" : "lg"}
          className={`max-w-3xl ${compactHeader ? "" : `mt-6 ${T}mt-10`}`}
        />
        <p className={`${compactHeader ? "mt-1" : `mt-3 ${T}mt-4`} font-display text-lg ${T}text-xl tracking-widest2 tabular-nums text-ink-300`}>
          {statusText}
        </p>
        {lk.error && <p className="mt-4 max-w-sm text-sm text-ink-200 border border-white/20 px-4 py-2">{lk.error}</p>}
      </div>

      {/* group grid */}
      {showGrid && (
        <div className={`relative flex-1 min-h-0 grid ${gridClass(lk.participants.length)} auto-rows-fr gap-2 sm:gap-3 px-3 sm:px-6`}>
          {lk.participants.map((p) => (
            <Tile key={p.id} p={p} profile={people[p.id]} />
          ))}
        </div>
      )}
      {(showRemoteVideo || (showGrid === false && compactHeader)) && <div className="flex-1" />}

      {/* controls */}
      <div className={`relative shrink-0 pt-4 pb-8 ${T}pb-14 flex items-start justify-center gap-4 sm:gap-10`}>
        {incomingRinging ? (
          <>
            <RoundAction onClick={onDecline} label="Decline">
              <FiPhoneOff size={26} />
            </RoundAction>
            <RoundAction onClick={onAccept} label={call.isGroup ? "Join" : "Accept"} filled>
              {call.video ? <FiVideo size={26} /> : <FiPhone size={26} />}
            </RoundAction>
          </>
        ) : (
          <>
            <Control active={!lk.micOn} onClick={lk.toggleMic} label={lk.micOn ? "Mute" : "Unmute"}>
              {lk.micOn ? <FiMic size={22} /> : <FiMicOff size={22} />}
            </Control>
            <Control
              active={call.video && !lk.camOn}
              onClick={lk.toggleCam}
              label={lk.camOn ? "Camera" : call.video ? "Cam off" : "Video"}
            >
              {lk.camOn || !call.video ? <FiVideo size={22} /> : <FiVideoOff size={22} />}
            </Control>
            <RoundAction onClick={onHangUp} label={call.isGroup ? "Leave" : "End"} filled>
              <FiPhoneOff size={26} />
            </RoundAction>
            <Control active={!lk.speakerOn} onClick={lk.toggleSpeaker} label={lk.speakerOn ? "Speaker" : "Muted"}>
              {lk.speakerOn ? <FiVolume2 size={22} /> : <FiVolumeX size={22} />}
            </Control>
          </>
        )}
      </div>
    </motion.div>
  );
};

export default CallScreen;
