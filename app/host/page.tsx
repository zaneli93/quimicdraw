'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { useGameStore } from '@/store/gameStore';

export default function HostPage() {
  const router = useRouter();
  const roomId = useGameStore((state) => state.roomId);
  const roomState = useGameStore((state) => state.roomState);
  const startGame = useGameStore((state) => state.startGame);
  const kickPlayer = useGameStore((state) => state.kickPlayer);
  const updateSettings = useGameStore((state) => state.updateSettings);

  const isHost = useGameStore((state) => state.isHost);

  const [rounds, setRounds] = useState(roomState?.settings?.rounds || 3);
  const [roundTime, setRoundTime] = useState(roomState?.settings?.roundTime || 60);

  useEffect(() => {
    if (!isHost) {
      router.push('/');
    }
  }, [isHost, router]);

  const handleSaveSettings = () => {
    updateSettings({ rounds, roundTime });
    alert('Configurações salvas!');
  };

  if (!roomId || !roomState) return <div className="p-8 text-center">Carregando sala...</div>;

  const joinUrl = typeof window !== 'undefined' ? `${window.location.origin}/room/${roomId}` : '';

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Painel de Controle */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
          <h1 className="text-3xl font-bold text-slate-800 mb-2">Painel do Professor</h1>
          <p className="text-slate-500 mb-8">Controle a partida e gerencie os alunos.</p>

          <div className="mb-8 p-6 bg-indigo-50 rounded-xl border border-indigo-100 flex flex-col items-center">
            <p className="text-sm text-indigo-600 font-semibold uppercase tracking-wider mb-2">Código da Sala</p>
            <p className="text-5xl font-mono font-bold text-indigo-900 tracking-widest">{roomId}</p>
          </div>

          {roomState.state === 'waiting' && (
            <div className="mb-8 p-6 bg-slate-50 rounded-xl border border-slate-200">
              <h2 className="text-lg font-bold text-slate-800 mb-4">Configurações da Partida</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Número de Rodadas</label>
                  <input 
                    type="number" 
                    min="1" 
                    max="10"
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
                <button 
                  onClick={handleSaveSettings}
                  className="w-full bg-slate-800 text-white font-semibold py-2 rounded-xl hover:bg-slate-900 transition-colors"
                >
                  Salvar Configurações
                </button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <button 
              onClick={() => startGame()}
              disabled={(roomState.state !== 'waiting' && roomState.state !== 'game_over') || !roomState.players || roomState.players.length === 0}
              className="w-full bg-emerald-500 text-white font-bold py-4 rounded-xl hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg"
            >
              {roomState.state === 'waiting' ? (!roomState.players || roomState.players.length === 0 ? 'Aguardando Alunos...' : 'Iniciar Partida') : 'Partida em Andamento'}
            </button>
            
            <button 
              onClick={() => {
                // Reiniciar sala
              }}
              className="w-full bg-slate-100 text-slate-700 font-semibold py-3 rounded-xl hover:bg-slate-200 transition-colors"
            >
              Reiniciar Sala
            </button>
          </div>
        </div>

        {/* QR Code e Jogadores */}
        <div className="space-y-8">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center">
            <h2 className="text-xl font-bold text-slate-800 mb-4">QR Code para Entrada</h2>
            <div className="p-4 bg-white border-2 border-slate-100 rounded-xl">
              <QRCodeSVG value={joinUrl} size={200} />
            </div>
            <p className="mt-4 text-sm text-slate-500 text-center break-all">{joinUrl}</p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-xl font-bold text-slate-800 mb-4 flex justify-between items-center">
              <span>Alunos na Sala</span>
              <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-sm">
                {roomState.players?.length || 0}
              </span>
            </h2>
            
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {roomState.players?.length === 0 ? (
                <p className="text-slate-500 text-center py-4">Aguardando alunos...</p>
              ) : (
                roomState.players?.map((player: any) => (
                  <div key={player.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                    <span className="font-medium text-slate-700">{player.name}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-emerald-600 font-bold">{player.score} pts</span>
                      <button 
                        onClick={() => kickPlayer(player.id)}
                        className="text-red-500 hover:text-red-700 text-sm font-medium"
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
