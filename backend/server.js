const express = require('express');
const http = require('http');
const socket = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socket(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const users = {}; // roomID -> Array of { id, username }
const socketToRoom = {}; // socket.id -> roomId

io.on('connection', socket => {
    socket.on("join-room", (roomID, username) => {
        if (!users[roomID]) {
            users[roomID] = [];
        }

        // Room size limit
        if (users[roomID].length >= 10) {
            socket.emit("room-full");
            return;
        }

        // Check if user is already in the room (prevent duplicates from StrictMode etc)
        const isAlreadyIn = users[roomID].find(u => u.id === socket.id);
        if (!isAlreadyIn) {
            users[roomID].push({ id: socket.id, username });
        }
        
        socketToRoom[socket.id] = roomID;
        socket.join(roomID);

        console.log(`User ${username} (${socket.id}) joined room ${roomID}`);
        console.log(`Users in ${roomID}:`, users[roomID].map(u => u.username));

        const usersInThisRoom = users[roomID].filter(user => user.id !== socket.id);
        socket.emit("all-users", usersInThisRoom);
        
        socket.broadcast.to(roomID).emit("user-joined", { id: socket.id, username });
    });

    socket.on("sending-signal", payload => {
        io.to(payload.userToSignal).emit('user-joined-signal', { 
            signal: payload.signal, 
            callerID: payload.callerID, 
            username: payload.username 
        });
    });

    socket.on("returning-signal", payload => {
        io.to(payload.callerID).emit('receiving-returned-signal', { 
            signal: payload.signal, 
            id: socket.id 
        });
    });

    socket.on('disconnect', () => {
        const roomID = socketToRoom[socket.id];
        if (users[roomID]) {
            users[roomID] = users[roomID].filter(user => user.id !== socket.id);
            if (users[roomID].length === 0) {
                delete users[roomID];
            }
            console.log(`User ${socket.id} left room ${roomID}`);
        }
        socket.broadcast.to(roomID).emit('user-left', socket.id);
        delete socketToRoom[socket.id];
    });

    socket.on('send-message', (data) => {
        const roomID = socketToRoom[socket.id];
        io.to(roomID).emit('receive-message', data);
    });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
