'use client';

import { use, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Pencil, Eraser, Trash2, MessageSquare, X, Search, ChevronDown, ChevronUp } from 'lucide-react';
import stringSimilarity from 'string-similarity';

import hydrocarbons from '@/data/hydrocarbons.json';
import { useIsMobile } from '@/hooks/use-mobile';
import { useGameStore } from '@/store/gameStore';

// ── Type labels and ordering ─────────────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  alcano: 'Alcanos',
  alceno: 'Alcenos',
  alcino: 'Alcinos',
  cicloalcano: 'Cicloalcanos',
  cicloalceno: 'Cicloalcenos',
  aromatico: 'Aromáticos',
  dieno: 'Dienos',
};
const TYPE_ORDER = ['alcano', 'alceno', 'alcino', 'cicloalcano', 'cicloalceno', 'dieno', 'aromatico'];

const hydrocardonsByType = TYPE_ORDER.reduce((acc, type) => {
  const items = hydrocarbons.filter((h) => h.type === type);
  if (items.length) acc[type] = items;
  return acc;
}, {} as Record<string, typeof hydrocarbons>);

// ── Types ────────────────────────────────────────────────────────────────────
type Hydrocarbon = {
  name: string;
  smiles: string;
  carbons: number;
  type: string;
};

type ChatMessage = {
  sender: string;
  text: string;
  isSystem?: boolean;
  isCorrect?: boolean;
};

// ── SMILES renderer ──────────────────────────────────────────────────────────
const PREVIEW_CANVAS_ID = 'molecule-preview-canvas';

function renderMolecule(
  svg: SVGSVGElement,
  smiles: string,
  onError: (msg: string) => void,
  width = 180,
  height = 130,
) {
  svg.innerHTML = '';
  import('smiles-drawer')
    .then((module) => {
      const SmilesDrawer =
        (module as any).SmiDrawer || (module as any).Drawer || (module as any).default;
      if (!SmilesDrawer) throw new Error('smiles-drawer indisponivel');
      svg.innerHTML = '';
      const drawer = new SmilesDrawer({ width, height, compactDrawing: true });
      drawer.draw(smiles, `#${svg.id}`, 'light', false);
    })
    .catch(() => onError('Não foi possível renderizar essa estrutura.'));
}

// ── Inline SVG card for each molecule in the list ────────────────────────────
function MoleculeCard({
  mol,
  isSelected,
  onSelect,
  onHover,
}: {
  mol: Hydrocarbon;
  isSelected: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const idRef = useRef(`mol-svg-${mol.name.replace(/[^a-zA-Z0-9]/g, '-')}`);
  const [rendered, setRendered] = useState(false);
  const [error, setError] = useState(false);

  // Render molecule when card becomes visible (intersection observer)
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !rendered) {
          setRendered(true);
          renderMolecule(el, mol.smiles, () => setError(true), 120, 90);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [mol.smiles, rendered]);

  return (
    <button
      onMouseEnter={onHover}
      onTouchStart={onHover}
      onClick={onSelect}
      className={`w-full text-left rounded-xl border transition-all overflow-hidden ${
        isSelected
          ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200'
          : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/50'
      }`}
    >
      {/* Molecule SVG preview */}
      <div className="bg-slate-50 flex items-center justify-center p-1 border-b border-slate-100">
        {error ? (
          <div className="h-[72px] flex items-center justify-center text-[9px] text-slate-400 px-2 text-center">
            {mol.smiles}
          </div>
        ) : (
          <svg
            id={idRef.current}
            ref={svgRef}
            width={120}
            height={80}
            className="w-full h-[72px]"
          />
        )}
      </div>
      {/* Name */}
      <div className="px-2 py-1.5">
        <span className="font-semibold text-[12px] text-slate-800 block leading-tight">{mol.name}</span>
        <span className="text-[10px] text-slate-400">C{mol.carbons}</span>
      </div>
    </button>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const searchParams = useSearchParams();
  const { id: roomId } = use(params);
  const initialName = (searchParams.get('name') ?? '').trim();

  const connect = useGameStore((state) => state.connect);
  const roomState = useGameStore((state) => state.roomState);
  const socket = useGameStore((state) => state.socket);
  const selectWord = useGameStore((state) => state.selectWord);
  const guess = useGameStore((state) => state.guess);
  const draw = useGameStore((state) => state.draw);
  const clearCanvasStore = useGameStore((state) => state.clearCanvas);

  const isMobile = useIsMobile();

  // ── Join state ───────────────────────────────────────────────────────────
  const [joinNameInput, setJoinNameInput] = useState(initialName);
  const [playerName, setPlayerName] = useState(initialName);
  const [hasJoined, setHasJoined] = useState(Boolean(initialName));
  const [joinError, setJoinError] = useState('');

  // ── Chat state ───────────────────────────────────────────────────────────
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [guessInput, setGuessInput] = useState('');
  const [suggestions, setSuggestions] = useState<Hydrocarbon[]>([]);

  // ── Molecule list picker state ───────────────────────────────────────────
  const [listSearch, setListSearch] = useState('');
  const [hoveredMol, setHoveredMol] = useState<Hydrocarbon | null>(null);
  const [selectedMol, setSelectedMol] = useState<Hydrocarbon | null>(null);
  // Which type groups are collapsed
  const [collapsedTypes, setCollapsedTypes] = useState<Record<string, boolean>>({});
  // Side preview refs
  const sidePreviewRef = useRef<SVGSVGElement>(null);
  const [sidePreviewError, setSidePreviewError] = useState(false);

  // ── Drawing state ────────────────────────────────────────────────────────
  const [timeLeft, setTimeLeft] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(5);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');

  // ── Molecule preview (while drawing) ─────────────────────────────────────
  const [previewWord, setPreviewWord] = useState<Hydrocarbon | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // ── Refs ─────────────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<SVGSVGElement>(null);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const chatOpenRef = useRef(chatOpen);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Sync chat open ref ────────────────────────────────────────────────────
  useEffect(() => {
    chatOpenRef.current = chatOpen;
    if (chatOpen) setUnreadCount(0);
  }, [chatOpen]);

  // ── Auto-scroll chat ──────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Connect on join ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasJoined || !playerName) return;
    connect(roomId, playerName, false);
  }, [hasJoined, playerName, roomId, connect]);

  // ── Socket events ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handleDraw = (data: any) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.beginPath();
      ctx.moveTo(data.x0, data.y0);
      ctx.lineTo(data.x1, data.y1);
      ctx.strokeStyle = data.color;
      ctx.lineWidth = data.lineWidth;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.closePath();
    };

    const handleClear = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    const handleChatMessage = (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
      if (!chatOpenRef.current && window.innerWidth < 768) {
        setUnreadCount((prev) => prev + 1);
      }
    };

    const handleDrawHistory = (history: any[]) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      history.forEach((data) => {
        ctx.beginPath();
        ctx.moveTo(data.x0, data.y0);
        ctx.lineTo(data.x1, data.y1);
        ctx.strokeStyle = data.color;
        ctx.lineWidth = data.lineWidth;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.closePath();
      });
    };

    const handleRoomError = (errorPayload: unknown) => {
      const errorText =
        typeof errorPayload === 'string'
          ? errorPayload
          : 'Não foi possível entrar na sala. Verifique o código.';
      setJoinError(errorText);
      setHasJoined(false);
    };

    const handleHostDisconnected = () => {
      setMessages((prev) => [
        ...prev,
        { sender: 'Sistema', text: 'O professor desconectou da sala.', isSystem: true },
      ]);
    };

    socket.on('draw', handleDraw);
    socket.on('clear_canvas', handleClear);
    socket.on('chat_message', handleChatMessage);
    socket.on('draw_history', handleDrawHistory);
    socket.on('join_error', handleRoomError);
    socket.on('host_disconnected', handleHostDisconnected);

    return () => {
      socket.off('draw', handleDraw);
      socket.off('clear_canvas', handleClear);
      socket.off('chat_message', handleChatMessage);
      socket.off('draw_history', handleDrawHistory);
      socket.off('join_error', handleRoomError);
      socket.off('host_disconnected', handleHostDisconnected);
    };
  }, [socket]);

  // ── Timer countdown ───────────────────────────────────────────────────────
  useEffect(() => {
    if (roomState?.state !== 'playing' || !roomState.roundEndTime) {
      setTimeLeft(0);
      return;
    }
    const interval = setInterval(() => {
      const left = Math.max(0, Math.floor((roomState.roundEndTime - Date.now()) / 1000));
      setTimeLeft(left);
      if (left <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [roomState?.state, roomState?.roundEndTime]);

  // ── Keep previewWord in sync with currentWord ─────────────────────────────
  useEffect(() => {
    if (roomState?.currentWord) {
      setPreviewWord(roomState.currentWord as Hydrocarbon);
      setPreviewError(null);
    }
  }, [roomState?.currentWord]);

  // ── Reset list picker on new round ────────────────────────────────────────
  useEffect(() => {
    if (roomState?.state === 'choosing_word') {
      setListSearch('');
      setHoveredMol(null);
      setSelectedMol(null);
      setSidePreviewError(false);
      setCollapsedTypes({});
    }
  }, [roomState?.state, roomState?.currentRound]);

  // ── Render side preview when hovered molecule changes ────────────────────
  useEffect(() => {
    const target = hoveredMol;
    if (!sidePreviewRef.current || !target) return;
    setSidePreviewError(false);
    renderMolecule(sidePreviewRef.current, target.smiles, () => setSidePreviewError(true), 160, 120);
  }, [hoveredMol]);

  // ── Canvas resize observer ────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.parentElement) return;

    const resizeCanvas = () => {
      if (!canvas.parentElement) return;
      const ctx = canvas.getContext('2d');
      const imgData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;
      if (ctx && imgData && imgData.width > 0 && imgData.height > 0) {
        ctx.putImageData(imgData, 0, 0);
      }
    };

    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(canvas.parentElement);
    resizeCanvas();
    return () => observer.disconnect();
  }, []);

  // ── Render molecule in the playing-state preview panel ────────────────────
  useEffect(() => {
    const isDrawer = roomState?.currentDrawer === socket?.id;
    const shouldShow =
      Boolean(isDrawer) &&
      Boolean(previewWord) &&
      (roomState?.state === 'choosing_word' || roomState?.state === 'playing');
    if (!shouldShow || !previewCanvasRef.current || !previewWord) return;
    renderMolecule(previewCanvasRef.current, previewWord.smiles, setPreviewError);
  }, [previewWord, roomState?.state, roomState?.currentDrawer, socket?.id]);

  // ── Derived values ────────────────────────────────────────────────────────
  const isDrawer = roomState?.currentDrawer === socket?.id;
  const shouldShowPreview =
    Boolean(isDrawer) &&
    Boolean(previewWord) &&
    (roomState?.state === 'choosing_word' || roomState?.state === 'playing');
  const previewTarget = previewWord;

  // ── Filtered molecule list ────────────────────────────────────────────────
  const filteredByType = useMemo(() => {
    const q = listSearch.toLowerCase().trim();
    if (!q) return hydrocardonsByType;
    const result: Record<string, typeof hydrocarbons> = {};
    for (const type of TYPE_ORDER) {
      const items = (hydrocardonsByType[type] ?? []).filter((h) =>
        h.name.toLowerCase().includes(q),
      );
      if (items.length) result[type] = items;
    }
    return result;
  }, [listSearch]);

  // ── Guess input with fuzzy search ─────────────────────────────────────────
  const handleGuessSearch = (text: string) => {
    setGuessInput(text);
    if (text.length <= 1) {
      setSuggestions([]);
      return;
    }
    const matches = stringSimilarity.findBestMatch(
      text.toLowerCase(),
      hydrocarbons.map((h) => h.name.toLowerCase()),
    );
    const bestMatches = matches.ratings
      .filter((r) => r.rating > 0.3)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 5)
      .map((r) => hydrocarbons.find((h) => h.name.toLowerCase() === r.target))
      .filter((e): e is Hydrocarbon => Boolean(e));
    setSuggestions(bestMatches);
  };

  // ── Mobile: tapping a suggestion sends the guess immediately ─────────────
  const submitGuessFromSuggestion = useCallback(
    (name: string) => {
      guess(name);
      setGuessInput('');
      setSuggestions([]);
    },
    [guess],
  );

  const sendGuess = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guessInput.trim()) return;
    guess(guessInput.trim());
    setGuessInput('');
    setSuggestions([]);
  };

  // ── Drawing helpers ───────────────────────────────────────────────────────
  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (roomState?.currentDrawer !== socket?.id || roomState?.state !== 'playing') return;
    setIsDrawing(true);
    lastPos.current = getPos(e);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    lastPos.current = null;
  };

  const drawOnCanvas = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || roomState?.currentDrawer !== socket?.id || roomState?.state !== 'playing') return;
    const pos = getPos(e);
    if (!lastPos.current) return;
    const data = {
      x0: lastPos.current.x,
      y0: lastPos.current.y,
      x1: pos.x,
      y1: pos.y,
      color: tool === 'eraser' ? '#ffffff' : color,
      lineWidth,
    };
    draw(data);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.beginPath();
        ctx.moveTo(data.x0, data.y0);
        ctx.lineTo(data.x1, data.y1);
        ctx.strokeStyle = data.color;
        ctx.lineWidth = data.lineWidth;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.closePath();
      }
    }
    lastPos.current = pos;
  };

  const submitJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = joinNameInput.trim();
    if (!trimmed) {
      setJoinError('Informe seu nome para entrar na sala.');
      return;
    }
    setJoinError('');
    setPlayerName(trimmed);
    setHasJoined(true);
  };

  // ── Toggle type group collapse ────────────────────────────────────────────
  const toggleType = (type: string) => {
    setCollapsedTypes((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Join screen ──────────────────────────────────────────────────────────
  if (!hasJoined) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 flex items-center justify-center">
        <section className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-slate-800">Entrar na sala</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Sala <span className="font-mono font-bold">{roomId}</span>
          </p>
          <form onSubmit={submitJoin} className="mt-6 space-y-4">
            <label className="block text-sm font-semibold text-slate-700" htmlFor="join-name">
              Seu nome
            </label>
            <input
              id="join-name"
              type="text"
              autoFocus
              value={joinNameInput}
              onChange={(e) => setJoinNameInput(e.target.value)}
              placeholder="Ex: Ana"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            {joinError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                {joinError}
              </p>
            )}
            <button
              type="submit"
              className="w-full rounded-xl bg-indigo-600 text-white font-semibold py-3 text-base hover:bg-indigo-700 transition-colors"
            >
              Entrar agora
            </button>
          </form>
          <p className="mt-4 text-xs text-slate-500">
            Abrir pelo QR Code funciona direto no navegador do celular.
          </p>
        </section>
      </main>
    );
  }

  // ─── Loading screen ────────────────────────────────────────────────────────
  if (!roomState) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 p-6 text-center">
        <div>
          <p className="text-lg font-semibold text-slate-700">Conectando à sala...</p>
          <p className="text-slate-500 mt-1">Aguarde alguns segundos.</p>
        </div>
      </div>
    );
  }

  const currentDrawerPlayer = roomState.players?.find(
    (player: any) => player.id === roomState.currentDrawer,
  );
  const ranking = [...(roomState.players ?? [])].sort((a: any, b: any) => b.score - a.score);
  const showChatPanel = !isMobile || chatOpen;

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Main game screen ──────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[100dvh] bg-slate-50 overflow-hidden relative">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-white shadow-sm h-14 flex items-center justify-between px-3 sm:px-4 z-20 shrink-0 border-b border-slate-200">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <h1 className="font-bold text-indigo-600 text-lg hidden sm:block">QuimicDraw</h1>
          <div className="bg-slate-100 px-3 py-1 rounded-full text-xs font-mono font-bold text-slate-600 shrink-0">
            {roomId}
          </div>
        </div>

        <div className="flex items-center gap-3 min-w-0">
          {roomState.state === 'playing' && (
            <>
              <div
                className={`text-xl font-black tabular-nums ${
                  timeLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-slate-800'
                }`}
              >
                {timeLeft}s
              </div>
              <div className="hidden lg:block text-sm font-medium text-slate-500">
                Rodada {roomState.currentRound}/{roomState.settings.rounds}
              </div>
            </>
          )}
          <span className="text-sm font-semibold text-slate-700 truncate max-w-28 sm:max-w-40">
            {playerName}
          </span>
        </div>
      </header>

      {/* ── Main area ──────────────────────────────────────────────────────── */}
      <main className="flex-1 relative flex overflow-hidden">
        {/* Canvas area */}
        <div
          className="flex-1 relative bg-white cursor-crosshair touch-none"
          onMouseDown={startDrawing}
          onMouseUp={stopDrawing}
          onMouseOut={stopDrawing}
          onMouseMove={drawOnCanvas}
          onTouchStart={startDrawing}
          onTouchEnd={stopDrawing}
          onTouchCancel={stopDrawing}
          onTouchMove={drawOnCanvas}
        >
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

          {/* ── Molecule reference panel (visible while drawer draws) ─────── */}
          {shouldShowPreview && previewTarget && (
            <section className="absolute top-3 left-3 z-20 w-[180px] sm:w-[210px] rounded-2xl border border-slate-200 bg-white/97 backdrop-blur shadow-lg p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600 mb-1">
                Referência
              </p>
              <p className="text-sm font-bold text-slate-800 leading-snug break-words">
                {previewTarget.name}
              </p>
              <p className="text-[11px] text-slate-500 mb-2">
                {TYPE_LABELS[previewTarget.type] ?? previewTarget.type} · C{previewTarget.carbons}
              </p>
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-1">
                <svg
                  id={PREVIEW_CANVAS_ID}
                  ref={previewCanvasRef}
                  width={180}
                  height={130}
                  className="w-full h-[110px]"
                />
              </div>
              {previewError && (
                <p className="text-[10px] text-amber-700 mt-1 leading-snug">
                  {previewError} ({previewTarget.smiles})
                </p>
              )}
            </section>
          )}

          {/* ── Waiting overlay ──────────────────────────────────────────── */}
          {roomState.state === 'waiting' && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-10">
              <div className="text-center px-6">
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Aguardando o professor</h2>
                <p className="text-slate-500">A partida começará em breve.</p>
              </div>
            </div>
          )}

          {/* ── Choosing word overlay — FULL LIST PICKER ─────────────────── */}
          {roomState.state === 'choosing_word' && (
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-10 p-2 sm:p-6">
              {isDrawer ? (
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[96dvh] overflow-hidden">
                  {/* Modal header */}
                  <div className="p-4 border-b border-slate-100 shrink-0 bg-indigo-600 text-white rounded-t-2xl">
                    <h2 className="text-lg font-bold text-center">Escolha a molécula para desenhar</h2>
                    <p className="text-xs text-indigo-200 text-center mt-0.5">
                      Veja a estrutura e toque para confirmar
                    </p>
                  </div>

                  {/* Body */}
                  <div className="flex flex-1 overflow-hidden">

                    {/* Left: search + grouped card grid */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                      {/* Search bar */}
                      <div className="px-4 py-3 border-b border-slate-100 shrink-0">
                        <div className="relative">
                          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={listSearch}
                            onChange={(e) => setListSearch(e.target.value)}
                            placeholder="Filtrar por nome..."
                            autoFocus
                            className="w-full pl-8 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none bg-slate-50"
                          />
                        </div>
                        {listSearch && (
                          <p className="text-xs text-slate-400 mt-1 pl-1">
                            {Object.values(filteredByType).reduce((s, arr) => s + arr.length, 0)} resultado(s)
                          </p>
                        )}
                      </div>

                      {/* Grouped card grid (scrollable) */}
                      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
                        {Object.keys(filteredByType).length === 0 && (
                          <p className="text-sm text-slate-400 text-center py-8">
                            Nenhum resultado encontrado.
                          </p>
                        )}

                        {TYPE_ORDER.filter((t) => filteredByType[t]).map((type) => {
                          const isCollapsed = collapsedTypes[type];
                          return (
                            <div key={type}>
                              {/* Group header (collapsible) */}
                              <button
                                className="w-full flex items-center justify-between px-2 py-1.5 rounded-xl hover:bg-slate-100 transition-colors mb-2"
                                onClick={() => toggleType(type)}
                              >
                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                  {TYPE_LABELS[type]} ({filteredByType[type].length})
                                </span>
                                {isCollapsed ? (
                                  <ChevronDown size={14} className="text-slate-400" />
                                ) : (
                                  <ChevronUp size={14} className="text-slate-400" />
                                )}
                              </button>

                              {/* Card grid */}
                              {!isCollapsed && (
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                  {filteredByType[type].map((mol) => (
                                    <MoleculeCard
                                      key={mol.name}
                                      mol={mol as Hydrocarbon}
                                      isSelected={selectedMol?.name === mol.name}
                                      onHover={() => setHoveredMol(mol as Hydrocarbon)}
                                      onSelect={() => {
                                        setSelectedMol(mol as Hydrocarbon);
                                        setPreviewWord(mol as Hydrocarbon);
                                        selectWord(mol);
                                      }}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Right: large preview panel (desktop only) */}
                    <div className="hidden md:flex w-52 shrink-0 border-l border-slate-100 flex-col items-center justify-center p-4 bg-slate-50 gap-3">
                      {hoveredMol ? (
                        <>
                          <div className="text-center">
                            <p className="text-sm font-bold text-slate-800 break-words text-center">
                              {hoveredMol.name}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {TYPE_LABELS[hoveredMol.type]} · C{hoveredMol.carbons}
                            </p>
                          </div>
                          <div className="rounded-xl bg-white border border-slate-200 p-2 w-full">
                            <svg
                              id="side-preview-svg"
                              ref={sidePreviewRef}
                              width={160}
                              height={120}
                              className="w-full h-[110px]"
                            />
                          </div>
                          {sidePreviewError && (
                            <p className="text-[9px] text-amber-600 text-center">{hoveredMol.smiles}</p>
                          )}
                          <p className="text-[10px] text-indigo-500 font-semibold text-center mt-1">
                            Toque para selecionar
                          </p>
                        </>
                      ) : (
                        <div className="text-center">
                          <div className="text-4xl mb-3">🧪</div>
                          <p className="text-xs text-slate-400">
                            Passe o mouse sobre uma molécula para ver a estrutura
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center px-6">
                  <div className="bg-white rounded-2xl px-8 py-6 shadow-xl">
                    <div className="text-4xl mb-3">⏳</div>
                    <h2 className="text-2xl font-bold text-slate-800 mb-2">Aguarde</h2>
                    <p className="text-slate-500">O desenhista está escolhendo a molécula.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Round end overlay ────────────────────────────────────────── */}
          {roomState.state === 'round_end' && (
            <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex items-center justify-center z-10 px-4">
              <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-slate-200 text-center">
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Fim da rodada</h2>
                <p className="text-slate-500 mb-4">A resposta era:</p>
                <div className="text-3xl sm:text-4xl font-black text-emerald-500 mb-4 capitalize break-words">
                  {roomState.currentWord?.name}
                </div>
                <p className="text-sm text-slate-400">Próxima rodada em instantes...</p>
              </div>
            </div>
          )}

          {/* ── Game over overlay ─────────────────────────────────────────── */}
          {roomState.state === 'game_over' && (
            <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex items-center justify-center z-10 px-4">
              <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-xl max-w-md w-full border border-slate-200 text-center">
                <h2 className="text-3xl font-bold text-indigo-600 mb-6">Fim de jogo!</h2>
                <div className="space-y-2">
                  {ranking.map((player: any, index: number) => (
                    <div
                      key={player.id}
                      className={`flex justify-between items-center p-3 rounded-xl ${
                        index === 0
                          ? 'bg-amber-50 border border-amber-200'
                          : 'bg-slate-50'
                      }`}
                    >
                      <span className="font-bold text-slate-700 truncate pr-4">
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`}{' '}
                        {player.name}
                      </span>
                      <span className="font-black text-indigo-500">{player.score} pts</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Drawer indicator ─────────────────────────────────────────── */}
          {currentDrawerPlayer && roomState.state === 'playing' && (
            <div className="absolute top-3 right-3 bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 z-20 max-w-[60%]">
              <Pencil size={12} />
              <span className="truncate">
                {isDrawer ? 'Você está desenhando' : `${currentDrawerPlayer.name} está desenhando`}
              </span>
            </div>
          )}
        </div>

        {/* ── Drawing toolbar ───────────────────────────────────────────────── */}
        {isDrawer && roomState.state === 'playing' && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 w-[min(96vw,600px)]">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-xl p-2 flex items-center gap-1 sm:gap-2 overflow-x-auto">
              <button
                onClick={() => setTool('pen')}
                className={`p-2.5 rounded-xl transition-colors shrink-0 ${
                  tool === 'pen' ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-slate-100 text-slate-600'
                }`}
              >
                <Pencil size={20} />
              </button>
              <button
                onClick={() => setTool('eraser')}
                className={`p-2.5 rounded-xl transition-colors shrink-0 ${
                  tool === 'eraser' ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-slate-100 text-slate-600'
                }`}
              >
                <Eraser size={20} />
              </button>
              <div className="w-px h-7 bg-slate-200 mx-1 shrink-0" />
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-10 h-10 rounded-lg cursor-pointer border-0 p-0 shrink-0"
                aria-label="Cor"
              />
              <input
                type="range"
                min="1"
                max="20"
                value={lineWidth}
                onChange={(e) => setLineWidth(parseInt(e.target.value, 10))}
                className="w-24 sm:w-32 mx-1"
                aria-label="Espessura"
              />
              <div className="w-px h-7 bg-slate-200 mx-1 shrink-0" />
              <button
                onClick={clearCanvasStore}
                className="p-2.5 rounded-xl hover:bg-red-50 text-red-500 transition-colors shrink-0"
                aria-label="Limpar quadro"
              >
                <Trash2 size={20} />
              </button>
            </div>
          </div>
        )}

        {/* ── Chat / Guess panel ────────────────────────────────────────────── */}
        <AnimatePresence>
          {showChatPanel && (
            <motion.aside
              initial={isMobile ? { x: '100%' } : false}
              animate={{ x: 0 }}
              exit={isMobile ? { x: '100%' } : undefined}
              transition={{ type: 'spring', damping: 24, stiffness: 210 }}
              className="absolute md:relative right-0 top-0 bottom-0 w-full sm:w-80 bg-white border-l border-slate-200 flex flex-col z-30 shadow-2xl md:shadow-none"
            >
              {/* Chat header */}
              <div className="p-3 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
                <h3 className="font-bold text-slate-800 text-sm">Chat &amp; Palpites</h3>
                <button
                  className="md:hidden p-2 text-slate-500 hover:bg-slate-200 rounded-lg"
                  onClick={() => setChatOpen(false)}
                  aria-label="Fechar chat"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Players score bar */}
              <div className="flex gap-1 px-3 py-2 overflow-x-auto shrink-0 border-b border-slate-100 bg-white">
                {[...(roomState.players ?? [])]
                  .sort((a: any, b: any) => b.score - a.score)
                  .map((p: any) => (
                    <div
                      key={p.id}
                      className={`flex flex-col items-center px-2 py-1 rounded-lg shrink-0 text-center min-w-[52px] ${
                        p.hasGuessed
                          ? 'bg-emerald-50 border border-emerald-200'
                          : 'bg-slate-50 border border-slate-200'
                      }`}
                    >
                      <span className="text-[11px] font-semibold text-slate-700 truncate max-w-[56px]">
                        {p.name.split(' ')[0]}
                      </span>
                      <span className="text-[11px] font-black text-indigo-500">{p.score}</span>
                    </div>
                  ))}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {messages.length === 0 && (
                  <p className="text-xs text-slate-400 text-center mt-4">Nenhuma mensagem ainda.</p>
                )}
                {messages.map((msg, index) => (
                  <div
                    key={`${msg.sender}-${index}-${msg.text}`}
                    className={`text-sm leading-snug ${
                      msg.isSystem
                        ? msg.isCorrect
                          ? 'text-emerald-700 font-bold bg-emerald-50 px-3 py-2 rounded-xl'
                          : 'text-slate-400 italic text-xs'
                        : 'text-slate-700'
                    }`}
                  >
                    {!msg.isSystem && (
                      <span className="font-bold mr-1 text-indigo-600">{msg.sender}:</span>
                    )}
                    {msg.text}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Guess input */}
              {!isDrawer && roomState.state === 'playing' && (
                <div className="p-3 border-t border-slate-200 bg-slate-50 shrink-0">
                  <form onSubmit={sendGuess} className="relative">
                    <input
                      type="text"
                      value={guessInput}
                      onChange={(e) => handleGuessSearch(e.target.value)}
                      placeholder="Digite seu palpite..."
                      autoComplete="off"
                      className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none text-base"
                    />

                    {/* Mobile: tapping a suggestion sends immediately */}
                    {suggestions.length > 0 && (
                      <ul className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-52 overflow-y-auto z-40">
                        {suggestions.map((suggestion, index) => (
                          <li key={`${suggestion.name}-${index}`}>
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                submitGuessFromSuggestion(suggestion.name);
                              }}
                              onTouchEnd={(e) => {
                                e.preventDefault();
                                submitGuessFromSuggestion(suggestion.name);
                              }}
                              className="w-full text-left px-4 py-3 hover:bg-indigo-50 active:bg-indigo-100 border-b border-slate-100 last:border-0 text-sm font-semibold text-slate-700"
                            >
                              {suggestion.name}
                              <span className="text-xs text-slate-400 ml-2 font-normal">
                                {suggestion.type}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </form>
                </div>
              )}
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Mobile chat toggle button */}
        {isMobile && !chatOpen && (
          <button
            className="absolute bottom-4 right-4 z-20 bg-indigo-600 text-white p-4 rounded-full shadow-lg"
            onClick={() => setChatOpen(true)}
            aria-label="Abrir chat"
          >
            <MessageSquare size={22} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        )}
      </main>
    </div>
  );
}
