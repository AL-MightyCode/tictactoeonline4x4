document.addEventListener('DOMContentLoaded', () => {
    const playerNameInput = document.getElementById('playerName');
    const roomIdInput = document.getElementById('roomId');
    const joinGameButton = document.getElementById('joinGame');
    const errorMessageDiv = document.getElementById('errorMessage');

    // Connect to socket server
    const socket = io();

    joinGameButton.addEventListener('click', () => {
        const playerName = playerNameInput.value.trim();
        const roomId = roomIdInput.value.trim();

        if (playerName && roomId) {
            // Emit join room event
            socket.emit('join_room', { playerName, roomId });
        } else {
            errorMessageDiv.textContent = 'Please enter both your name and room ID';
        }
    });

    // Handle waiting for second player
    socket.on('waiting_for_player', (data) => {
        errorMessageDiv.textContent = data.message;
        errorMessageDiv.style.color = 'blue';
    });

    // Handle game ready event
    socket.on('game_ready', (data) => {
        // Store player info in localStorage
        localStorage.setItem('playerName', data.players.find(p => p.symbol === 'X').name);
        localStorage.setItem('roomId', roomIdInput.value.trim());
        localStorage.setItem('playerSymbol', 'X');
        localStorage.setItem('gameData', JSON.stringify(data));
        
        // Redirect to game page
        window.location.href = 'live.html';
    });

    // Handle room full or join errors
    socket.on('join_error', (data) => {
        errorMessageDiv.textContent = data.message;
        errorMessageDiv.style.color = 'red';
    });
});
