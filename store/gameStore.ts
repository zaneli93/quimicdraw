import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

interface GameState {
  socket: Socket | null;
  roomId: string | null;
  playerName: string;
  isHost: boolean;
  roomState: any;
  connect: (roomId: string, playerName: string, isHost?: boolean) => void;
  createRoom: (settings: any) => void;
  updateSettings: (settings: any) => void;
  startGame: () => void;
  selectWord: (word: any) => void;
  guess: (word: string) => void;
  draw: (data: any) => void;
  clearCanvas: () => void;
  kickPlayer: (playerId: string) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  socket: null,
  roomId: null,
  playerName: '',
  isHost: false,
  roomState: null,

  connect: (roomId, playerName, isHost = false) => {
    if (get().socket) {
      set({ roomId, playerName, isHost });
      if (!isHost && get().socket?.connected) {
        get().socket?.emit('join_room', { roomId, playerName });
      }
      return;
    }
    
    // Connect to the same host (works locally and in production)
    const socketUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const socket = io(socketUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('Connected to server');
      const state = get();
      if (state.isHost) {
        // Host creation is handled separately
      } else {
        socket.emit('join_room', { roomId: state.roomId, playerName: state.playerName });
      }
    });

    socket.on('room_updated', (room) => {
      set({ roomState: room });
    });

    socket.on('room_created', (id) => {
      set({ roomId: id, isHost: true });
      // Host does not join as a player
    });

    socket.on('round_started', ({ endTime, drawer }) => {
      set((state) => ({
        roomState: { ...state.roomState, state: 'playing', roundEndTime: endTime, currentDrawer: drawer }
      }));
    });

    socket.on('choosing_word', ({ drawer }) => {
      set((state) => ({
        roomState: { ...state.roomState, state: 'choosing_word', currentDrawer: drawer }
      }));
    });

    socket.on('round_end', ({ word, players }) => {
      set((state) => ({
        roomState: { ...state.roomState, state: 'round_end', currentWord: word, players }
      }));
    });

    socket.on('game_over', (room) => {
      set({ roomState: room });
    });

    socket.on('kicked', () => {
      alert('Você foi expulso da sala.');
      window.location.href = '/';
    });

    set({ socket, roomId, playerName, isHost });
  },

  createRoom: (settings) => {
    const { socket } = get();
    if (socket) {
      socket.emit('create_room', { settings });
    }
  },

  updateSettings: (settings) => {
    const { socket, roomId } = get();
    if (socket && roomId) {
      socket.emit('update_settings', { roomId, settings });
    }
  },

  startGame: () => {
    const { socket, roomId } = get();
    if (socket && roomId) {
      socket.emit('start_game', roomId);
    }
  },

  selectWord: (word) => {
    const { socket, roomId } = get();
    if (socket && roomId) {
      socket.emit('select_word', { roomId, word });
    }
  },

  guess: (word) => {
    const { socket, roomId } = get();
    if (socket && roomId) {
      socket.emit('guess', { roomId, guess: word });
    }
  },

  draw: (data) => {
    const { socket, roomId } = get();
    if (socket && roomId) {
      socket.emit('draw', { roomId, data });
    }
  },

  clearCanvas: () => {
    const { socket, roomId } = get();
    if (socket && roomId) {
      socket.emit('clear_canvas', roomId);
    }
  },

  kickPlayer: (playerId) => {
    const { socket, roomId } = get();
    if (socket && roomId) {
      socket.emit('kick_player', { roomId, playerId });
    }
  }
}));
