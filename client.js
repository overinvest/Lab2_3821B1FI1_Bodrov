const socket = io('http://localhost:3000');

let gameState = null;
let teamDisplay = null;
let gameOver = false;
let winner = null;

socket.emit("new player");

socket.on("state", function (data) {
    gameState = data;
    renderGame();
});

socket.on('connect', () => {
    console.log('Подключено к серверу');
});

socket.on('gameState', (newGameState) => {
    gameState = newGameState;
    if (gameState.new_game) {
        gameOver = false;
    }
    renderGame();
});

socket.on('gameOver', (winner_) => {
    gameOver = true;
    winner = winner_
});

const createHtmlTableFromData = (data) => {
    const gameHistoryDiv = document.createElement('div');
    gameHistoryDiv.classList.add('game-history');

    const table = document.createElement('table');
    gameHistoryDiv.appendChild(table);
  
    const headerRow = document.createElement('tr');
    ['ID', 'Date', 'Time', 'Game Time', 'Winner'].forEach(header => {
      const th = document.createElement('th');
      th.textContent = header;
      headerRow.appendChild(th);
    });
    table.appendChild(headerRow);
  
    data.forEach(rowData => {
      const row = document.createElement('tr');
      ['id', 'data', 'time', 'game_time', 'winner'].forEach(key => {
        const cell = document.createElement('td');
        cell.textContent = rowData[key];
        row.appendChild(cell);
      });
      table.appendChild(row);
    });
  
    document.body.insertBefore(gameHistoryDiv, document.body.firstChild);
};


socket.on('gameHistory', (result) => {
    createHtmlTableFromData(result);
});

function renderGame() {
    if (!gameState) {
        return;
    }

    document.body.innerHTML = '';

    if (gameState.players.length < 2 || gameState.players.some(player => player.team === null)) {
        renderTeams();
    } else {
        teamDisplay = document.createElement('div');
        teamDisplay.classList.add('team-display');
        document.body.insertBefore(teamDisplay, document.body.firstChild);

        renderField();

        const playerTeam = gameState.players.find(player => player.id === socket.id).team;
        teamDisplay.textContent = 'Ваша команда: ' + playerTeam;
    }
}

function renderTeams() {
    const teamXElement = document.createElement('button');
    teamXElement.textContent = 'Крестики';
    const teamOElement = document.createElement('button');
    teamOElement.textContent = 'Нолики';

    teamXElement.addEventListener('click', () => {
        selectTeam('Крестики');
    });
    teamOElement.addEventListener('click', () => {
        selectTeam('Нолики');
    });

    document.body.appendChild(teamXElement);
    document.body.appendChild(teamOElement);
}

function selectTeam(team) {
    socket.emit('selectTeam', team);
}

function startNewGame() {
    gameOver = false;
    socket.emit('newGame');

    const oldTable = document.querySelector('table');
    const oldGameOverMessage = document.querySelector('.game-over');
    if (oldTable) oldTable.remove();
    if (oldGameOverMessage) oldGameOverMessage.remove();

    renderField();
}

function renderField() {
    const table = document.createElement('table');

    for (let i = 0; i < 10; i++) {
        const row = document.createElement('tr');

        for (let j = 0; j < 10; j++) {
            const cell = document.createElement('td');

            if (gameState.field[i][j] === 'Крестики') {
                cell.textContent = 'X';
                cell.classList.add('cross');
            } else if (gameState.field[i][j] === 'Нолики') {
                cell.textContent = 'O';
                cell.classList.add('zero');
            } else if (gameState.field[i][j] === 'Крестики!') {
                cell.textContent = 'X';
                cell.classList.add('eaten-cross');
            } else if (gameState.field[i][j] === 'Нолики!') {
                cell.textContent = 'O';
                cell.classList.add('eaten-zero');
            }

            if (!gameOver) {
                cell.addEventListener('click', () => {
                    playerAction({ x: i, y: j });
                });

                cell.addEventListener('contextmenu', (event) => {
                    event.preventDefault();
                });

                row.appendChild(cell);
            }
        }

        table.appendChild(row);
    }

    document.body.appendChild(table);
    if (gameOver) {
        const playerTeam = gameState.players.find(player => player.id === socket.id).team;
        const gameOverMessage = document.createElement('div');
        gameOverMessage.classList.add('game-over');
        if (playerTeam === winner) {
            gameOverMessage.textContent = 'Игра закончилась, вы выиграли!';
            gameOverMessage.classList.add('win');
        } else {
            gameOverMessage.textContent = 'Игра закончилась, вы проиграли!';
            gameOverMessage.classList.add('lose');
        }
        document.body.appendChild(gameOverMessage);

        const newGameButton = document.createElement('button');
        newGameButton.textContent = 'Начать новую игру';
        newGameButton.addEventListener('click', startNewGame);
        document.body.appendChild(newGameButton);

        socket.emit('gameHistory', document);
    }
}


function playerAction(action) {
    socket.emit('playerAction', action);
}
