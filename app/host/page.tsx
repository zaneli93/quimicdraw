'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { Shuffle, UserCheck, ArrowLeftRight, Pencil } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';

type DrawerMode = 'roundrobin' | 'random' | 'host';

export default function HostPage() {
  const router = useRouter();
  const roomId = useGameStore((state) => state.roomId);
  const roomState = useGameStore((state) => state.roomState);
  const startGame = useGameStore((state) => state.startGame);
  const kickPlayer = useGameStore((state) => state.kickPlayer);
  const updateSettings = useGameStore((state) => state.updateSettings);
  const setDrawer = useGameStore((state) => state.setDrawer);
  const isHost = useGameStore((state) => state.isHost);

  const [rounds, setRounds] = useState(roomState?.settings?.rounds || 3);
  const [roundTime, setRoundTime] = useState(roomState?.settings?.roundTime || 60);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(roomState?.drawerMode || 'roundrobin');
  const [settingsSaved, setSettingsSaved] = useState(false);

  useEffect(() => {
    if (!isHost) router.push('/');
  }, [isHost, router]);

  const handleSaveSettings = () => {
    updateSettings({ rounds, roundTime, drawerMode });
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  if (!roomId || !roomState) {
    return <div className="p-8 text-center text-slate-500">Carregando sala...</div>;
  }

  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/room/${roomId}` : '';
  const isWaiting = roomState.state === 'waiting' || roomState.state === 'game_over';
  const isChoosingDrawer = roomState.state === 'choosing_word' && drawerMode === 'host' && !roomState.currentDrawer;
  const currentDrawerPlayer = roomState.players?.find((p: any) => p.id === roomState.currentDrawer);

  const drawerModeOptions: { value: DrawerMode; label: string; description: string; icon: React.ReactNode }[] = [
    {
      value: 'roundrobin',
      label: 'Sequencial',
      description: 'Cada aluno desenha em ordem',
      icon: <ArrowLeftRight size={18} />,
    },
    {
      value: 'random',
      label: 'Aleatório',
      description: 'Sorteio automático a cada rodada',
      icon: <Shuffle size={18} />,
    },
    {
      value: 'host',
      label: 'Professor escolhe',
      description: 'Você seleciona quem vai desenhar',
      icon: <UserCheck size={18} />,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Painel de Controle ── */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-slate-200 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Painel do Professor</h1>
            <p className="text-slate-500 text-sm mt-1">Controle a partida e gerencie os alunos.</p>
          </div>

          {/* Código da sala */}
          <div className="p-5 bg-indigo-50 rounded-xl border border-indigo-100 flex flex-col items-center">
            <p className="text-xs text-indigo-600 font-semibold uppercase tracking-wider mb-1">Código da Sala</p>
            <p className="text-5xl font-mono font-bold text-indigo-900 tracking-widest">{roomId}</p>
          </div>

          {/* Configurações (somente enquanto aguarda ou fim de jogo) */}
          {isWaiting && (
            <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
              <h2 className="text-base font-bold text-slate-800">Configurações</h2>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Número de Rodadas</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={rounds}
                  onChange={(e) => setRounds(parseInt(e.target.value) || 3)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tempo por Rodada (segundos)</label>
                <input
                  type="number"
                  min="30"
                  max="180"
                  step="10"
                  value={roundTime}
                  onChange={(e) => setRoundTime(parseInt(e.target.value) || 60)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              {/* Modo do desenhista */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Quem vai desenhar?</label>
                <div className="grid grid-cols-1 gap-2">
                  {drawerModeOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setDrawerMode(opt.value)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                        drawerMode === opt.value
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <span className={drawerMode === opt.value ? 'text-indigo-600' : 'text-slate-400'}>
                        {opt.icon}
                      </span>
                      <div>
                        <p className="font-semibold text-sm">{opt.label}</p>
                        <p className="text-xs opacity-70">{opt.description}</p>
                      </div>
                      {drawerMode === opt.value && (
                        <span className="ml-auto w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleSaveSettings}
                className={`w-full font-semibold py-2.5 rounded-xl transition-colors text-sm ${
                  settingsSaved
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-800 text-white hover:bg-slate-900'
                }`}
              >
                {settingsSaved ? '✓ Salvo!' : 'Salvar Configurações'}
              </button>
            </div>
          )}

          {/* Status da partida em andamento */}
          {!isWaiting && roomState.state !== 'game_over' && (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm text-slate-600 space-y-1">
              <p>
                <span className="font-semibold">Rodada:</span>{' '}
                {roomState.currentRound}/{roomState.settings?.rounds}
              </p>
              <p>
                <span className="font-semibold">Estado:</span>{' '}
                {{
                  playing: '🎨 Desenhando',
                  choosing_word: '🔍 Escolhendo molécula',
                  round_end: '✅ Fim da rodada',
                }[roomState.state as string] ?? roomState.state}
              </p>
              {currentDrawerPlayer && (
                <p className="flex items-center gap-1">
                  <Pencil size={13} />
                  <span className="font-semibold">Desenhista:</span> {currentDrawerPlayer.name}
                </p>
              )}
            </div>
          )}

          {/* Botão iniciar / status */}
          <button
            onClick={() => startGame()}
            disabled={
              (!isWaiting) ||
              !roomState.players ||
              roomState.players.length === 0
            }
            className="w-full bg-emerald-500 text-white font-bold py-4 rounded-xl hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg"
          >
            {isWaiting
              ? !roomState.players || roomState.players.length === 0
                ? 'Aguardando alunos...'
                : roomState.state === 'game_over'
                ? 'Jogar Novamente'
                : 'Iniciar Partida'
              : 'Partida em Andamento'}
          </button>
        </div>

        {/* ── Coluna direita ── */}
        <div className="space-y-6">

          {/* QR Code */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center">
            <h2 className="text-base font-bold text-slate-800 mb-4">QR Code para Entrada</h2>
            <div className="p-3 bg-white border-2 border-slate-100 rounded-xl">
              <QRCodeSVG value={joinUrl} size={180} />
            </div>
            <p className="mt-3 text-xs text-slate-500 text-center break-all">{joinUrl}</p>
          </div>

          {/* ── Seleção manual de desenhista (modo professor escolhe) ── */}
          {isChoosingDrawer && (
            <div className="bg-amber-50 border-2 border-amber-300 p-5 rounded-2xl shadow-sm">
              <h2 className="text-base font-bold text-amber-800 mb-1 flex items-center gap-2">
                <UserCheck size={18} />
                Escolha quem vai desenhar
              </h2>
              <p className="text-xs text-amber-700 mb-4">
                Rodada {roomState.currentRound}/{roomState.settings?.rounds} — selecione um aluno abaixo.
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {roomState.players?.map((player: any) => (
                  <button
                    key={player.id}
                    onClick={() => setDrawer(player.id)}
                    className="w-full flex justify-between items-center px-4 py-3 bg-white border border-amber-200 rounded-xl hover:bg-amber-100 hover:border-amber-400 transition-all text-left"
                  >
                    <span className="font-semibold text-slate-800">{player.name}</span>
                    <span className="text-xs text-indigo-600 font-bold">{player.score} pts</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Lista de alunos */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-base font-bold text-slate-800 mb-3 flex justify-between items-center">
              <span>Alunos na Sala</span>
              <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-sm font-semibold">
                {roomState.players?.length || 0}
              </span>
            </h2>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {!roomState.players?.length ? (
                <p className="text-slate-400 text-center py-6 text-sm">Aguardando alunos...</p>
              ) : (
                [...(roomState.players ?? [])]
                  .sort((a: any, b: any) => b.score - a.score)
                  .map((player: any) => (
                    <div
                      key={player.id}
                      className={`flex justify-between items-center p-3 rounded-xl border ${
                        player.id === roomState.currentDrawer
                          ? 'bg-indigo-50 border-indigo-200'
                          : player.hasGuessed
                          ? 'bg-emerald-50 border-emerald-200'
                          : 'bg-slate-50 border-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {player.id === roomState.currentDrawer && (
                          <Pencil size={13} className="text-indigo-500 shrink-0" />
                        )}
                        {player.hasGuessed && player.id !== roomState.currentDrawer && (
                          <span className="text-emerald-500 text-xs shrink-0">✓</span>
                        )}
                        <span className="font-medium text-slate-700 truncate">{player.name}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm text-indigo-600 font-bold">{player.score} pts</span>
                        <button
                          onClick={() => kickPlayer(player.id)}
                          className="text-red-400 hover:text-red-600 text-xs font-medium transition-colors"
                        >
                          Expulsar
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
