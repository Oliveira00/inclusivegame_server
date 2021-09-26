const uuid = require("uuidv4").uuid;
const express = require("express");
const app = express();
const server = require("http").createServer(app);
const cors = require("cors");
const questions = require("./questions");

const { Server } = require("socket.io");
const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(cors());

const rooms = [];

app.get("/:roomname", (req, res) => {
  const { roomname } = req.params;

  const roomFounded = rooms.find((r) => r.name == roomname);

  const response = {
    status: true,
    players: roomFounded.players,
    isStarted: roomFounded.isStarted,
    curQuestion: roomFounded.questions[roomFounded.curQuestion],
    maxQuestion: questions.length,
    // roomFounded.questions[roomFounded.curQuestion],
    owner: true
    // player.id == roomFounded.owner,
  };

  res.json(response);
});

function shuffle(array) {
  var currentIndex = array.length,
    randomIndex;

  // While there remain elements to shuffle...
  while (currentIndex != 0) {
    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }

  return array;
}

io.on("connection", (socket) => {
  console.log(`a user connected: ${socket.id}`);

  socket.on("create", ({ roomname, playername }) => {
    console.log("created:", roomname, playername);

    const roomFounded = rooms.find((r) => r.name == roomname);

    if (roomFounded || playername=="") {
      socket.emit("created", { wasCreated: false, room: roomname });
    } else {
      const id = uuid();
      const player = {
        id: socket.id,
        name: playername,
        rightAnswers: 0,
        isReady: false,
      };

      const createdRoom = {
        name: roomname,
        players: [player],
        owner: socket.id,
        isStarted: false,
        time: 30,
        curTime: 30,
        questions: questions,
        curQuestion: 0,
      };

      rooms.push(createdRoom);

      socket.emit("created", { wasCreated: true, room: roomname});
      socket.join(roomname);
    }
  });

  socket.on("join", ({ roomname, playername }) => {
    const roomIndex = rooms.findIndex((r) => r.name == roomname);

    if (roomIndex != -1) {
      if (playername.trim() != "" && playername.trim() != "lixo") {
        const id = uuid();
        const outro = rooms[roomIndex].players.find(
          (p) => p.name == playername
        );
        const player = {
          id: socket.id,
          name: playername,
          rightAnswers: 0,
          isReady: false,
        };

        if (!outro) {
          if (!rooms[roomIndex].isStarted) {
            rooms[roomIndex].players.push(player);

            socket.join(roomname);
            socket.emit("joined", { status: "Entrou", room: roomname });
            socket.to(roomname).emit("newplayer", player);
          } else {
            socket.emit("joined", {
              status: "A partida já começou!",
              room: roomname,
            });
          }
        }
      } else {
        socket.emit("joined", {
          status: "Esse nome não é permitido!",
          room: roomname,
        });
      }
    } else {
      socket.emit("joined", { status: "A sala não existe!", room: roomname });
    }
  });

  socket.on("response", ({ response, roomname }) => {
    const roomIndex = rooms.findIndex((r) => r.name == roomname);
    if (roomIndex != -1) {
      if(response == rooms[roomIndex].questions[rooms[roomIndex].curQuestion].Correct) {
        const playerIndex = rooms[roomIndex].players.findIndex(player => player.id == socket.id);

        if(rooms[roomIndex].players[playerIndex] != -1) {
          rooms[roomIndex].players[playerIndex].rightAnswers++
          console.log(rooms[roomIndex].players[playerIndex].name + ": " + rooms[roomIndex].players[playerIndex].rightAnswers)

          socket.emit("right");
          return;
        }
      }
    }
    socket.emit("wrong");
  });

  socket.on("start", ({ roomname, time, questions_num }) => {
    const roomIndex = rooms.findIndex((r) => r.name == roomname);

    if (roomIndex != -1 && rooms[roomIndex].owner == socket.id) {
      rooms[roomIndex].isStarted = true;
      rooms[roomIndex].time      = time;
      rooms[roomIndex].curTime   = time;
      rooms[roomIndex].questions = shuffle(questions.slice()).slice(0, questions_num);
  
      socket.to(roomname).emit("started");
      socket.emit("started");

      socket.to(roomname).emit("initialTimer", rooms[roomIndex].time);
      socket.emit("initialTimer", rooms[roomIndex].time);

      socket.to(roomname).emit("question", rooms[roomIndex].questions[rooms[roomIndex].curQuestion]);
      socket.emit("question", rooms[roomIndex].questions[rooms[roomIndex].curQuestion]);

      const intervalId = setInterval(() => {
        if(rooms[roomIndex]) {
          if(rooms[roomIndex].curTime < -5) {
            rooms[roomIndex].curTime = rooms[roomIndex].time;
            rooms[roomIndex].curQuestion++;

            if(rooms[roomIndex].curQuestion == rooms[roomIndex].questions.length) {
              socket.to(roomname).emit("finish", rooms[roomIndex].players.sort((a, b) => {
                if(a.rightAnswers > b.rightAnswers) return -1;
                if(a.rightAnswers < b.rightAnswers) return 1;
                return 0;
              }));
              socket.emit("finish", rooms[roomIndex].players.sort((a, b) => {
                if(a.rightAnswers > b.rightAnswers) return -1;
                if(a.rightAnswers < b.rightAnswers) return 1;
                return 0;
              }));
              rooms.splice(roomIndex, 1);
              clearInterval(intervalId);
              return;
            } else {
              socket.to(roomname).emit("question", rooms[roomIndex].questions[rooms[roomIndex].curQuestion]);
              socket.emit("question", rooms[roomIndex].questions[rooms[roomIndex].curQuestion]);
            }
          }
          
          if(rooms[roomIndex].curTime >= 0) {
            socket.to(roomname).emit("timer", rooms[roomIndex].curTime);
            socket.emit("timer", rooms[roomIndex].curTime);
          }

          rooms[roomIndex].curTime--;
        }
      }, 1000); 
    }
  });

  socket.on("am i owner", (roomname) => {
      const roomIndex = rooms.findIndex((r) => r.name == roomname);

      if(roomIndex != -1) {
        if(rooms[roomIndex].owner == socket.id) {
          socket.emit("you are owner");
        }
      }
  });

  socket.on("disconnect", () => {
    const roomIndex = rooms.findIndex((r) => r.owner == socket.id);

    if(roomIndex != -1){
      rooms.splice(roomIndex, 1);
      console.log("room closed");
    }
    console.log("user disconnected");
  });
});

server.listen(8080);
