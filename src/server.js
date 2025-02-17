const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// Safe chalk import with fallback
let chalk;
try {
    chalk = require('chalk');
} catch (error) {
    // Fallback to a simple logging function if chalk is not available
    chalk = {
        green: (msg) => msg,
        red: (msg) => msg,
        blue: (msg) => msg,
        yellow: (msg) => msg,
        cyan: (msg) => msg,
        magenta: (msg) => msg
    };
    console.warn('Chalk module not found. Using basic logging.');
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 10000;

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Rooms to track game state
const rooms = {};

// Logging function
function logRoomStatus(action, roomId, details = {}) {
    const timestamp = new Date().toLocaleTimeString();
    switch(action) {
        case 'create':
            console.log(chalk.green(`[${timestamp}] Room Created: ${roomId}`));
            break;
        case 'delete':
            console.log(chalk.red(`[${timestamp}] Room Deleted: ${roomId}`));
            break;
        case 'join':
            console.log(chalk.blue(`[${timestamp}] Player Joined Room: ${roomId} - ${details.playerName}`));
            break;
        case 'leave':
            console.log(chalk.yellow(`[${timestamp}] Player Left Room: ${roomId} - ${details.playerName}`));
            break;
    }
}

// Updated Winning Logic for 4x4 Grid
function checkWinner(board) {
    // Horizontal Wins
    for (let row = 0; row < 4; row++) {
        const rowStart = row * 4;
        if (board[rowStart] && 
            board[rowStart] === board[rowStart + 1] && 
            board[rowStart] === board[rowStart + 2] && 
            board[rowStart] === board[rowStart + 3]) {
            return board[rowStart];
        }
    }

    // Vertical Wins
    for (let col = 0; col < 4; col++) {
        if (board[col] && 
            board[col] === board[col + 4] && 
            board[col] === board[col + 8] && 
            board[col] === board[col + 12]) {
            return board[col];
        }
    }

    // Diagonal Wins (Top-left to bottom-right)
    if (board[0] && 
        board[0] === board[5] && 
        board[0] === board[10] && 
        board[0] === board[15]) {
        return board[0];
    }

    // Diagonal Wins (Top-right to bottom-left)
    if (board[3] && 
        board[3] === board[6] && 
        board[3] === board[9] && 
        board[3] === board[12]) {
        return board[3];
    }

    // Check for Draw
    if (!board.includes('')) {
        return 'draw';
    }

    return null;
}

io.on('connection', (socket) => {
    console.log(chalk.cyan(`New client connected: ${socket.id}`));

    socket.on('check_room', (data) => {
        const { roomId } = data;
        
        // Check if room exists and its status
        if (rooms[roomId]) {
            if (rooms[roomId].gameStarted) {
                // Room is currently in a game
                socket.emit('room_status_response', {
                    available: false,
                    message: 'Room is currently in a game. Please choose another room.',
                    currentPlayers: rooms[roomId].players.length,
                    maxPlayers: rooms[roomId].maxPlayers
                });
            } else if (rooms[roomId].players.length >= rooms[roomId].maxPlayers) {
                // Room is full
                socket.emit('room_status_response', {
                    available: false,
                    message: 'Room is full. Please choose another room.',
                    currentPlayers: rooms[roomId].players.length,
                    maxPlayers: rooms[roomId].maxPlayers
                });
            } else {
                // Room is available
                socket.emit('room_status_response', {
                    available: true,
                    message: 'Room is available.',
                    currentPlayers: rooms[roomId].players.length,
                    maxPlayers: rooms[roomId].maxPlayers
                });
            }
        } else {
            // Room doesn't exist, can be created
            socket.emit('room_status_response', {
                available: true,
                message: 'Room is available.',
                currentPlayers: 0,
                maxPlayers: 2
            });
        }
    });

    socket.on('join_room', (data) => {
        const { playerName, roomId } = data;

        // Create room if it doesn't exist
        if (!rooms[roomId]) {
            rooms[roomId] = {
                players: [],
                readyPlayers: 0,
                gameStarted: false,
                maxPlayers: 2,
                gameBoard: ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
                currentPlayer: null,
                round: 0,
                gameWinner: null
            };
            logRoomStatus('create', roomId);
        }

        // Check if room is full or game is in progress
        if (rooms[roomId].gameStarted || rooms[roomId].players.length >= rooms[roomId].maxPlayers) {
            socket.emit('join_error', { 
                message: 'Room is full or game is in progress. Choose another room.',
                currentPlayers: rooms[roomId].players.length,
                maxPlayers: rooms[roomId].maxPlayers
            });
            return;
        }

        // Check for duplicate names
        const isDuplicateName = rooms[roomId].players.some(p => p.name === playerName);
        if (isDuplicateName) {
            socket.emit('join_error', { 
                message: 'Player name already exists in this room',
                currentPlayers: rooms[roomId].players.length,
                maxPlayers: rooms[roomId].maxPlayers
            });
            return;
        }

        // Determine player number
        const playerNumber = rooms[roomId].players.length + 1;

        // Add player to room
        const newPlayer = { 
            id: socket.id, 
            name: playerName,
            playerNumber: playerNumber,
            symbol: playerNumber === 1 ? 'X' : 'O'
        };
        rooms[roomId].players.push(newPlayer);

        // Log player join
        logRoomStatus('join', roomId, { playerName });

        // Join socket room
        socket.join(roomId);

        // Emit room status to all players in the room
        io.to(roomId).emit('room_status', {
            roomId,
            players: rooms[roomId].players,
            currentPlayers: rooms[roomId].players.length,
            maxPlayers: rooms[roomId].maxPlayers
        });

        // Emit join confirmation to the joining player
        socket.emit('join_confirmation', {
            roomId,
            playerName,
            symbol: newPlayer.symbol
        });

        // If room is full, prepare to start the game
        if (rooms[roomId].players.length === rooms[roomId].maxPlayers) {
            // Delay to allow UI to show waiting and prepare
            setTimeout(() => {
                rooms[roomId].gameStarted = true;
                rooms[roomId].round = 1;
                rooms[roomId].currentPlayer = rooms[roomId].players[0].symbol; // First player starts

                io.to(roomId).emit('room_full', {
                    roomId,
                    players: rooms[roomId].players,
                    currentPlayer: rooms[roomId].currentPlayer,
                    round: rooms[roomId].round
                });
            }, 3000);  // 3-second countdown
        }
    });

    socket.on('make_move', (data) => {
        const { roomId, playerName, position, symbol } = data;
        const room = rooms[roomId];

        if (!room || room.gameBoard[position] !== '') return;

        // Update game board
        room.gameBoard[position] = symbol;

        // Check for winner
        const winner = checkWinner(room.gameBoard);

        // Broadcast move to all players in the room
        io.to(roomId).emit('move_made', {
            position,
            symbol,
            currentPlayer: room.players[0].symbol === symbol ? room.players[1].symbol : room.players[0].symbol,
            winner: winner === 'draw' ? null : (winner ? playerName : null),
            isDraw: winner === 'draw'
        });

        // Handle game end
        if (winner) {
            // Reset room or handle game over logic
            room.gameStarted = false;
            room.gameBoard = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
        }
    });

    // Game End Handling
    socket.on('game_end', (data) => {
        const { roomId } = data;
        
        if (rooms[roomId]) {
            // Reset game state but keep room
            rooms[roomId].gameStarted = false;
            rooms[roomId].gameBoard = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
            rooms[roomId].currentPlayer = null;
            rooms[roomId].round = 0;
            rooms[roomId].gameWinner = null;
        }
    });

    // Leave Game Functionality
    socket.on('leave_game', (data) => {
        const { roomId, playerName } = data;
        
        if (!rooms[roomId]) return;

        // Remove player from room
        const playerIndex = rooms[roomId].players.findIndex(p => p.name === playerName);
        if (playerIndex !== -1) {
            rooms[roomId].players.splice(playerIndex, 1);

            // Notify other player that this player left
            socket.to(roomId).emit('player_disconnected', {
                playerName
            });

            // Reset game state
            rooms[roomId].gameStarted = false;
            rooms[roomId].gameBoard = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
            rooms[roomId].currentPlayer = null;
            rooms[roomId].round = 0;

            // If room becomes empty, delete it
            if (rooms[roomId].players.length === 0) {
                logRoomStatus('delete', roomId);
                delete rooms[roomId];
            }
        }
    });

    // Disconnect handling
    socket.on('disconnect', () => {
        console.log(chalk.magenta(`Client disconnected: ${socket.id}`));

        // Clean up rooms where player was part of
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            
            if (playerIndex !== -1) {
                // Remove the player
                const disconnectedPlayer = room.players[playerIndex];
                room.players.splice(playerIndex, 1);

                // Log player leave
                logRoomStatus('leave', roomId, { playerName: disconnectedPlayer.name });

                // Notify other player
                socket.to(roomId).emit('player_disconnected', {
                    playerName: disconnectedPlayer.name
                });

                // Reset game state
                room.gameStarted = false;
                room.gameBoard = ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
                room.currentPlayer = null;
                room.round = 0;

                // If room becomes empty, delete it
                if (room.players.length === 0) {
                    logRoomStatus('delete', roomId);
                    delete rooms[roomId];
                }
            }
        }
    });
});

// Start server
server.listen(PORT, () => {
    console.log(chalk.green(`Server running on port ${PORT}`));
});
