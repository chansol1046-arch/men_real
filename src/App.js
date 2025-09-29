import React, { useRef, useState, useEffect } from "react";

/** ★ Apps Script 웹앱 URL */
const WEBAPP_URL =
  "https://script.google.com/macros/s/AKfycbxG4BwY5JvxFH9AATgc_Khx4dt8hJ7XqwmDNvT_V3OSZb9l_SWQtlqHUOANkza2V8Kl/exec";

/** ⏱ 시간초과 안내 배너 노출 시간(ms) */
const TIMEOUT_BANNER_MS = 3000;

// ===== CONFIG =====
const CONFIG = {
  totalTurns: 20,
  userTurnTimeLimitSec: 15, // 사용자 제한시간 15초
  preMatchMinMs: 10000,
  preMatchMaxMs: 11000,

  // 상대가 "맞출 때" 대기 시간: 최소 5초 보장 (5~7초)
  opponentSolveMinMs: 5000,
  opponentSolveMaxMs: 7000,

  // 상대가 "틀릴 때" 대기 시간: 10~15초
  opponentFailMinMs: 10000,
  opponentFailMaxMs: 15000,

  // 상대는 총 4번 맞추게 (상대 턴 1-based 인덱스)
  opponentSuccessIndices: [2, 5, 7, 9],

  // 코멘트 선택 가능 시간 15초
  commentWindowMs: 15000,

  feedbackShowMs: 1200,
};

const TEAM_PRIZE_THRESHOLD = 15;

/** ✅ 상대 이름(한 곳에서 관리) */
const OPPONENT_NAME = "김민준";

// ===== WORD BANKS =====
// 사용자 문제(쉬운 단어, 6자 이하)
const USER_WORDS = [
  "cat",
  "book",
  "happy",
  "music",
  "paper",
  "smart",
  "ocean",
  "apple",
  "table",
  "house",
];

// 상대(컴퓨터) 문제(컴퓨터 정답 턴: 2,5,7,9)
const OPP_WORDS = [
  "water", // #1 - 실패
  "light", // #2 - 성공
  "pizza", // #3 - 실패
  "bread", // #4 - 실패
  "dog", // #5 - 성공
  "train", // #6 - 실패
  "smile", // #7 - 성공
  "phone", // #8 - 실패
  "green", // #9 - 성공
  "candy", // #10 - 실패
];

// ✅ 연습: 3턴 — 사용자만 풀이 (상대 없음)
const PRACTICE_USER_WORDS = ["cat", "sun", "pen"];

// ===== 코멘트 세트(요청 반영) =====
const NEG_REACTIONS = [
  "괜찮아 잘하고 있어",
  "아깝다",
  "분발해 보자",
  "정신차려",
  "개노답이네",
];
const POS_REACTIONS = [
  "완전 최고다",
  "나이스",
  "제법이네",
  "나쁘지 않네",
  "이건 별거 아니지",
];

// ===== 설문 문항 =====
const SSR_INSTRUCTIONS =
  "게임을 할 때 느낀 자신의 경험에 대하여 작성해주십시오.";
const SSR_ITEMS = [
  "나는 해당 게임의 코멘트를 보낼 때, 상대와의 관계가 나빠질까 봐 코멘트를 신중히 보냈다.",
  "나는 해당 게임의 코멘트를 보낼 때 내가 무례한 사람처럼 보일까 봐 코멘트를 순화했다.",
  "나는 해당 게임의 코멘트를 보낼 때 호의적인 사람처럼 보이고 싶어서 실제보다 좋게 표현했다.",
];

const BIG5_INSTRUCTIONS =
  "다음의 각 단어가 일반적인 당신의 성격을 얼마나 잘 설명하는지 해당하는 숫자에 체크해 주십시오.";
const BIG5_ITEMS = [
  "창의적인/상상력이 풍부한",
  "체계적인",
  "말하기를 좋아하는/수다스러운",
  "동정적인/동조적인",
  "신경이 날카로운",
  "똑똑한/총명한",
  "철두철미한/빈틈 없는",
  "적극적인/확신에 찬",
  "친절한/상냥한",
  "불안해 하는/염려하는",
  "독창적인",
  "능률적인/효율적인",
  "활동적인/활발한",
  "마음이 부드러운/마음이 약한",
  "불안해 하는/신경이 과민한",
  "통찰력 있는",
  "책임감 있는",
  "정력적인",
  "따뜻한",
  "걱정하는/걱정이 많은",
  "영리한/똑똑한",
  "현실적인/실제적인",
  "외향적인/사교적인",
  "후한/너그러운",
  "자기 연민에 빠지는",
];

// ===== 유틸 =====
function scrambleWord(raw) {
  const n = raw.length;
  if (n < 2) return raw;

  let allSame = true;
  for (let i = 1; i < n; i++) {
    if (raw[i] !== raw[0]) {
      allSame = false;
      break;
    }
  }
  if (allSame) return raw;

  const rotated = raw.slice(1) + raw[0];
  if (rotated !== raw) return rotated;

  const reversed = raw.split("").reverse().join("");
  if (reversed !== raw) return reversed;

  const arr = raw.split("");
  for (let i = 0; i < n - 1; i++) {
    if (arr[i] !== arr[i + 1]) {
      [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
      const swapped = arr.join("");
      if (swapped !== raw) return swapped;
    }
  }
  return raw;
}
const rndInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// ===== 시트 전송 =====
function sendToSheet(payload) {
  try {
    const ok = navigator.sendBeacon(
      WEBAPP_URL,
      new Blob([JSON.stringify(payload)], {
        type: "text/plain;charset=UTF-8",
      })
    );
    if (ok) return;
    fetch(WEBAPP_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {
    const img = new Image();
    img.src = `${WEBAPP_URL}?q=${encodeURIComponent(JSON.stringify(payload))}`;
  }
}

// ===== 공통 스타일 =====
const LAYOUT = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "#fafafa",
    padding: 24,
    boxSizing: "border-box",
  },
  card: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 640,
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
    textAlign: "center",
    margin: "0 auto",
    boxSizing: "border-box",
  },
  subCard: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 20,
    padding: 16,
    width: "100%",
    maxWidth: 640,
    textAlign: "left",
    margin: "0 auto 16px",
    boxSizing: "border-box",
  },
  input: {
    width: "100%",
    padding: "14px 16px",
    borderRadius: 16,
    border: "1px solid #d1d5db",
    marginBottom: 12,
    textAlign: "center",
    fontSize: 16,
    display: "block",
    boxSizing: "border-box",
  },
  btn: {
    width: "100%",
    padding: "14px",
    borderRadius: 16,
    background: "#111",
    color: "#fff",
    fontWeight: 600,
    border: "none",
    cursor: "pointer",
    boxSizing: "border-box",
  },
  btnDisabled: {
    width: "100%",
    padding: "14px",
    borderRadius: 16,
    background: "#9ca3af",
    color: "#fff",
    fontWeight: 600,
    border: "none",
    cursor: "not-allowed",
    boxSizing: "border-box",
  },
  btnGhost: {
    padding: "12px 16px",
    borderRadius: 16,
    background: "#f3f4f6",
    border: "1px solid #d1d5db",
    fontWeight: 600,
    cursor: "pointer",
    boxSizing: "border-box",
  },
  spinner: {
    width: 48,
    height: 48,
    borderRadius: "50%",
    border: "4px solid #e5e7eb",
    borderTopColor: "#9ca3af",
    animation: "spin 1s linear infinite",
    margin: "12px auto",
    boxSizing: "border-box",
  },
  bigWord: { fontSize: 24, fontWeight: 800, textAlign: "center" },
  statRow: { marginBottom: 16, fontSize: 22, lineHeight: 1.35 }, // ★ 폰트 키움
  commentList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginBottom: 12,
    boxSizing: "border-box",
  },
  commentBtn: {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: 12,
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    background: "#fff",
    cursor: "pointer",
    boxSizing: "border-box",
  },
};

export default function WordUnscrambleGame() {
  const [stage, setStage] = useState("introRules");
  const [practiceMode, setPracticeMode] = useState(false);

  const [turnIndex, setTurnIndex] = useState(0);
  const turnIndexRef = useRef(0);

  const [log, setLog] = useState([]);
  const [userScore, setUserScore] = useState(0);
  const [oppScore, setOppScore] = useState(0);
  const [teamScore, setTeamScore] = useState(0);

  const [question, setQuestion] = useState("");
  const [answerWord, setAnswerWord] = useState("");
  const currentQuestionRef = useRef("");
  const currentAnswerRef = useRef("");

  const [input, setInput] = useState("");
  const [timeLeft, setTimeLeft] = useState(CONFIG.userTurnTimeLimitSec);

  const [oppAnswerWord, setOppAnswerWord] = useState("");
  const [oppQuestion, setOppQuestion] = useState("");
  const [isWaiting, setIsWaiting] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentDeadline, setCommentDeadline] = useState(0);
  const [oppLastCorrect, setOppLastCorrect] = useState(null);
  const oppLastCorrectRef = useRef(null);

  const [awaitingOppFeedback, setAwaitingOppFeedback] = useState(false);
  const [incomingFeedback, setIncomingFeedback] = useState(null);
  const [userFeedback, setUserFeedback] = useState("");
  const [nowTick, setNowTick] = useState(Date.now());

  // 시간초과 전용 한 줄 배너
  const [showTimeoutOnly, setShowTimeoutOnly] = useState(false);
  const [autoCommentMsg, setAutoCommentMsg] = useState("");

  // 타이머/락
  const tickIntervalRef = useRef(null);
  const userTimeoutRef = useRef(null);
  const feedbackTimerRef = useRef(null);
  const commentTimerRef = useRef(null);
  const deadlineTsRef = useRef(null);

  const userSubmitLockedRef = useRef(false);
  const autoCommentLockedRef = useRef(false);

  const commentPendingRef = useRef(false);
  const commentTurnIndexRef = useRef(0);

  // 배너 진행 보증(워치독)
  const bannerDeadlineRef = useRef(null);
  const bannerAdvanceLockedRef = useRef(false);
  const bannerTimerRef = useRef(null);
  const bannerWatchdogRef = useRef(null);

  const turnStartAtRef = useRef(null);
  const opponentTurnCountRef = useRef(0);
  const userTurnCountRef = useRef(0);

  // ✅ 코멘트 무응답(미선택) 카운트 (3회 이상이면 강제 종료)
  const [commentNoRespCount, setCommentNoRespCount] = useState(0);

  // ✅ 이름(본명) 입력을 participantId에 보관 (관리자 모드: Admin753)
  const [participantId, setParticipantId] = useState("");
  const isDev = participantId === "Admin753";

  // ✅ 어디서든 "Admin753" 타이핑 시 관리자 모드 + '3' 중복 입력 방지
  useEffect(() => {
    let buffer = "";
    const isEditable = (el) => {
      if (!el) return false;
      const tag = el.tagName?.toLowerCase();
      return el.isContentEditable || tag === "input" || tag === "textarea";
    };

    const onKeyDown = (e) => {
      const k = e.key;
      if (!k || k.length !== 1) {
        if (k === "Escape" || k === "Enter") buffer = "";
        return;
      }
      buffer += k;
      if (buffer.length > 8) buffer = buffer.slice(-8);
      if (buffer.toLowerCase() === "admin753") {
        setParticipantId("Admin753");
        if (isEditable(document.activeElement)) {
          e.preventDefault();
          e.stopPropagation(); // 입력란에 '3' 찍히는 것 방지
        }
        buffer = "";
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);

  // 연습에선 항상 사용자 차례로만 진행
  const isUserTurn = practiceMode ? true : turnIndex % 2 === 0;
  const totalTurns = practiceMode ? 3 : CONFIG.totalTurns;
  const teamQualified = teamScore >= TEAM_PRIZE_THRESHOLD;

  useEffect(() => {
    turnIndexRef.current = turnIndex;
  }, [turnIndex]);

  // 코멘트 카운트다운 + 강제 마감 (본게임에서만)
  useEffect(() => {
    if (practiceMode) return;
    if (commentOpen && !isWaiting) {
      const id = setInterval(() => {
        const now = Date.now();
        setNowTick(now);
        if (
          commentPendingRef.current &&
          !autoCommentLockedRef.current &&
          commentDeadline &&
          now >= commentDeadline
        ) {
          autoCommentLockedRef.current = true;
          commentPendingRef.current = false;
          handleAutoSendComment(commentTurnIndexRef.current);
        }
      }, 200);
      return () => clearInterval(id);
    }
  }, [commentOpen, isWaiting, commentDeadline, practiceMode]);

  // 배너 타이머
  useEffect(() => {
    if (!showTimeoutOnly) return;
    bannerAdvanceLockedRef.current = false;
    bannerDeadlineRef.current = Date.now() + TIMEOUT_BANNER_MS;

    clearTimeout(bannerTimerRef.current);
    clearInterval(bannerWatchdogRef.current);

    bannerTimerRef.current = setTimeout(() => {
      proceedAfterBanner();
    }, TIMEOUT_BANNER_MS);

    bannerWatchdogRef.current = setInterval(() => {
      if (Date.now() >= bannerDeadlineRef.current) {
        proceedAfterBanner();
      }
    }, 250);

    return () => {
      clearTimeout(bannerTimerRef.current);
      clearInterval(bannerWatchdogRef.current);
      bannerTimerRef.current = null;
      bannerWatchdogRef.current = null;
    };
  }, [showTimeoutOnly]);

  // ===== 오버듀 강제 진행 헬퍼 =====
  function forceProgressIfOverdue() {
    const now = Date.now();

    // 1) 사용자 턴 시간이 지나면 강제 제출 (시간초과 처리)
    if (
      isUserTurn &&
      !userSubmitLockedRef.current &&
      deadlineTsRef.current &&
      now >= deadlineTsRef.current
    ) {
      onSubmit(false, true);
      return;
    }

    // 2) 상대 턴 코멘트 선택 시간이 지나면 자동 코멘트 전송
    if (
      !practiceMode &&
      commentPendingRef.current &&
      !autoCommentLockedRef.current &&
      commentDeadline &&
      now >= commentDeadline
    ) {
      autoCommentLockedRef.current = true;
      commentPendingRef.current = false;
      handleAutoSendComment(commentTurnIndexRef.current);
      return;
    }

    // 3) 시간초과 배너 화면이면 바로 다음 턴으로
    if (showTimeoutOnly) {
      proceedAfterBanner();
    }
  }

  // 탭 숨김/이탈/복귀 시 오버듀 처리
  useEffect(() => {
    const onHidden = () => {
      forceProgressIfOverdue();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onHidden();
      else forceProgressIfOverdue(); // 복귀 시에도 즉시 처리
    };

    window.addEventListener("blur", onHidden, { capture: true });
    window.addEventListener("pagehide", onHidden, { capture: true });
    document.addEventListener("visibilitychange", onVisibility, {
      capture: true,
    });

    return () => {
      window.removeEventListener("blur", onHidden, { capture: true });
      window.removeEventListener("pagehide", onHidden, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility, {
        capture: true,
      });
    };
  }, [practiceMode, showTimeoutOnly, commentDeadline, isUserTurn]);

  // 언마운트/단계 전환 시 타이머 정리
  useEffect(() => {
    return () => {
      clearInterval(tickIntervalRef.current);
      clearTimeout(userTimeoutRef.current);
      clearTimeout(feedbackTimerRef.current);
      clearTimeout(commentTimerRef.current);
      clearTimeout(bannerTimerRef.current);
      clearInterval(bannerWatchdogRef.current);
    };
  }, []);

  // 안전한 style 주입
  const SpinnerStyle = () => (
    <style children={"@keyframes spin { to { transform: rotate(360deg); } }"} />
  );

  // === 관리자 툴바 (ID가 Admin753일 때만 표시) ===
  function DevToolbar() {
    if (!isDev) return null;
    return (
      <div
        style={{
          position: "fixed",
          top: 8,
          left: 8,
          zIndex: 9999,
          display: "flex",
          gap: 8,
          background: "#fff",
          padding: 8,
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
        }}
      >
        <strong style={{ alignSelf: "center" }}>ADMIN</strong>
        <button style={LAYOUT.btnGhost} onClick={() => setStage("introRules")}>
          규칙
        </button>
        <button style={LAYOUT.btnGhost} onClick={() => startPractice()}>
          연습
        </button>
        <button style={LAYOUT.btnGhost} onClick={() => setStage("introId")}>
          이름
        </button>
        <button style={LAYOUT.btnGhost} onClick={() => beginMatch()}>
          매칭
        </button>
        <button style={LAYOUT.btnGhost} onClick={() => setStage("playing")}>
          플레이
        </button>
        <button style={LAYOUT.btnGhost} onClick={() => setStage("surveySSR")}>
          설문
        </button>
        <button style={LAYOUT.btnGhost} onClick={() => setStage("finished")}>
          완료
        </button>
      </div>
    );
  }

  // ===== 게임 시작/매칭 =====
  function beginMatch() {
    setStage("matching");
    const wait = rndInt(CONFIG.preMatchMinMs, CONFIG.preMatchMaxMs);
    setTimeout(startGame, wait);
  }

  function startGame() {
    opponentTurnCountRef.current = 0;
    userTurnCountRef.current = 0;

    setQuestion("");
    setAnswerWord("");
    currentQuestionRef.current = "";
    currentAnswerRef.current = "";

    setOppAnswerWord("");
    setOppQuestion("");
    setStage("playing");
    setUserScore(0);
    setOppScore(0);
    setTeamScore(0);
    setLog([]);
    setCommentNoRespCount(0);

    setPracticeMode(false);
    nextTurnSetup(0);
  }

  function startPractice() {
    setPracticeMode(true);
    opponentTurnCountRef.current = 0;
    userTurnCountRef.current = 0;

    setQuestion("");
    setAnswerWord("");
    currentQuestionRef.current = "";
    currentAnswerRef.current = "";

    setOppAnswerWord("");
    setOppQuestion("");
    setStage("playing");
    setUserScore(0);
    setOppScore(0);
    setTeamScore(0);
    setLog([]);
    setCommentNoRespCount(0);

    nextTurnSetup(0);
  }

  function clearAllTimers() {
    clearInterval(tickIntervalRef.current);
    clearTimeout(userTimeoutRef.current);
    clearTimeout(feedbackTimerRef.current);
    clearTimeout(commentTimerRef.current);
    clearTimeout(bannerTimerRef.current);
    clearInterval(bannerWatchdogRef.current);
    tickIntervalRef.current = null;
    userTimeoutRef.current = null;
    feedbackTimerRef.current = null;
    commentTimerRef.current = null;
    bannerTimerRef.current = null;
    bannerWatchdogRef.current = null;
  }

  // ===== 턴 세팅 =====
  function nextTurnSetup(nextIndex) {
    clearAllTimers();

    // 강종 상태면 더 진행하지 않음
    if (stage === "forceQuit") return;

    userSubmitLockedRef.current = false;
    autoCommentLockedRef.current = false;
    bannerAdvanceLockedRef.current = false;

    setInput("");
    setIsWaiting(false);
    setTimeLeft(CONFIG.userTurnTimeLimitSec);
    setUserFeedback("");
    setAwaitingOppFeedback(false);
    setIncomingFeedback(null);
    setCommentOpen(false);

    // 시간초과 전용 초기화
    setShowTimeoutOnly(false);
    setAutoCommentMsg("");

    turnStartAtRef.current = Date.now();

    const maxTurns = practiceMode ? 3 : CONFIG.totalTurns;
    if (nextIndex >= maxTurns) {
      finishGame();
      return;
    }

    setTurnIndex(nextIndex);
    turnIndexRef.current = nextIndex;

    // 연습: 항상 사용자 턴만 세팅
    if (practiceMode || nextIndex % 2 === 0) {
      userTurnCountRef.current += 1;
      const source = practiceMode ? PRACTICE_USER_WORDS : USER_WORDS;
      const idx = userTurnCountRef.current - 1;
      const word = (source[idx] || source[source.length - 1]).toLowerCase();
      const scrambled = scrambleWord(word);

      setAnswerWord(word);
      setQuestion(scrambled);
      currentAnswerRef.current = word;
      currentQuestionRef.current = scrambled;

      deadlineTsRef.current = Date.now() + CONFIG.userTurnTimeLimitSec * 1000;

      // 남은시간 갱신 + 하드 타임아웃 백업
      tickIntervalRef.current = setInterval(() => {
        const remainMs = Math.max(0, deadlineTsRef.current - Date.now());
        const remainSec = Math.ceil(remainMs / 1000);
        setTimeLeft(remainSec);
        if (remainMs <= 0) {
          clearInterval(tickIntervalRef.current);
          if (!userSubmitLockedRef.current) onSubmit(false, true);
        }
      }, 250);

      userTimeoutRef.current = setTimeout(() => {
        if (!userSubmitLockedRef.current) onSubmit(false, true);
      }, CONFIG.userTurnTimeLimitSec * 1000 + 30);
      return;
    }

    // 본게임 상대 턴
    opponentTurnCountRef.current += 1;
    const oppIdx = opponentTurnCountRef.current - 1;
    const oppWord = OPP_WORDS[oppIdx].toLowerCase();
    setOppAnswerWord(oppWord);
    setOppQuestion(scrambleWord(oppWord));
    setIsWaiting(true);
    simulateOpponent(nextIndex);
  }

  // ===== 상대 턴 시뮬레이션 (본게임 전용) =====
  function simulateOpponent(idx) {
    const oppTurnNumber = opponentTurnCountRef.current; // 1-based
    const willSucceed = CONFIG.opponentSuccessIndices.includes(oppTurnNumber);

    // 성공 시 5~7초, 실패 시 10~15초
    const wait = willSucceed
      ? rndInt(CONFIG.opponentSolveMinMs, CONFIG.opponentSolveMaxMs)
      : rndInt(CONFIG.opponentFailMinMs, CONFIG.opponentFailMaxMs);

    setTimeout(() => {
      setOppLastCorrect(willSucceed);
      oppLastCorrectRef.current = willSucceed;

      if (willSucceed) {
        setOppScore((s) => s + 1);
        setTeamScore((s) => s + 1);
      }

      setIsWaiting(false);
      setCommentOpen(true);
      setCommentDeadline(Date.now() + CONFIG.commentWindowMs);

      commentPendingRef.current = true;
      commentTurnIndexRef.current = idx;

      clearTimeout(commentTimerRef.current);
      commentTimerRef.current = setTimeout(() => {
        handleAutoSendComment(idx);
      }, CONFIG.commentWindowMs);
    }, wait);
  }

  // ===== 배너 종료 후 안전 진행 =====
  function proceedAfterBanner() {
    if (bannerAdvanceLockedRef.current) return;
    bannerAdvanceLockedRef.current = true;
    clearTimeout(bannerTimerRef.current);
    clearInterval(bannerWatchdogRef.current);
    nextTurnSetup((turnIndexRef.current ?? 0) + 1);
  }

  // ===== 메시지(선택 / 자동 "미 선택") — 본게임 전용 =====
  function handleAutoSendComment(idx) {
    if (autoCommentLockedRef.current) return;
    autoCommentLockedRef.current = true;

    // 코멘트 무응답 카운트 추가 및 강제 종료 체크
    setCommentNoRespCount((n) => {
      const next = n + 1;
      if (next >= 3) {
        clearAllTimers();
        setStage("forceQuit");
      }
      return next;
    });

    setLog((prev) => [
      ...prev,
      {
        type: "user_comment_auto_sent",
        participantId,
        turnIndex: idx,
        choice_text: "미 선택",
        ts: new Date().toISOString(),
      },
    ]);
    sendToSheet({ participantId, choice_text: "미 선택" });

    setShowTimeoutOnly(true);
    setAutoCommentMsg("시간초과 랜덤 메시지가 전송되었습니다.");

    commentPendingRef.current = false;
    setCommentOpen(false);
  }

  function handleSendChoice(idx, choice) {
    setLog((prev) => [
      ...prev,
      {
        type: "user_comment_choice",
        participantId,
        turnIndex: idx,
        choice_text: choice.text,
        ts: new Date().toISOString(),
      },
    ]);
    sendToSheet({ participantId, choice_text: choice.text });

    commentPendingRef.current = false;
    setCommentOpen(false);
    nextTurnSetup(idx + 1);
  }

  // ===== 내 제출 =====
  function onSubmit(manual = true, force = false) {
    if (!force && !isUserTurn) return; // 연습: 항상 true, 본게임: 내 턴만
    if (userSubmitLockedRef.current) return;
    userSubmitLockedRef.current = true;

    clearInterval(tickIntervalRef.current);
    clearTimeout(userTimeoutRef.current);

    const currentTurnIdx = turnIndexRef.current;

    const rt = Date.now() - (turnStartAtRef.current || Date.now());
    const userAnswer = (input || "").trim().toLowerCase();

    const correctAnswer = currentAnswerRef.current;
    const shownQuestion = currentQuestionRef.current;

    const isTimeout = !manual;
    const correct = !!userAnswer && userAnswer === correctAnswer;

    setLog((prev) => [
      ...prev,
      {
        type: "user_turn",
        participantId,
        turnIndex: currentTurnIdx,
        userTurnNumber: userTurnCountRef.current,
        scrambled: shownQuestion,
        response: userAnswer,
        answer: correctAnswer,
        correct,
        reason: manual ? (correct ? "match" : "mismatch") : "timeout",
        rt_ms: rt,
        timeLeft,
        ts: new Date().toISOString(),
      },
    ]);

    // 문제 무응답은 강제 종료 기준에 포함하지 않음 (코멘트 무응답만 집계)

    if (correct) {
      setUserScore((s) => s + 1);
      if (!practiceMode) setTeamScore((s) => s + 1);
      setUserFeedback("✅ 정답!");
    } else {
      setUserFeedback(
        isTimeout
          ? `⏰ 시간초과! 정답: "${correctAnswer}"`
          : `❌ 오답! 정답: "${correctAnswer}"`
      );
    }

    // 연습: 상대 피드백/메시지 없음 → 곧바로 다음 턴
    if (practiceMode) {
      setTimeout(
        () => nextTurnSetup(currentTurnIdx + 1),
        CONFIG.feedbackShowMs
      );
      return;
    }

    // 본게임: 상대 피드백 시뮬 (컴퓨터 코멘트는 3~5번만 사용)
    setAwaitingOppFeedback(true);
    setIncomingFeedback(null);

    const waitMs = rndInt(2000, 3000);
    clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => {
      const fullPool = correct ? POS_REACTIONS : NEG_REACTIONS;
      // 3~5번(인덱스 2~4)만 선택
      const limitedPool = fullPool.slice(2);
      const idx = Math.floor(Math.random() * limitedPool.length);
      const text = limitedPool[idx];

      setIncomingFeedback({ text });
      setLog((prev) => [
        ...prev,
        {
          type: "user_received_feedback",
          participantId,
          userTurnNumber: userTurnCountRef.current,
          feedback_text: text,
          ts: new Date().toISOString(),
        },
      ]);

      setTimeout(() => {
        setAwaitingOppFeedback(false);
        if (stage !== "forceQuit") nextTurnSetup(currentTurnIdx + 1);
      }, CONFIG.feedbackShowMs);
    }, waitMs);
  }

  function finishGame() {
    clearAllTimers();
    if (practiceMode) {
      setStage("finished"); // 연습 끝 → 완료 화면
    } else {
      setStage("surveySSR"); // 본게임 끝 → 설문 1/3
    }
  }

  // ===== 설문 상태 =====
  const [ssrRatings, setSsrRatings] = useState(
    Array(SSR_ITEMS.length).fill(null)
  );
  const [big5Ratings, setBig5Ratings] = useState(
    Array(BIG5_ITEMS.length).fill(null)
  );
  const [demName, setDemName] = useState("");
  const [demGender, setDemGender] = useState("");
  const [demBirth, setDemBirth] = useState("");

  const canSubmitAll =
    ssrRatings.every((v) => v !== null) &&
    big5Ratings.every((v) => v !== null) &&
    demName &&
    demGender &&
    demBirth &&
    participantId;

  function handleSubmitSurvey() {
    const payload = {
      participantId,
      type: "post_survey",
      ssrRatings,
      big5Ratings,
      demographics: { name: demName, gender: demGender, birth: demBirth },
      ts: new Date().toISOString(),
    };
    sendToSheet(payload);
    setStage("finished");
  }

  // ===== UI =====
  if (stage === "introRules") {
    return (
      <div style={LAYOUT.page}>
        <SpinnerStyle />
        <DevToolbar />
        <div style={LAYOUT.card}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 16 }}>
            1:1 단어 재배열 게임
          </h1>
          <div style={LAYOUT.subCard}>
            <h2
              style={{
                fontSize: 16,
                fontWeight: 700,
                marginBottom: 8,
                textAlign: "center",
              }}
            >
              게임 규칙
            </h2>
            <ul style={{ paddingLeft: 20, lineHeight: 1.6 }}>
              <li>총 20턴 동안, 각자 10턴씩 번갈아 진행합니다.</li>
              <li>
                자신의 차례에 주어진 <b>섞인 영어 단어의 원형</b>을 <b>15초</b>{" "}
                안에 입력합니다.
              </li>
              <li>상대가 문제 풀이를 마치면 결과 배지가 표시됩니다.</li>
              <li>
                그 결과에 따라 <b>5개의 메시지</b> 중 하나를 골라 전송합니다.
              </li>
              <li>
                팀 합계 정답 수가 <b>{TEAM_PRIZE_THRESHOLD}개 이상</b>이면
                배달의 민족 쿠폰 을 지급합니다.
              </li>
            </ul>
            <p style={{ marginTop: 12, fontWeight: 600, textAlign: "center" }}>
              규칙을 이해했으면 <b>연습게임</b>을 진행해주세요.
            </p>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <button onClick={startPractice} style={LAYOUT.btn}>
              연습게임 해보기
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "introId") {
    return (
      <div style={LAYOUT.page}>
        <SpinnerStyle />
        <DevToolbar />
        <div style={LAYOUT.card}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 16 }}>
            1:1 단어 재배열 게임
          </h1>
          {/* 이름(본명) 입력 */}
          <input
            style={LAYOUT.input}
            placeholder="이름(본명)을 입력해주세요"
            value={participantId}
            onChange={(e) => setParticipantId(e.target.value)}
          />
          <div
            style={{ fontSize: 12, color: "#6b7280", margin: "-6px 0 10px" }}
          >
            ※ 입력하신 이름이 <b>본명과 다를 경우</b> 보상(쿠폰/경품) 전달에
            문제가 발생할 수 있습니다.
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <button
              onClick={beginMatch}
              style={participantId ? LAYOUT.btn : LAYOUT.btnDisabled}
              disabled={!participantId}
            >
              시작하기
            </button>
            <button
              onClick={() => setStage("introRules")}
              style={LAYOUT.btnGhost}
            >
              규칙으로 돌아가기
            </button>
          </div>
          {isDev && (
            <div style={{ marginTop: 10, color: "#b45309" }}>
              관리자 모드로 활성화되었습니다 (이름 필드에 <b>Admin753</b> 입력
              시, 또는 어디서든 <b>Admin753</b> 타이핑)
            </div>
          )}
        </div>
      </div>
    );
  }

  if (stage === "matching") {
    return (
      <div style={LAYOUT.page}>
        <SpinnerStyle />
        <DevToolbar />
        <div style={LAYOUT.card}>
          <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
            매칭 중…
          </h2>
          <p style={{ marginBottom: 12, opacity: 0.8 }}>
            대기열에서 상대를 찾고 있습니다.
          </p>
          <div style={LAYOUT.spinner} />
        </div>
      </div>
    );
  }

  if (stage === "playing") {
    // 시간초과 배너 단독 화면
    if (showTimeoutOnly) {
      return (
        <div style={LAYOUT.page}>
          <SpinnerStyle />
          <DevToolbar />
          <div style={LAYOUT.card}>
            <div
              style={{
                ...LAYOUT.subCard,
                background: "#fff8e1",
                borderColor: "#fcd34d",
                textAlign: "center",
              }}
            >
              {autoCommentMsg || "시간초과 랜덤 메시지가 전송되었습니다."}
            </div>
          </div>
        </div>
      );
    }

    const reactionSet = oppLastCorrect ? POS_REACTIONS : NEG_REACTIONS;
    const remainingSec = Math.ceil(
      Math.max(0, commentDeadline - nowTick) / 1000
    );
    const myNameLabel =
      participantId && participantId.trim() ? participantId.trim() : "내";

    // ★ 헤더 문구: 본게임은 "턴 X / Y"만, 연습은 "연습게임 X / Y"
    const headerText = practiceMode
      ? `연습게임 ${turnIndex + 1} / ${totalTurns}`
      : `턴 ${turnIndex + 1} / ${totalTurns}`;

    return (
      <div style={LAYOUT.page}>
        <SpinnerStyle />
        <DevToolbar />
        <div style={LAYOUT.card}>
          {/* 연습 모드에서는 점수/합계 전부 숨김 */}
          {!practiceMode && (
            <div style={LAYOUT.statRow}>
              <div>
                {myNameLabel} 정답: <b>{userScore}</b> &nbsp;&nbsp;{" "}
                {OPPONENT_NAME} 정답: <b>{oppScore}</b>
              </div>
              <div>
                팀 합계: <b>{teamScore}</b> / {totalTurns}
              </div>
            </div>
          )}

          <div style={{ marginBottom: 12, opacity: 0.7 }}>{headerText}</div>

          {/* 사용자 차례 */}
          {isUserTurn && (
            <>
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    ...LAYOUT.subCard,
                    textAlign: "center",
                    marginBottom: 16,
                  }}
                >
                  <div style={LAYOUT.bigWord}>
                    {question || "문제를 불러오는 중…"}
                  </div>
                  {isDev && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 12,
                        color: "#6b7280",
                        textAlign: "center",
                      }}
                    >
                      (ADMIN) 정답: {currentAnswerRef.current}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    justifyContent: "center",
                    alignItems: "center",
                    margin: "0 auto 8px",
                    maxWidth: 640,
                  }}
                >
                  <input
                    style={{ ...LAYOUT.input, marginBottom: 0, flex: 1 }}
                    placeholder="원래 단어를 입력하세요"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onSubmit(true);
                    }}
                    autoFocus
                  />
                  <button
                    onClick={() => onSubmit(true)}
                    style={{ ...LAYOUT.btn, width: "auto" }}
                  >
                    제출
                  </button>
                </div>
                <div>
                  남은 시간: <b>{timeLeft}s</b>
                </div>
                {userFeedback && (
                  <div style={{ marginTop: 8 }}>{userFeedback}</div>
                )}
              </div>

              {/* 본게임에서만 상대 피드백 수신 */}
              {!practiceMode && awaitingOppFeedback && (
                <div
                  style={{
                    ...LAYOUT.subCard,
                    background: "#eff6ff",
                    borderColor: "#bfdbfe",
                    textAlign: "center",
                  }}
                >
                  {!incomingFeedback ? (
                    <>
                      <div style={{ fontWeight: 700, marginBottom: 6 }}>
                        상대 응답을 기다리는 중…
                      </div>
                      <div style={LAYOUT.spinner} />
                    </>
                  ) : (
                    <div>
                      {OPPONENT_NAME}: "{incomingFeedback.text}"
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* 본게임 전용: 상대 차례 — 문제/정답 텍스트 제거, 결과 배지만 표시 */}
          {!practiceMode && !isUserTurn && (
            <>
              <div style={{ ...LAYOUT.subCard, textAlign: "center" }}>
                {isWaiting ? (
                  <>
                    <div
                      style={{
                        marginBottom: 6,
                        opacity: 0.7,
                        textAlign: "center",
                      }}
                    >
                      상대가 푸는 중…
                    </div>
                    <div style={LAYOUT.spinner} />
                  </>
                ) : (
                  <div
                    style={{
                      ...LAYOUT.subCard,
                      background: oppLastCorrect ? "#ecfdf5" : "#fef2f2",
                      borderColor: oppLastCorrect ? "#10b981" : "#ef4444",
                      marginTop: 8,
                      textAlign: "center",
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>
                      상대 결과: {oppLastCorrect ? "정답" : "오답"}
                    </div>
                  </div>
                )}
              </div>

              {!isWaiting && commentOpen && (
                <div
                  style={{
                    ...LAYOUT.subCard,
                    background: "#fff8e1",
                    borderColor: "#fcd34d",
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>
                    {OPPONENT_NAME}에게 전송할 메시지를 선택해주세요.
                  </div>
                  <div
                    style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}
                  >
                    남은 시간: {remainingSec}s
                  </div>
                  <div style={LAYOUT.commentList}>
                    {reactionSet.map((text, idx) => (
                      <button
                        key={`react-${idx}`}
                        onClick={() => handleSendChoice(turnIndex, { text })}
                        style={LAYOUT.commentBtn}
                      >
                        {text}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // --- 설문 1/3: 사회적 경험 ---
  if (stage === "surveySSR") {
    const canProceedSSR = ssrRatings.every((v) => v !== null);
    return (
      <div style={LAYOUT.page}>
        <SpinnerStyle />
        <DevToolbar />
        <div style={LAYOUT.card}>
          <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 10 }}>
            설문 1/3
          </h2>
          <div style={{ ...LAYOUT.subCard }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              {SSR_INSTRUCTIONS}
            </div>
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 8 }}>
              (1점 전혀 아니다 ~ 7점 매우 그렇다)
            </div>
            {SSR_ITEMS.map((text, i) => (
              <div key={`ssr-${i}`} style={{ marginBottom: 12 }}>
                <div style={{ marginBottom: 6 }}>
                  {i + 1}) {text}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {Array.from({ length: 7 }).map((_, k) => (
                    <label
                      key={`ssr-${i}-${k}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <input
                        type="radio"
                        name={`ssr-${i}`}
                        value={k + 1}
                        checked={ssrRatings[i] === k + 1}
                        onChange={() =>
                          setSsrRatings((arr) =>
                            arr.map((v, idx) => (idx === i ? k + 1 : v))
                          )
                        }
                      />
                      {k + 1}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
            <button
              onClick={() => setStage("surveyBig5")}
              disabled={!canProceedSSR}
              style={canProceedSSR ? LAYOUT.btn : LAYOUT.btnDisabled}
            >
              다음으로
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- 설문 2/3: 성격 5요인 ---
  if (stage === "surveyBig5") {
    const canProceedBig5 = big5Ratings.every((v) => v !== null);
    return (
      <div style={LAYOUT.page}>
        <SpinnerStyle />
        <DevToolbar />
        <div style={LAYOUT.card}>
          <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 10 }}>
            설문 2/3
          </h2>
          <div style={{ ...LAYOUT.subCard }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              {BIG5_INSTRUCTIONS}
            </div>
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 8 }}>
              (1 전혀 그렇지 않다 — 7 매우 그렇다)
            </div>
            {BIG5_ITEMS.map((text, i) => (
              <div key={`big5-${i}`} style={{ marginBottom: 10 }}>
                <div style={{ marginBottom: 6 }}>
                  {i + 1}) {text}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {Array.from({ length: 7 }).map((_, k) => (
                    <label
                      key={`big5-${i}-${k}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <input
                        type="radio"
                        name={`big5-${i}`}
                        value={k + 1}
                        checked={big5Ratings[i] === k + 1}
                        onChange={() =>
                          setBig5Ratings((arr) =>
                            arr.map((v, idx) => (idx === i ? k + 1 : v))
                          )
                        }
                      />
                      {k + 1}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
            <button
              onClick={() => setStage("surveySSR")}
              style={LAYOUT.btnGhost}
            >
              이전
            </button>
            <button
              onClick={() => setStage("surveyDemo")}
              disabled={!canProceedBig5}
              style={canProceedBig5 ? LAYOUT.btn : LAYOUT.btnDisabled}
            >
              다음으로
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- 설문 3/3: 기본 정보 & 제출 ---
  if (stage === "surveyDemo") {
    const canSubmitSurvey =
      ssrRatings.every((v) => v !== null) &&
      big5Ratings.every((v) => v !== null) &&
      demName &&
      demGender &&
      demBirth &&
      participantId;

    return (
      <div style={LAYOUT.page}>
        <SpinnerStyle />
        <DevToolbar />
        <div style={LAYOUT.card}>
          <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 10 }}>
            설문 3/3
          </h2>
          <div style={{ ...LAYOUT.subCard }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>기본 정보</div>
            <div style={{ display: "grid", gap: 8 }}>
              <input
                style={LAYOUT.input}
                placeholder="이름"
                value={demName}
                onChange={(e) => setDemName(e.target.value)}
              />
              <select
                style={{ ...LAYOUT.input, textAlign: "left" }}
                value={demGender}
                onChange={(e) => setDemGender(e.target.value)}
              >
                <option value="">성별 선택</option>
                <option value="남">남</option>
                <option value="여">여</option>
                <option value="기타">기타</option>
                <option value="응답거부">응답 거부</option>
              </select>
              <input
                style={LAYOUT.input}
                type="date"
                value={demBirth}
                onChange={(e) => setDemBirth(e.target.value)}
              />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 8 }}>
            <button
              onClick={() => setStage("surveyBig5")}
              style={LAYOUT.btnGhost}
            >
              이전
            </button>
            <button
              onClick={handleSubmitSurvey}
              disabled={!canSubmitSurvey}
              style={canSubmitSurvey ? LAYOUT.btn : LAYOUT.btnDisabled}
            >
              제출하고 완료하기
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- 코멘트 무응답 3회 이상: 강제 종료 페이지 ---
  if (stage === "forceQuit") {
    return (
      <div style={LAYOUT.page}>
        <SpinnerStyle />
        <div style={LAYOUT.card}>
          <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 10 }}>
            게임이 종료되었습니다
          </h2>
          <div
            style={{
              ...LAYOUT.subCard,
              background: "#fef2f2",
              borderColor: "#ef4444",
              textAlign: "center",
            }}
          >
            <div style={{ fontWeight: 700 }}>
              응답이 없어 강제 종료되었습니다.
            </div>
            <div style={{ marginTop: 4, color: "#6b7280" }}>
              (코멘트 미선택 3회 이상)
            </div>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <button onClick={() => setStage("introRules")} style={LAYOUT.btn}>
              처음으로
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "finished") {
    const myNameLabel =
      participantId && participantId.trim() ? participantId.trim() : "내";
    return (
      <div style={LAYOUT.page}>
        <SpinnerStyle />
        <DevToolbar />
        <div style={LAYOUT.card}>
          <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 10 }}>
            {practiceMode ? "연습 종료" : "게임 종료"}
          </h2>
          <p style={{ marginBottom: 12 }}>
            {practiceMode ? (
              "수고하셨습니다. 이제 본게임을 시작할 수 있어요."
            ) : (
              <>
                {myNameLabel} 정답 <b>{userScore}</b> · {OPPONENT_NAME} 정답{" "}
                <b>{oppScore}</b> · 팀 합계 <b>{teamScore}</b> /{" "}
                {CONFIG.totalTurns}
              </>
            )}
          </p>
          {!practiceMode && (
            <div
              style={{
                ...LAYOUT.subCard,
                background: teamQualified ? "#ecfdf5" : "#fef2f2",
                borderColor: teamQualified ? "#10b981" : "#ef4444",
                textAlign: "center",
              }}
            >
              {teamQualified ? (
                <p>
                  축하합니다! <b>팀 합계 정답 {TEAM_PRIZE_THRESHOLD}개 이상</b>
                  으로 <b>배달의민족 5만 원 쿠폰</b> 지급 대상입니다 🎉
                </p>
              ) : (
                <p>
                  아쉽지만 팀 합계 정답이 {TEAM_PRIZE_THRESHOLD}개 미만입니다.
                  다음에 다시 도전해주세요.
                </p>
              )}
            </div>
          )}

          <div
            style={{ display: "flex", justifyContent: "center", marginTop: 12 }}
          >
            <button
              onClick={() => {
                if (practiceMode) {
                  setPracticeMode(false);
                  setStage("introId"); // 연습 끝 → 본게임 이름 입력
                } else {
                  setStage("introRules"); // 본게임 끝 → 처음으로
                }
              }}
              style={LAYOUT.btnGhost}
            >
              {practiceMode ? "본게임 시작하기" : "처음으로"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 안전 장치
  return (
    <div style={LAYOUT.page}>
      <SpinnerStyle />
      <DevToolbar />
      <div style={LAYOUT.card}>
        <p style={{ marginBottom: 12 }}>초기화 중입니다…</p>
        <button onClick={() => setStage("introRules")} style={LAYOUT.btn}>
          처음으로 이동
        </button>
      </div>
    </div>
  );
}
