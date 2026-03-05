'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Pencil, Eraser, Trash2, MessageSquare, X } from 'lucide-react';
import stringSimilarity from 'string-similarity';

import hydrocarbons from '@/data/hydrocarbons.json';
import { useIsMobile } from '@/hooks/use-mobile';
import { useGameStore } from '@/store/gameStore';

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

const PREVIEW_CANVAS_ID = 'molecule-preview-canvas';

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

  const [joinNameInput, setJoinNameInput] = useState(initialName);
  const [playerName, setPlayerName] = useState(initialName);
  const [hasJoined, setHasJoined] = useState(Boolean(initialName));
  const [joinError, setJoinError] = useState('');

  const [chatOpen, setChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [guessInput, setGuessInput] = useState('');
  const [suggestions, setSuggestions] = useState<Hydrocarbon[]>([]);
  const [wordSearch, setWordSearch] = useState('');
  const [wordSuggestions, setWordSuggestions] = useState<Hydrocarbon[]>([]);

  const [timeLeft, setTimeLeft] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#000000');
  const [lineWidth, setLineWidth] = useState(5);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');

  const [previewWord, setPreviewWord] = useState<Hydrocarbon | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<SVGSVGElement>(null);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const chatOpenRef = useRef(chatOpen);

  useEffect(() => {
    chatOpenRef.current = chatOpen;
    if (chatOpen) {
      setUnreadCount(0);
    }
  }, [chatOpen]);

  useEffect(() => {
    if (!hasJoined || !playerName) {
      return;
    }

    connect(roomId, playerName, false);
  }, [hasJoined, playerName, roomId, connect]);

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
          : 'Nao foi possivel entrar na sala. Verifique o codigo.';

      setJoinError(errorText);
      setHasJoined(false);
    };

    const handleHostDisconnected = () => {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'Sistema',
          text: 'O professor desconectou da sala.',
          isSystem: true,
        },
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

  useEffect(() => {
    if (roomState?.state !== 'playing' || !roomState.roundEndTime) {
      setTimeLeft(0);
      return;
    }

    const interval = setInterval(() => {
      const left = Math.max(0, Math.floor((roomState.roundEndTime - Date.now()) / 1000));
      setTimeLeft(left);
      if (left <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [roomState?.state, roomState?.roundEndTime]);

  useEffect(() => {
    if (roomState?.currentWord) {
      setPreviewWord(roomState.currentWord as Hydrocarbon);
      setPreviewError(null);
    }
  }, [roomState?.currentWord]);

  useEffect(() => {
    if (roomState?.state === 'choosing_word') {
      setWordSearch('');
      setWordSuggestions([]);
      setPreviewWord(null);
      setPreviewError('Busque uma molecula para visualizar a estrutura.');
    }
  }, [roomState?.state, roomState?.currentRound]);

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

    const observer = new ResizeObserver(() => {
      resizeCanvas();
    });

    observer.observe(canvas.parentElement);
    resizeCanvas();

    return () => observer.disconnect();
  }, []);

  const isDrawer = roomState?.currentDrawer === socket?.id;
  const shouldShowPreview =
    Boolean(isDrawer) &&
    (roomState?.state === 'choosing_word' || roomState?.state === 'playing');

  const previewTarget = roomState?.state === 'playing' ? roomState?.currentWord : previewWord;

  useEffect(() => {
    if (!shouldShowPreview || !previewCanvasRef.current) return;

    const svg = previewCanvasRef.current;
    svg.innerHTML = '';

    if (!previewTarget) {
      setPreviewError('Busque uma molecula para visualizar a estrutura.');
      return;
    }

    let cancelled = false;
    setPreviewError(null);

    import('smiles-drawer')
      .then((module) => {
        if (cancelled) return;

        const SmilesDrawer =
          (module as any).SmiDrawer || (module as any).Drawer || (module as any).default;

        if (!SmilesDrawer) {
          throw new Error('smiles-drawer indisponivel');
        }

        svg.innerHTML = '';
        const smilesDrawer = new SmilesDrawer({
          width: 180,
          height: 130,
          compactDrawing: true,
        });
        smilesDrawer.draw(previewTarget.smiles, `#${PREVIEW_CANVAS_ID}`, 'light', false);
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewError('Nao foi possivel renderizar essa estrutura automaticamente.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [shouldShowPreview, previewTarget]);

  const handleWordSearch = (text: string) => {
    setWordSearch(text);

    if (text.length <= 1) {
      setWordSuggestions([]);
      setPreviewWord(null);
      return;
    }

    const matches = stringSimilarity.findBestMatch(
      text.toLowerCase(),
      hydrocarbons.map((hydrocarbon) => hydrocarbon.name.toLowerCase()),
    );

    const bestMatches = matches.ratings
      .filter((rating) => rating.rating > 0.3)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 6)
      .map((rating) =>
        hydrocarbons.find((hydrocarbon) => hydrocarbon.name.toLowerCase() === rating.target),
      )
      .filter((entry): entry is Hydrocarbon => Boolean(entry));

    setWordSuggestions(bestMatches);

    if (bestMatches.length > 0) {
      setPreviewWord(bestMatches[0]);
    }
  };

  const handleGuessSearch = (text: string) => {
    setGuessInput(text);

    if (text.length <= 1) {
      setSuggestions([]);
      return;
    }

    const matches = stringSimilarity.findBestMatch(
      text.toLowerCase(),
      hydrocarbons.map((hydrocarbon) => hydrocarbon.name.toLowerCase()),
    );

    const bestMatches = matches.ratings
      .filter((rating) => rating.rating > 0.3)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 5)
      .map((rating) =>
        hydrocarbons.find((hydrocarbon) => hydrocarbon.name.toLowerCase() === rating.target),
      )
      .filter((entry): entry is Hydrocarbon => Boolean(entry));

    setSuggestions(bestMatches);
  };

  const sendGuess = (e: React.FormEvent) => {
    e.preventDefault();

    if (!guessInput.trim()) return;

    guess(guessInput.trim());
    setGuessInput('');
    setSuggestions([]);
  };

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

  if (!hasJoined) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 flex items-center justify-center">
        <section className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-slate-800">Entrar na sala</h1>
          <p className="text-slate-500 mt-1 text-sm">Sala <span className="font-mono font-bold">{roomId}</span></p>

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
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{joinError}</p>
            )}

            <button
              type="submit"
              className="w-full rounded-xl bg-indigo-600 text-white font-semibold py-3 text-base hover:bg-indigo-700 transition-colors"
            >
              Entrar agora
            </button>
          </form>

          <p className="mt-4 text-xs text-slate-500">Abrir pelo QR Code funciona direto no navegador do celular.</p>
        </section>
      </main>
    );
  }

  if (!roomState) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 p-6 text-center">
        <div>
          <p className="text-lg font-semibold text-slate-700">Conectando a sala...</p>
          <p className="text-slate-500 mt-1">Aguarde alguns segundos.</p>
        </div>
      </div>
    );
  }

  const currentDrawerPlayer = roomState.players?.find((player: any) => player.id === roomState.currentDrawer);
  const ranking = [...(roomState.players ?? [])].sort((a: any, b: any) => b.score - a.score);
  const showChatPanel = !isMobile || chatOpen;

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-50 overflow-hidden relative">
      <header className="bg-white shadow-sm h-16 flex items-center justify-between px-3 sm:px-4 z-20 shrink-0 border-b border-slate-200">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <h1 className="font-bold text-indigo-600 text-lg sm:text-xl hidden sm:block">QuimicDraw</h1>
          <div className="bg-slate-100 px-3 py-1 rounded-full text-xs sm:text-sm font-mono font-bold text-slate-600 shrink-0">
            {roomId}
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          {roomState.state === 'playing' && (
            <>
              <div className={`text-xl sm:text-2xl font-black ${timeLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-slate-800'}`}>
                {timeLeft}s
              </div>
              <div className="hidden lg:block text-sm font-medium text-slate-500">
                Rodada {roomState.currentRound}/{roomState.settings.rounds}
              </div>
            </>
          )}
          <span className="text-sm font-semibold text-slate-700 truncate max-w-28 sm:max-w-40">{playerName}</span>
        </div>
      </header>

      <main className="flex-1 relative flex overflow-hidden">
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

          {shouldShowPreview && (
            <section className="absolute top-3 left-3 z-20 w-[190px] sm:w-[220px] rounded-2xl border border-slate-200 bg-white/95 backdrop-blur shadow-lg p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Preview molecular</p>
              <p className="text-sm font-bold text-slate-800 leading-snug mt-1 break-words">
                {previewTarget?.name ?? 'Selecione uma molecula'}
              </p>
              <p className="text-xs text-slate-500 mb-2">{previewTarget?.type ?? 'Aguardando busca...'}</p>

              <div className="rounded-lg bg-slate-50 border border-slate-200 p-1">
                <svg id={PREVIEW_CANVAS_ID} ref={previewCanvasRef} width={180} height={130} className="w-full h-[120px]" />
              </div>

              {previewError ? (
                <p className="text-[11px] text-amber-700 mt-2 leading-snug">
                  {previewError}
                  {previewTarget?.smiles ? ` SMILES: ${previewTarget.smiles}` : ''}
                </p>
              ) : (
                <p className="text-[11px] text-slate-500 mt-2 truncate" title={previewTarget?.smiles ?? ''}>
                  {previewTarget?.smiles ? `SMILES: ${previewTarget.smiles}` : 'SMILES: -'}
                </p>
              )}
            </section>
          )}

          {roomState.state === 'waiting' && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-10">
              <div className="text-center px-6">
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Aguardando o professor</h2>
                <p className="text-slate-500">A partida comecara em breve.</p>
              </div>
            </div>
          )}

          {roomState.state === 'choosing_word' && (
            <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex items-center justify-center z-10 px-4">
              {isDrawer ? (
                <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-xl max-w-md w-full border border-slate-200">
                  <h2 className="text-2xl font-bold text-slate-800 mb-3 text-center">Sua vez de desenhar</h2>
                  <p className="text-slate-500 mb-5 text-center">
                    Busque um hidrocarboneto. Nao ha limite de tempo para escolher.
                  </p>

                  <div className="relative">
                    <input
                      type="text"
                      value={wordSearch}
                      onChange={(e) => handleWordSearch(e.target.value)}
                      placeholder="Busque por nome..."
                      className="w-full px-4 py-3 border-2 border-indigo-100 rounded-xl focus:border-indigo-500 focus:ring-0 outline-none text-base sm:text-lg"
                    />
                    {wordSuggestions.length > 0 && (
                      <ul className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-lg max-h-64 overflow-y-auto z-30">
                        {wordSuggestions.map((suggestion, index) => (
                          <li key={`${suggestion.name}-${index}`}>
                            <button
                              onMouseEnter={() => setPreviewWord(suggestion)}
                              onFocus={() => setPreviewWord(suggestion)}
                              onClick={() => {
                                setPreviewWord(suggestion);
                                selectWord(suggestion);
                              }}
                              className="w-full text-left px-4 py-3 hover:bg-indigo-50 border-b border-slate-100 last:border-0 transition-colors"
                            >
                              <span className="font-bold text-slate-800 block">{suggestion.name}</span>
                              <span className="text-xs text-slate-500 block">{suggestion.type} - C{suggestion.carbons}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center px-6">
                  <h2 className="text-2xl font-bold text-slate-800 mb-2">Aguarde</h2>
                  <p className="text-slate-500">O desenhista esta escolhendo a molecula.</p>
                </div>
              )}
            </div>
          )}

          {roomState.state === 'round_end' && (
            <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex items-center justify-center z-10 px-4">
              <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-slate-200 text-center">
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Fim da rodada</h2>
                <p className="text-slate-500 mb-6">A resposta era:</p>
                <div className="text-3xl sm:text-4xl font-black text-emerald-500 mb-4 capitalize break-words">
                  {roomState.currentWord?.name}
                </div>
                <p className="text-sm text-slate-400">Proxima rodada em instantes...</p>
              </div>
            </div>
          )}

          {roomState.state === 'game_over' && (
            <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex items-center justify-center z-10 px-4">
              <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-xl max-w-md w-full border border-slate-200 text-center">
                <h2 className="text-3xl font-bold text-indigo-600 mb-6">Fim de jogo</h2>
                <div className="space-y-3">
                  {ranking.map((player: any, index: number) => (
                    <div key={player.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                      <span className="font-bold text-slate-700 truncate pr-4">{index + 1}. {player.name}</span>
                      <span className="font-black text-indigo-500">{player.score} pts</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {currentDrawerPlayer && roomState.state === 'playing' && (
            <div className="absolute top-3 right-3 bg-indigo-100 text-indigo-700 px-3 py-2 rounded-full text-xs sm:text-sm font-bold flex items-center gap-2 z-20 max-w-[70%]">
              <Pencil size={14} />
              <span className="truncate">
                {isDrawer ? 'Voce esta desenhando' : `${currentDrawerPlayer.name} esta desenhando`}
              </span>
            </div>
          )}
        </div>

        {isDrawer && roomState.state === 'playing' && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 w-[min(96vw,680px)]">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-xl p-2 flex items-center gap-1 sm:gap-2 overflow-x-auto">
              <button
                onClick={() => setTool('pen')}
                className={`p-3 rounded-xl transition-colors shrink-0 ${tool === 'pen' ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-slate-100 text-slate-600'}`}
              >
                <Pencil size={22} />
              </button>
              <button
                onClick={() => setTool('eraser')}
                className={`p-3 rounded-xl transition-colors shrink-0 ${tool === 'eraser' ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-slate-100 text-slate-600'}`}
              >
                <Eraser size={22} />
              </button>

              <div className="w-px h-8 bg-slate-200 mx-1 shrink-0" />

              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-11 h-11 rounded-lg cursor-pointer border-0 p-0 shrink-0"
                aria-label="Cor"
              />
              <input
                type="range"
                min="1"
                max="20"
                value={lineWidth}
                onChange={(e) => setLineWidth(parseInt(e.target.value, 10))}
                className="w-28 sm:w-36 mx-1"
                aria-label="Espessura"
              />

              <div className="w-px h-8 bg-slate-200 mx-1 shrink-0" />

              <button
                onClick={clearCanvasStore}
                className="p-3 rounded-xl hover:bg-red-50 text-red-500 transition-colors shrink-0"
                aria-label="Limpar quadro"
              >
                <Trash2 size={22} />
              </button>
            </div>
          </div>
        )}

        <AnimatePresence>
          {showChatPanel && (
            <motion.aside
              initial={isMobile ? { x: '100%' } : false}
              animate={{ x: 0 }}
              exit={isMobile ? { x: '100%' } : undefined}
              transition={{ type: 'spring', damping: 24, stiffness: 210 }}
              className="absolute md:relative right-0 top-0 bottom-0 w-full sm:w-80 bg-white border-l border-slate-200 flex flex-col z-30 shadow-2xl md:shadow-none"
            >
              <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h3 className="font-bold text-slate-800">Chat e palpites</h3>
                <button
                  className="md:hidden p-2 text-slate-500 hover:bg-slate-200 rounded-lg"
                  onClick={() => setChatOpen(false)}
                  aria-label="Fechar chat"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 flex flex-col">
                {messages.length === 0 && (
                  <p className="text-sm text-slate-400">Nenhuma mensagem ainda.</p>
                )}
                {messages.map((msg, index) => (
                  <div
                    key={`${msg.sender}-${index}-${msg.text}`}
                    className={`text-sm ${msg.isSystem ? (msg.isCorrect ? 'text-emerald-700 font-bold bg-emerald-50 p-2 rounded-lg' : 'text-slate-500 italic') : 'text-slate-700'}`}
                  >
                    {!msg.isSystem && <span className="font-bold mr-2">{msg.sender}:</span>}
                    {msg.text}
                  </div>
                ))}
              </div>

              {!isDrawer && roomState.state === 'playing' && (
                <div className="p-4 border-t border-slate-200 bg-slate-50 relative">
                  <form onSubmit={sendGuess} className="relative">
                    <input
                      type="text"
                      value={guessInput}
                      onChange={(e) => handleGuessSearch(e.target.value)}
                      placeholder="De seu palpite..."
                      className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none"
                    />

                    {suggestions.length > 0 && (
                      <ul className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                        {suggestions.map((suggestion, index) => (
                          <li key={`${suggestion.name}-${index}`}>
                            <button
                              type="button"
                              onClick={() => {
                                setGuessInput(suggestion.name);
                                setSuggestions([]);
                              }}
                              className="w-full text-left px-4 py-2 hover:bg-indigo-50 border-b border-slate-100 last:border-0 text-sm font-medium text-slate-700"
                            >
                              {suggestion.name}
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

        {isMobile && !chatOpen && (
          <button
            className="absolute top-4 right-4 z-20 bg-white p-3 rounded-full shadow-lg border border-slate-200 text-indigo-600"
            onClick={() => setChatOpen(true)}
            aria-label="Abrir chat"
          >
            <MessageSquare size={24} />
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


