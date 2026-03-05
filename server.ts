import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server } from 'socket.io';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// In-memory store for rooms and players
const rooms = new Map<string, any>();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  const io = new Server(server, {
    cors: { origin: '*' }
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('create_room', ({ hostId, settings }) => {
      socket.rooms.forEach(r => {
        if (r !== socket.id) socket.leave(r);
      });
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      const newRoom = {
        id: roomId,
        hostId: socket.id,
        settings: {
          roundTime: settings?.roundTime || 60,
          rounds: settings?.rounds || 3,
          difficulty: settings?.difficulty || 'easy',
        },
        players: [],
        state: 'waiting', // waiting, playing, round_end, game_over
        currentDrawer: null,
        currentWord: null,
        currentRound: 0,
        roundEndTime: null,
        drawHistory: [],
        chatHistory: [],
        drawerMode: settings?.drawerMode || 'roundrobin', // roundrobin | random | host
        usedDrawerIds: [], // track who has already drawn (for random without repetition)
      };
      rooms.set(roomId, newRoom);
      socket.join(roomId);
      socket.emit('room_created', roomId);
      socket.emit('room_updated', newRoom);
    });

    socket.on('join_room', ({ roomId, playerName }) => {
      socket.rooms.forEach(r => {
        if (r !== socket.id) socket.leave(r);
      });
      const room = rooms.get(roomId);
      if (!room) {
        socket.emit('join_error', 'Sala nao encontrada');
        return;
      }
      if (room.state !== 'waiting' && !room.players.find((p: any) => p.id === socket.id)) {
        // Allow rejoin if implemented, but for MVP just reject if playing
        // Actually, let's allow joining mid-game
      }

      const newPlayer = {
        id: socket.id,
        name: playerName,
        score: 0,
        hasGuessed: false,
      };
      
      // Check if player already exists (reconnect)
      const existingIdx = room.players.findIndex((p: any) => p.name === playerName);
      if (existingIdx !== -1) {
         room.players[existingIdx].id = socket.id;
      } else {
         room.players.push(newPlayer);
      }

      socket.join(roomId);
      io.to(roomId).emit('room_updated', room);
      
      // Send current drawing state to the new player
      if (room.drawHistory.length > 0) {
        socket.emit('draw_history', room.drawHistory);
      }
    });

    socket.on('start_game', (roomId) => {
      const room = rooms.get(roomId);
      if (room && room.hostId === socket.id && room.players.length > 0) {
        room.state = 'playing';
        room.currentRound = 1;
        // Reset scores
        room.players.forEach((p: any) => p.score = 0);
        startNextRound(roomId);
      }
    });

    socket.on('select_word', ({ roomId, word }) => {
      const room = rooms.get(roomId);
      if (room && room.currentDrawer === socket.id) {
        room.currentWord = word;
        room.roundEndTime = Date.now() + room.settings.roundTime * 1000;
        room.state = 'playing';
        io.to(roomId).emit('round_started', {
          endTime: room.roundEndTime,
          drawer: room.currentDrawer,
        });

        // Auto-end round when time is up
        setTimeout(() => {
          const currentRoom = rooms.get(roomId);
          if (
            currentRoom && 
            currentRoom.state === 'playing' && 
            currentRoom.currentRound === room.currentRound &&
            currentRoom.currentWord?.name === word.name
          ) {
            endRound(roomId);
          }
        }, room.settings.roundTime * 1000);
      }
    });

    socket.on('update_settings', ({ roomId, settings }) => {
      const room = rooms.get(roomId);
      if (room && room.hostId === socket.id && room.state === 'waiting') {
        room.settings = { ...room.settings, ...settings };
        if (settings.drawerMode !== undefined) room.drawerMode = settings.drawerMode;
        io.to(roomId).emit('room_updated', room);
      }
    });

    // Host manually picks the drawer
    socket.on('set_drawer', ({ roomId, playerId }) => {
      const room = rooms.get(roomId);
      if (!room || room.hostId !== socket.id) return;
      if (room.state !== 'choosing_word') return;
      room.currentDrawer = playerId;
      room.currentWord = null;
      io.to(roomId).emit('room_updated', room);
      io.to(roomId).emit('choosing_word', { drawer: room.currentDrawer });
    });

    socket.on('draw', ({ roomId, data }) => {
      const room = rooms.get(roomId);
      if (room && room.currentDrawer === socket.id) {
        room.drawHistory.push(data);
        socket.to(roomId).emit('draw', data);
      }
    });

    socket.on('clear_canvas', (roomId) => {
      const room = rooms.get(roomId);
      if (room && room.currentDrawer === socket.id) {
        room.drawHistory = [];
        io.to(roomId).emit('clear_canvas');
      }
    });

    socket.on('guess', ({ roomId, guess }) => {
      const room = rooms.get(roomId);
      if (!room || room.state !== 'playing' || !room.currentWord) return;

      const player = room.players.find((p: any) => p.id === socket.id);
      if (!player || player.hasGuessed || socket.id === room.currentDrawer) return;

      // Normalize strings for comparison (remove accents, spaces, hyphens, lower case)
      const normalize = (str: string) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[- ]/g, "");
      
      const normalizedGuess = normalize(guess);
      const normalizedWord = normalize(room.currentWord.name);

      if (normalizedGuess === normalizedWord) {
        player.hasGuessed = true;
        // Calculate score based on time left
        const timeLeft = Math.max(0, room.roundEndTime - Date.now());
        const maxTime = room.settings.roundTime * 1000;
        const points = Math.floor((timeLeft / maxTime) * 100) + 10; // Base 10 + up to 100
        player.score += points;

        // Drawer also gets points
        const drawer = room.players.find((p: any) => p.id === room.currentDrawer);
        if (drawer) drawer.score += 15;

        io.to(roomId).emit('chat_message', {
          sender: 'System',
          text: `${player.name} acertou!`,
          isSystem: true,
          isCorrect: true,
        });
        io.to(roomId).emit('room_updated', room);

        // Check if everyone guessed
        const allGuessed = room.players.every((p: any) => p.hasGuessed || p.id === room.currentDrawer);
        if (allGuessed) {
          endRound(roomId);
        }
      } else {
        io.to(roomId).emit('chat_message', {
          sender: player.name,
          text: guess,
          isSystem: false,
        });
      }
    });

    socket.on('kick_player', ({ roomId, playerId }) => {
      const room = rooms.get(roomId);
      if (room && room.hostId === socket.id) {
        room.players = room.players.filter((p: any) => p.id !== playerId);
        io.to(roomId).emit('room_updated', room);
        io.to(playerId).emit('kicked');
      }
    });

    socket.on('disconnect', () => {
      // Handle player disconnect
      rooms.forEach((room, roomId) => {
        const playerIdx = room.players.findIndex((p: any) => p.id === socket.id);
        if (playerIdx !== -1) {
           // For MVP, we just mark them or remove them. Let's remove them.
           room.players.splice(playerIdx, 1);
           io.to(roomId).emit('room_updated', room);
           
           if (room.currentDrawer === socket.id && room.state === 'playing') {
             endRound(roomId);
           }
        }
        if (room.hostId === socket.id) {
           // Host disconnected, maybe end game or assign new host
           io.to(roomId).emit('host_disconnected');
        }
      });
    });

    function startNextRound(roomId: string) {
      const room = rooms.get(roomId);
      if (!room) return;

      if (room.players.length === 0) {
        room.state = 'waiting';
        room.currentRound = 0;
        io.to(roomId).emit('room_updated', room);
        return;
      }

      if (room.currentRound > room.settings.rounds) {
        room.state = 'game_over';
        io.to(roomId).emit('game_over', room);
        return;
      }

      room.state = 'choosing_word';
      room.drawHistory = [];
      room.players.forEach((p: any) => p.hasGuessed = false);
      
      // Select next drawer based on drawerMode
      const mode = room.drawerMode || 'roundrobin';

      if (mode === 'host') {
        // Host will pick manually — set drawer as null and wait for set_drawer event
        room.currentDrawer = null;
      } else if (mode === 'random') {
        // Random without repetition — reset when everyone has drawn
        const available = room.players.filter((p: any) => !room.usedDrawerIds.includes(p.id));
        if (available.length === 0) {
          room.usedDrawerIds = [];
          const all = room.players;
          room.currentDrawer = all[Math.floor(Math.random() * all.length)].id;
        } else {
          room.currentDrawer = available[Math.floor(Math.random() * available.length)].id;
        }
        room.usedDrawerIds.push(room.currentDrawer);
      } else {
        // roundrobin (default)
        const drawerIndex = (room.currentRound - 1) % room.players.length;
        room.currentDrawer = room.players[drawerIndex].id;
      }
      room.currentWord = null;

      io.to(roomId).emit('room_updated', room);
      io.to(roomId).emit('clear_canvas');

      if (room.currentDrawer) {
        io.to(roomId).emit('choosing_word', { drawer: room.currentDrawer });
      } else {
        // Host mode: waiting for professor to pick drawer
        io.to(roomId).emit('waiting_for_drawer');
      }

      // No timeout while choosing a word.
      // The drawer can take as long as needed before the round timer starts.
    }

    function endRound(roomId: string) {
      const room = rooms.get(roomId);
      if (!room) return;

      room.state = 'round_end';
      io.to(roomId).emit('round_end', {
        word: room.currentWord,
        players: room.players,
      });

      setTimeout(() => {
        const currentRoom = rooms.get(roomId);
        if (currentRoom && currentRoom.state === 'round_end') {
          currentRoom.currentRound++;
          startNextRound(roomId);
        }
      }, 3000); // Show results for 3 seconds
    }
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});


