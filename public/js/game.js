document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    const playerNameSpan = document.getElementById('playerName');
    const roomIdSpan = document.getElementById('roomId');
    const boxes = document.querySelectorAll('.box');
    const resetButton = document.querySelector('.reset');
    const winScreen = document.querySelector('.win2');
    const winnerSpan = document.querySelector('.winner');
    const newGameButton = document.querySelector('.ng');

    // Retrieve player info from localStorage
    const playerName = localStorage.getItem('playerName');
    const roomId = localStorage.getItem('roomId');
    const playerSymbol = localStorage.getItem('playerSymbol');
    const gameData = JSON.parse(localStorage.getItem('gameData'));

    // Display player info
    playerNameSpan.textContent = playerName || 'Guest';
    roomIdSpan.textContent = roomId || 'No Room';

    let gameBoard = ['', '', '', '', '', '', '', '', ''];
    let currentPlayer = 'X';
    let gameActive = false;

    const winningConditions = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],  // Rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8],  // Columns
        [0, 4, 8], [2, 4, 6]  // Diagonals
    ];

    function checkWinner(board) {
        for (let condition of winningConditions) {
            const [a, b, c] = condition;
            if (board[a] && board[a] === board[b] && board[a] === board[c]) {
                return board[a];
            }
        }

        if (!board.includes('')) {
            return 'draw';
        }

        return null;
    }

    function updateBoard(board) {
        boxes.forEach((box, index) => {
            box.textContent = board[index];
            box.classList.remove('X', 'O');
            if (board[index]) {
                box.classList.add(board[index]);
            }
        });
    }

    function handleBoxClick(event) {
        const clickedBox = event.target;
        const clickedBoxIndex = Array.from(boxes).indexOf(clickedBox);

        // Only allow move if it's the player's turn and the box is empty
        if (currentPlayer === playerSymbol && gameBoard[clickedBoxIndex] === '' && gameActive) {
            socket.emit('make_move', { 
                roomId, 
                index: clickedBoxIndex, 
                playerSymbol 
            });
        }
    }

    function resetGame() {
        gameBoard = ['', '', '', '', '', '', '', '', ''];
        gameActive = false;
        currentPlayer = 'X';
        winScreen.classList.add('hide');
        winnerSpan.textContent = '';
        updateBoard(gameBoard);

        // Emit reset request to server
        socket.emit('reset_game', { roomId });
    }

    // Socket event listeners
    socket.on('game_ready', (data) => {
        // Update player list and start game
        gameActive = true;
        currentPlayer = data.currentPlayer;
        
        // Display players
        const players = data.players.map(p => `${p.name} (${p.symbol})`).join(' vs ');
        playerNameSpan.textContent = players;
    });

    socket.on('move_made', (data) => {
        gameBoard = data.board;
        currentPlayer = data.currentPlayer;
        updateBoard(gameBoard);

        // Check for winner
        const winner = checkWinner(gameBoard);
        if (winner) {
            gameActive = false;
            winScreen.classList.remove('hide');
            
            if (winner === 'draw') {
                winnerSpan.textContent = "It's a draw!";
            } else {
                const winningPlayerName = gameData.players.find(p => p.symbol === winner).name;
                winnerSpan.textContent = `${winningPlayerName} (${winner}) wins!`;
            }
        }
    });

    // Handle player disconnection
    socket.on('player_disconnected', (data) => {
        gameActive = false;
        winScreen.classList.remove('hide');
        winnerSpan.textContent = data.message;
    });

    // Event listeners
    boxes.forEach(box => box.addEventListener('click', handleBoxClick));
    resetButton.addEventListener('click', resetGame);
    newGameButton.addEventListener('click', resetGame);
});
