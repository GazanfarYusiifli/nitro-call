require('dotenv').config();
const express = require('express');
const http = require('http');
const socket = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Health check route
app.get('/', (req, res) => res.json({ status: 'ok', service: 'Nitro Call Backend' }));

const server = http.createServer(app);
const io = socket(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// --- GLOBAL STATE ---
const users = {}; // roomID -> Array of { id, username, nativeLang }
const curators = {}; // roomID -> socket.id of the curator (moderator)
const roomNames = {}; // roomID -> display name
const roomAdmins = {}; // roomID -> username of the moderator
const socketToRoom = {}; // socket.id -> roomId
const lobbyUsers = {}; // socket.id -> username
const activeSharers = {}; // roomID -> socket.id of person sharing screen
const mutedByMod = new Set(); // socket.id -> is muted

// --- BROADCAST LOGIC ---
const broadcastRoomUpdates = () => {
    const activeRoomsData = Object.entries(curators).map(([roomID, adminId]) => ({
        roomID,
        roomName: roomNames[roomID] || roomID,
        adminName: roomAdmins[roomID] || (lobbyUsers[adminId] ? lobbyUsers[adminId] : "Moderator"),
        userCount: users[roomID] ? users[roomID].length : 0
    }));
    
    const lobbyUpdate = {
        users: Object.entries(lobbyUsers).map(([id, name]) => ({ id, name })),
        rooms: activeRoomsData
    };

    io.emit("lobby-update", lobbyUpdate);
    io.emit("rooms-update", activeRoomsData);
};

// --- SOCKET HANDLERS ---
io.on('connection', socket => {
    // Lobby
    socket.on("lobby-join", (username) => {
        lobbyUsers[socket.id] = username;
        console.log(`[Lobby] User ${username} (${socket.id}) entered`);
        broadcastRoomUpdates();
    });

    // Room Permissions
    socket.on("request-join", ({ roomID, username }) => {
        const adminId = curators[roomID];
        if (adminId) {
            io.to(adminId).emit("join-request", { roomID, guestName: username, guestId: socket.id });
        } else {
            socket.emit("join-error", "Room does not exist or moderator is offline.");
        }
    });

    socket.on("accept-join", ({ guestId, roomID }) => {
        io.to(guestId).emit("join-approved", { roomID, roomName: roomNames[roomID] || roomID });
    });

    socket.on("decline-join", ({ guestId }) => {
        io.to(guestId).emit("join-declined");
    });

    // Direct Calling
    socket.on("call-user", ({ targetUserId, callerName, roomID }) => {
        io.to(targetUserId).emit("incoming-call", { callerName, roomID, callerId: socket.id });
    });

    socket.on("call-accepted", ({ callerId, roomID }) => {
        io.to(callerId).emit("call-accepted", { roomID });
    });

    socket.on("call-declined", ({ callerId }) => {
        io.to(callerId).emit("call-declined");
    });

    // Room Core
    socket.on("join-room", (payload) => {
        let { roomID, username, roomName, nativeLang } = payload || {};
        if (!roomID && typeof payload === 'string') roomID = payload; 
        if (!nativeLang) nativeLang = 'az-AZ';
        if (!roomID) return;

        delete lobbyUsers[socket.id];
        socketToRoom[socket.id] = roomID;
        
        if (!users[roomID]) {
            users[roomID] = [];
            curators[roomID] = socket.id;
            if (roomName) roomNames[roomID] = roomName;
            roomAdmins[roomID] = username;
        }
        
        if (!users[roomID].find(u => u.id === socket.id)) {
            users[roomID].push({ id: socket.id, username, nativeLang });
        }
        
        socket.join(roomID);
        console.log(`[Room] ${username} joined ${roomID}`);

        const usersInThisRoom = users[roomID].filter(u => u.id !== socket.id);
        socket.emit("all-users", usersInThisRoom);
        socket.broadcast.to(roomID).emit("user-joined", { id: socket.id, username, nativeLang });
        
        if (activeSharers[roomID]) {
            socket.emit("user-toggle-screen-share", { id: activeSharers[roomID], isSharing: true });
        }

        socket.emit("moderator-status", curators[roomID] === socket.id);
        broadcastRoomUpdates();
    });

    // WebRTC Signaling
    socket.on("sending-signal", (payload) => {
        const { userToSignal, callerID, signal, username, nativeLang } = payload;
        io.to(userToSignal).emit("user-joined-signal", { signal, callerID, username, nativeLang });
    });

    socket.on("returning-signal", (payload) => {
        const { signal, callerID, nativeLang } = payload;
        io.to(callerID).emit("receiving-returned-signal", { signal, id: socket.id, nativeLang });
    });

    // Room Leave / Disconnect
    const leaveRoom = () => {
        const roomID = socketToRoom[socket.id];
        if (roomID && users[roomID]) {
            users[roomID] = users[roomID].filter(u => u.id !== socket.id);
            if (users[roomID].length === 0) {
                delete users[roomID];
                delete curators[roomID];
                delete roomNames[roomID];
                delete roomAdmins[roomID];
                delete activeSharers[roomID];
            } else if (curators[roomID] === socket.id) {
                curators[roomID] = users[roomID][0].id;
                roomAdmins[roomID] = users[roomID][0].username;
                io.to(curators[roomID]).emit("moderator-status", true);
            }
            socket.broadcast.to(roomID).emit("user-left", socket.id);
            if (activeSharers[roomID] === socket.id) {
                delete activeSharers[roomID];
                socket.broadcast.to(roomID).emit("user-toggle-screen-share", { id: socket.id, isSharing: false });
            }
        }
        delete socketToRoom[socket.id];
        broadcastRoomUpdates();
    };

    socket.on("leave-room", leaveRoom);
    socket.on("disconnect", () => {
        delete lobbyUsers[socket.id];
        leaveRoom();
    });

    // Features
    socket.on("toggle-screen-share", (isSharing) => {
        const roomID = socketToRoom[socket.id];
        if (!roomID) return;
        if (isSharing) activeSharers[roomID] = socket.id;
        else if (activeSharers[roomID] === socket.id) delete activeSharers[roomID];
        socket.broadcast.to(roomID).emit("user-toggle-screen-share", { id: socket.id, isSharing });
    });

    socket.on("camera-toggled", (isOff) => {
        const roomID = socketToRoom[socket.id];
        if (roomID) socket.broadcast.to(roomID).emit("user-camera-toggled", { id: socket.id, isOff });
    });

    socket.on("caption", (payload) => {
        const roomID = socketToRoom[socket.id];
        if (roomID) socket.broadcast.to(roomID).emit("caption", payload);
    });

    // Moderator
    socket.on("kick-user", (userID) => {
        const roomID = socketToRoom[socket.id];
        if (curators[roomID] === socket.id) io.to(userID).emit("kicked");
    });

    socket.on("mute-user", (userID) => {
        const roomID = socketToRoom[socket.id];
        if (curators[roomID] === socket.id) {
            if (mutedByMod.has(userID)) {
                mutedByMod.delete(userID);
                io.to(userID).emit("unmuted-by-mod");
            } else {
                mutedByMod.add(userID);
                io.to(userID).emit("muted-by-mod");
            }
        }
    });

    socket.on("self-unmute", () => {
        mutedByMod.delete(socket.id);
    });

    socket.on("close-meeting", () => {
        const roomID = socketToRoom[socket.id];
        if (curators[roomID] === socket.id) {
            io.to(roomID).emit("meeting-closed");
            delete users[roomID];
            delete curators[roomID];
            delete roomNames[roomID];
            delete roomAdmins[roomID];
            broadcastRoomUpdates();
        }
    });

    // Communication
    socket.on('send-message', (data) => {
        const roomID = socketToRoom[socket.id];
        if (roomID) io.to(roomID).emit('receive-message', data);
    });

    socket.on('toggle-hand-raise', (isRaised) => {
        const roomID = socketToRoom[socket.id];
        if (roomID) io.to(roomID).emit('user-hand-raised', { id: socket.id, isRaised });
    });

    socket.on('emoji-reaction', (emoji) => {
        const roomID = socketToRoom[socket.id];
        if (roomID) io.to(roomID).emit('receive-emoji', { id: socket.id, emoji });
    });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
