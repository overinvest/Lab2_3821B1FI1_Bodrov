const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.set("port", 3000)
app.use("/", express.static(__dirname))

app.get("/", function (request, response) {
    response.sendFile("index.html")
})

const { Client } = require('pg');
const client = new Client({
    user: 'postgres',
    host: '127.0.0.1',
    database: 'viruswar',
    password: 'over1337invest',
    port: 5432,
});
client.connect();

const addGameHistory = async (data, time, game_time, winner) => {
    const text = 'INSERT INTO game_history(data, time, game_time, winner) VALUES($1, $2, $3, $4)';
    const values = [data, time, game_time, winner];
  
    try {
      await client.query(text, values);
    } catch (err) {
      console.log(err.stack);
    }

};

let gameState = {
    players: [],
    currentPlayer: null,
    field: Array(10).fill().map(() => Array(10).fill(null)),
    movesLeft: 3,
    gameStartTime: null,
    new_game: false,
    gameOver: { state: false, winner: null },
};

io.on('connection', (socket) => {
    socket.on("new player", function () {
        if (gameState.players.length < 2) {
            gameState.players.push({
                id: socket.id,
                team: null,
                moves: 3
            });
        }

        socket.emit("state", gameState);
    })

    socket.emit('gameState', gameState);

    function newGameFunc() {
        gameState.currentPlayer = gameState.players[0];
        gameState.field = Array(10).fill().map(() => Array(10).fill(null));
        gameState.movesLeft = 3;
        gameState.gameStartTime = new Date();
        gameState.new_game = true;
        gameState.gameOver.state = false;
        io.emit('gameState', gameState);
    }

    const sendGameHistory = async () => {
        const res = await client.query('SELECT id, data, time, EXTRACT(EPOCH FROM game_time)/60 as game_time, winner FROM game_history');
    
        const resultArray = res.rows.map(row => {
          return {
            id: row.id,
            data: row.data,
            time: row.time,
            game_time: `${Math.floor(row.game_time / 60).toString().padStart(2, '0')}:${(row.game_time % 60).toString().padStart(2, '0')}`,
            winner: row.winner
          };
        });
      
        io.emit('gameHistory', resultArray);
    };
    
    socket.on('GetGameHistory', function () {
        sendGameHistory();
    })

    socket.on('newGame', () => {
        newGameFunc();
    })

    socket.on('playerAction', (action) => {
        if (gameState.new_game) {
            gameState.new_game = false;
        }
        const player = gameState.players.find(player => player.id === socket.id);
        if (!player || player !== gameState.currentPlayer || player.moves === 0) {
            return;
        }

        const position = action;
        const { x, y } = position;
        const PlayerTeam = player.team;

        // Занимаем пустую клетку
        if (gameState.field[x][y] === null && isCellAccessible(x, y, PlayerTeam)) {
            gameState.field[x][y] = PlayerTeam;
            player.moves--;
        }
        
        // Убиваем клетку противника
        if (gameState.field[x][y] !== null && gameState.field[x][y] !== PlayerTeam && !gameState.field[x][y].endsWith("!") && isCellAccessible(x, y, PlayerTeam)) {
            gameState.field[x][y] += "!";
            player.moves--;
        }


        if (player.moves === 0) {
            gameState.currentPlayer = gameState.players.find(p => p !== player);
            gameState.currentPlayer.moves = 3;
        }

        let oppositeTeam = PlayerTeam === 'Крестики' ? 'Нолики' : 'Крестики';

        gameState.gameOver.state = checkVictory(oppositeTeam) === false;
        gameState.gameOver.winner = PlayerTeam;
        if (gameState.gameOver.state) {
            const date = new Date();

            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');

            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');

            const formattedDate = `${year}-${month}-${day}`;
            const formattedTime = `${hours}:${minutes}:${seconds}`;

            const gameDurationInMilliseconds = date - gameState.gameStartTime;
            const gameDurationInMinutes = Math.floor(gameDurationInMilliseconds / 60000);
            const gameDurationInSeconds = ((gameDurationInMilliseconds % 60000) / 1000).toFixed(0);

            const gameTime = gameDurationInMinutes.toString().padStart(2, '0') + ':' + (gameDurationInSeconds < 10 ? '0' : '') + gameDurationInSeconds;

            addGameHistory(formattedDate, formattedTime, gameTime, PlayerTeam);

            io.emit('gameOver', PlayerTeam);
        }
    
        io.emit('gameState', gameState);
    });

    socket.on("selectTeam", (team) => {
        const player = gameState.players.find(player => player.id === socket.id);
        if (player) {
            player.team = team;
        }

        if (gameState.players.every(player => player.team !== null)) {
            const index = gameState.players.findIndex(player => player.team === "Крестики");

            gameState.currentPlayer = gameState.players[index];
            gameState.gameStartTime = new Date();
            io.emit('gameState', gameState);
        }
    });

    socket.on('disconnect', () => {
        console.log('Игрок отключился');

        const index = gameState.players.findIndex(player => player.id === socket.id);
        if (index !== -1) {
            gameState.players.splice(index, 1);
        }

        io.emit("state", gameState);
    });
});

server.listen(3000, () => {
    console.log('Сервер запущен на порту 3000');
});

function isCellAccessible(x, y, team) {

    if ( gameStarted(team, x, y) === false ) {
        return true;
    }

    // Проверяем, находится ли клетка в пределах игрового поля
    if (x < 0 || x >= gameState.field.length || y < 0 || y >= gameState.field[0].length) {
        return false;
    }

    // Проверяем, соприкасается ли клетка с живым символом команды игрока
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < gameState.field.length && ny >= 0 && ny < gameState.field[0].length && gameState.field[nx][ny] === team) {
                return true;
            }
        }
    }

    // Проверяем, соприкасается ли клетка с убитыми символами противоположной команды
    let oppositeTeam = team === 'Крестики' ? 'Нолики!' : 'Крестики!';
    let visited = Array(gameState.field.length).fill(false).map(() => Array(gameState.field[0].length).fill(false));
    let queue = [[x, y]];

    while (queue.length > 0) {
        let [cx, cy] = queue.shift();
        visited[cx][cy] = true;

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const nx = cx + dx;
                const ny = cy + dy;
                if (nx >= 0 && nx < gameState.field.length && ny >= 0 && ny < gameState.field[0].length && !visited[nx][ny]) {
                    if (gameState.field[nx][ny] === team) {
                        return true;
                    } else if (gameState.field[nx][ny] === oppositeTeam) {
                        queue.push([nx, ny]);
                    }
                }
            }
        }
    }

    return false;
}

function checkVictory(team) {
    // Проверяем, может ли какой-либо игрок сделать ход
    let canMove = false;
    for (let i = 0; i < gameState.field.length; i++) {
        for (let j = 0; j < gameState.field[i].length; j++) {
            if (gameState.field[i][j] === null && (isCellAccessible(i, j, team))) {
                canMove = true;
                break;
            }
        }
        if (canMove) {
            break;
        }
    }

    return canMove;
}

function gameStarted(team, x_, y_) {

    let { x, y } = team === "Крестики" ? { x: 9, y: 0 } : { x: 0, y: 9 }

    if (gameState.field[x_][y_] === null && (x === x_ && y === y_)) {
        return false;
    }

    return true;
}