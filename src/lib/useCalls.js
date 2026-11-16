import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import * as api from "./api";

const RING_TIMEOUT_MS = 35_000;
const FINAL = ["ended", "missed", "declined", "cancelled"];
const ONGOING_WINDOW_MS = 6 * 60 * 60_000; // ignore stale "active" group calls older than this
const SEEN_KEY = "osno:calls-seen-at";

const readSeen = () => {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
};

const sortRows = (rows) => [...rows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));

/**
 * Call signalling over Supabase (1:1 and group):
 *  - caller inserts a `calls` row (status "ringing"); the server adds them to call_participants
 *  - others get it through Realtime (or a push notification) and join with join_call()
 *  - everyone in the call is in LiveKit room `call-<id>` (see useLiveKitRoom)
 *  - leave_call() hangs up; a 1:1 call ends for both, a group call ends when the last person leaves
 */
export const useCalls = ({ me, ensurePeople, fail }) => {
  const myId = me?.id;
  const [history, setHistory] = useState([]); // raw rows (with call_participants)
  const [current, setCurrent] = useState(null); // { id, chatId, peerId, isGroup, video, direction, status, answeredAt }
  const [seenAt, setSeenAt] = useState(readSeen);
  const currentRef = useRef(null);
  currentRef.current = current;
  const ringTimer = useRef(null);

  const upsertRow = useCallback((row) => {
    setHistory((list) => {
      const old = list.find((r) => r.id === row.id);
      const merged = { ...old, ...row, call_participants: row.call_participants ?? old?.call_participants ?? [] };
      return sortRows([merged, ...list.filter((r) => r.id !== row.id)]);
    });
  }, []);

  const finishLocal = useCallback(() => {
    clearTimeout(ringTimer.current);
    setCurrent(null);
  }, []);

  const isForMe = useCallback(
    (row) => row.caller_id !== myId && (row.callee_id === myId || row.is_group),
    [myId],
  );

  const ringIfIncoming = useCallback(
    (row) => {
      if (!isForMe(row) || row.status !== "ringing" || currentRef.current) return false;
      ensurePeople([row.caller_id]);
      setCurrent({
        id: row.id,
        chatId: row.chat_id,
        peerId: row.caller_id,
        isGroup: row.is_group,
        video: row.video,
        direction: "incoming",
        status: "ringing",
      });
      return true;
    },
    [isForMe, ensurePeople],
  );

  // initial history (+ pick up a call that is still ringing, e.g. opened from a push notification)
  useEffect(() => {
    if (!myId) return;
    api
      .fetchCalls()
      .then((rows) => {
        setHistory(rows);
        ensurePeople(rows.flatMap((r) => [r.caller_id, r.callee_id]));
        const ringing = rows.find((r) => r.status === "ringing" && isForMe(r) && Date.now() - Date.parse(r.created_at) < 40_000);
        if (ringing) ringIfIncoming(ringing);
      })
      .catch((e) => fail(e, "Couldn't load calls"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId]);

  // Realtime: new calls, status changes, people joining / leaving
  useEffect(() => {
    if (!myId) return;
    const channel = supabase
      .channel(`calls-${myId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "calls" }, ({ new: row }) => {
        upsertRow(row);
        if (!isForMe(row) || row.status !== "ringing") return;
        if (currentRef.current) {
          if (!row.is_group) api.leaveCall(row.id); // busy: decline 1:1 calls
          return;
        }
        ringIfIncoming(row);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "calls" }, ({ new: row }) => {
        upsertRow(row);
        const cur = currentRef.current;
        if (!cur || cur.id !== row.id) return;
        if (FINAL.includes(row.status)) finishLocal();
        else if (row.status === "active" && cur.status === "ringing" && cur.direction === "outgoing") {
          clearTimeout(ringTimer.current);
          setCurrent({ ...cur, status: "active", answeredAt: Date.parse(row.answered_at ?? new Date().toISOString()) });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "call_participants" }, ({ new: p }) => {
        if (!p?.call_id) return;
        setHistory((list) =>
          list.map((r) =>
            r.id === p.call_id
              ? { ...r, call_participants: [...(r.call_participants ?? []).filter((x) => x.user_id !== p.user_id), p] }
              : r,
          ),
        );
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [myId, upsertRow, finishLocal, isForMe, ringIfIncoming]);

  const startCall = useCallback(
    async ({ chatId, peerId, video = false, isGroup = false }) => {
      if (currentRef.current) return;
      try {
        const row = await api.createCall({
          chat_id: chatId,
          caller_id: myId,
          callee_id: isGroup ? null : peerId,
          is_group: isGroup,
          video,
        });
        upsertRow(row);
        setCurrent({ id: row.id, chatId, peerId, isGroup, video, direction: "outgoing", status: "ringing" });
        clearTimeout(ringTimer.current);
        ringTimer.current = setTimeout(async () => {
          if (currentRef.current?.id === row.id && currentRef.current.status === "ringing") {
            await api.updateCall(row.id, { status: "missed", ended_at: new Date().toISOString() });
            finishLocal();
          }
        }, RING_TIMEOUT_MS);
      } catch (e) {
        fail(e, "Couldn't start the call");
      }
    },
    [myId, upsertRow, finishLocal, fail],
  );

  const accept = async () => {
    const cur = currentRef.current;
    if (!cur) return;
    setCurrent({ ...cur, status: "active", answeredAt: Date.now() });
    try {
      await api.joinCall(cur.id);
    } catch (e) {
      finishLocal();
      fail(e, "Couldn't join the call");
    }
  };

  /** Join a group call that is already going on. */
  const joinOngoing = async (call) => {
    if (currentRef.current) return;
    setCurrent({
      id: call.id,
      chatId: call.chatId,
      peerId: call.callerId,
      isGroup: true,
      video: call.video,
      direction: "incoming",
      status: "active",
      answeredAt: Date.now(),
    });
    try {
      await api.joinCall(call.id);
    } catch (e) {
      finishLocal();
      fail(e, "Couldn't join the call");
    }
  };

  const hangUp = async () => {
    const cur = currentRef.current;
    if (!cur) return;
    finishLocal();
    const { error } = await api.leaveCall(cur.id);
    if (error) fail(error, "Call update failed");
  };

  const decline = hangUp; // server decides: 1:1 -> "declined", group -> others keep ringing

  const markSeen = () => {
    const now = Date.now();
    setSeenAt(now);
    try {
      localStorage.setItem(SEEN_KEY, String(now));
    } catch {
      /* private mode etc. */
    }
  };

  const calls = useMemo(() => history.map((r) => api.toUiCall(r, myId)), [history, myId]);
  const missedCount = calls.filter((c) => c.direction === "incoming" && c.missed && c.timestamp > seenAt).length;

  // group calls currently going on, by chat (for the "Join" banner)
  const ongoingByChat = useMemo(() => {
    const out = {};
    for (const c of calls) {
      if (!c.isGroup || !["ringing", "active"].includes(c.status)) continue;
      if (Date.now() - c.timestamp > ONGOING_WINDOW_MS || c.id === current?.id) continue;
      if (!out[c.chatId]) out[c.chatId] = c;
    }
    return out;
  }, [calls, current?.id]);

  return { calls, current, startCall, accept, decline, hangUp, joinOngoing, ongoingByChat, missedCount, markSeen };
};
