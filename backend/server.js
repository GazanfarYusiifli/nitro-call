const express = require('express');
const http = require('http');
const socket = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// Health check route — required for Render.com free tier
app.get('/', (req, res) => res.json({ status: 'ok', service: 'Nitro Call Backend' }));

const server = http.createServer(app);
const io = socket(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const users = {}; // roomID -> Array of { id, username }
const curators = {}; // roomID -> socket.id of the creator (moderator)
const activeSharers = {}; // roomID -> socket.id of the person sharing screen
const socketToRoom = {}; // socket.id -> roomId
const lobbyUsers = {}; // socket.id -> username
const roomNames = {}; // roomID -> display name

io.on('connection', socket => {
    // --- ROOM LOBBY EVENTS ---
    socket.on("lobby-join", (username) => {
        lobbyUsers[socket.id] = username;
        console.log(`[Lobby] User ${username} (${socket.id}) entered lobby`);
        
        // Send current active rooms to the new user
        const activeRoomsData = Object.entries(curators).map(([roomID, adminId]) => ({
            roomID,
            roomName: roomNames[roomID] || roomID,
            adminName: lobbyUsers[adminId] || "Moderator",
            userCount: users[roomID] ? users[roomID].length : 0
        }));
        
        io.emit("lobby-update", {
            users: Object.entries(lobbyUsers).map(([id, name]) => ({ id, name })),
            rooms: activeRoomsData
        });
    });

    socket.on("request-join", ({ roomID, username }) => {
        const adminId = curators[roomID];
        if (adminId) {
            console.log(`[JoinReq] ${username} wants to join ${roomID} (Admin: ${adminId})`);
            io.to(adminId).emit("join-request", { roomID, guestName: username, guestId: socket.id });
        } else {
            // Room might not exist or admin left
            socket.emit("join-error", "Room does not exist or moderator is offline.");
        }
    });

    socket.on("accept-join", ({ guestId, roomID }) => {
        console.log(`[JoinAccept] Admin accepted ${guestId} for room ${roomID}`);
        io.to(guestId).emit("join-approved", { roomID, roomName: roomNames[roomID] || roomID });
    });

    socket.on("decline-join", ({ guestId }) => {
        console.log(`[JoinDecline] Admin declined ${guestId}`);
        io.to(guestId).emit("join-declined");
    });

    const broadcastRooms = () => {
        const activeRoomsData = Object.entries(curators).map(([roomID, adminId]) => ({
            roomID,
            roomName: roomNames[roomID] || roomID,
            adminName: lobbyUsers[adminId] || "Moderator",
            userCount: users[roomID] ? users[roomID].length : 0
        }));
        io.emit("rooms-update", activeRoomsData);
    };

    // --- ROOM EVENTS ---
    socket.on("join-room", (roomID, username, roomName) => {
        // Remove from lobby when joining a room
        delete lobbyUsers[socket.id];
        
        if (!users[roomID]) {
            users[roomID] = [];
            curators[roomID] = socket.id; // First user is the curator/moderator
            if (roomName) roomNames[roomID] = roomName;
        }

        // Room size limit
        if (users[roomID].length >= 10) {
            socket.emit("room-full");
            return;
        }

        // Check if user is already in the room
        const isAlreadyIn = users[roomID].find(u => u.id === socket.id);
        if (!isAlreadyIn) {
            users[roomID].push({ id: socket.id, username });
        }
        
        socketToRoom[socket.id] = roomID;
        socket.join(roomID);

        console.log(`User ${username} (${socket.id}) joined room ${roomID} (${roomNames[roomID]})`);
        
        // Let the user know if they are the moderator
        socket.emit("moderator-status", curators[roomID] === socket.id);

        const usersInThisRoom = users[roomID].filter(user => user.id !== socket.id);
        socket.emit("all-users", usersInThisRoom);
        
        // Notify about current screen share if any
        if (activeSharers[roomID]) {
            socket.emit("user-toggle-screen-share", { id: activeSharers[roomID], isSharing: true });
        }
        
        socket.broadcast.to(roomID).emit("user-joined", { id: socket.id, username });
        
        // Update everyone in the lobby that room list changed
        broadcastRooms();
        io.emit("lobby-update", {
            users: Object.entries(lobbyUsers).map(([id, name]) => ({ id, name })),
            rooms: Object.entries(curators).map(([rid, aid]) => ({
                roomID: rid,
                roomName: roomNames[rid] || rid,
                adminName: lobbyUsers[aid] || "Moderator",
                userCount: users[rid] ? users[rid].length : 0
            }))
        });
    });

    // Moderator Actions
    socket.on("kick-user", (userID) => {
        const roomID = socketToRoom[socket.id];
        if (curators[roomID] === socket.id) {
            console.log(`[Mod] Kicking user ${userID} from room ${roomID}`);
            io.to(userID).emit("kicked");
        }
    });

    socket.on("mute-user", (userID) => {
        const roomID = socketToRoom[socket.id];
        if (curators[roomID] === socket.id) {
            console.log(`[Mod] Muting user ${userID} in room ${roomID}`);
            io.to(userID).emit("muted-by-mod");
        }
    });

    socket.on("close-meeting", () => {
        const roomID = socketToRoom[socket.id];
        if (curators[roomID] === socket.id) {
            console.log(`[Mod] Closing meeting in room ${roomID}`);
            io.to(roomID).emit("meeting-closed");
            delete users[roomID];
            delete curators[roomID];
            broadcastRooms();
        }
    });

    socket.on("toggle-screen-share", (isSharing) => {
        const roomID = socketToRoom[socket.id];
        console.log(`[Screen] User ${socket.id} is sharing: ${isSharing} in room ${roomID}`);
        
        if (isSharing) {
            activeSharers[roomID] = socket.id;
        } else if (activeSharers[roomID] === socket.id) {
            delete activeSharers[roomID];
        }
        
        socket.broadcast.to(roomID).emit("user-toggle-screen-share", { id: socket.id, isSharing });
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

    const leaveRoom = () => {
        const roomID = socketToRoom[socket.id];
        if (roomID && users[roomID]) {
            console.log(`User ${socket.id} left room ${roomID}`);
            users[roomID] = users[roomID].filter(user => user.id !== socket.id);
            
            if (users[roomID].length === 0) {
                delete users[roomID];
                delete curators[roomID];
                delete activeSharers[roomID];
                delete roomNames[roomID];
            } else {
                // If moderator left, assign new one
                if (curators[roomID] === socket.id) {
                    curators[roomID] = users[roomID][0].id;
                    io.to(curators[roomID]).emit("moderator-status", true);
                }
                if (activeSharers[roomID] === socket.id) {
                    delete activeSharers[roomID];
                    socket.broadcast.to(roomID).emit("user-toggle-screen-share", { id: socket.id, isSharing: false });
                }
            }
            socket.broadcast.to(roomID).emit('user-left', socket.id);
            broadcastRooms();
        }
        delete socketToRoom[socket.id];
    };

    socket.on("leave-room", () => {
        leaveRoom();
    });

    socket.on('disconnect', () => {
        // Remove from lobby
        if (lobbyUsers[socket.id]) {
            console.log(`[Lobby] User ${lobbyUsers[socket.id]} left lobby`);
            delete lobbyUsers[socket.id];
            
            // Still broadcast update to others in lobby
            const activeRoomsData = Object.entries(curators).map(([roomID, adminId]) => ({
                roomID,
                roomName: roomNames[roomID] || roomID,
                adminName: lobbyUsers[adminId] || "Moderator",
                userCount: users[roomID] ? users[roomID].length : 0
            }));
            io.emit("lobby-update", {
                users: Object.entries(lobbyUsers).map(([id, name]) => ({ id, name })),
                rooms: activeRoomsData
            });
        }

        leaveRoom();
    });

    socket.on('send-message', (data) => {
        const roomID = socketToRoom[socket.id];
        console.log(`[Chat] Message from ${socket.id} in room ${roomID}`);
        io.to(roomID).emit('receive-message', data);
    });

    socket.on('toggle-hand-raise', (isRaised) => {
        const roomID = socketToRoom[socket.id];
        console.log(`[Hand] User ${socket.id} toggled hand to ${isRaised} in room ${roomID}`);
        io.to(roomID).emit('user-hand-raised', { id: socket.id, isRaised });
    });

    socket.on('emoji-reaction', (emoji) => {
        const roomID = socketToRoom[socket.id];
        console.log(`[Emoji] User ${socket.id} sent ${emoji} in room ${roomID}`);
        io.to(roomID).emit('receive-emoji', { id: socket.id, emoji });
    });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
