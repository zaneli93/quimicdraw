'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { useGameStore } from '@/store/gameStore';

export default function Home() {
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState('');
  const router = useRouter();
  const connect = useGameStore((state) => state.connect);
  const createRoom = useGameStore((state) => state.createRoom);

  const handleJoinRoom = () => {
    if (!name || !roomId) return alert('Digite seu nome e o código da sala');
    router.push(`/room/${roomId.toUpperCase()}?name=${encodeURIComponent(name)}`);
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full"
      >
        <h1 className="text-4xl font-bold text-center text-indigo-600 mb-2">QuimicDraw</h1>
        <p className="text-center text-slate-500 mb-8">Adivinhe o hidrocarboneto!</p>

        <div className="space-y-4">
          <div className="pt-4 border-t border-slate-100">
            <button 
              onClick={() => {
                connect('', 'Professor', true);
                createRoom({ roundTime: 60, rounds: 3, difficulty: 'easy' });
                router.push('/host');
              }}
              className="w-full bg-indigo-600 text-white font-semibold py-3 rounded-xl hover:bg-indigo-700 transition-colors"
            >
              Criar Nova Sala (Professor)
            </button>
          </div>

          <div className="relative py-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-4 text-sm text-slate-500">ou entrar como aluno</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Seu Nome</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder="Ex: João Silva"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Código da Sala</label>
            <input 
              type="text" 
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
              className="w-full px-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none uppercase"
              placeholder="Ex: ABC123"
            />
          </div>

          <button 
            onClick={handleJoinRoom}
            className="w-full bg-emerald-500 text-white font-semibold py-3 rounded-xl hover:bg-emerald-600 transition-colors"
          >
            Entrar na Sala
          </button>
        </div>
      </motion.div>
    </main>
  );
}
