require('dotenv').config();
const express = require('express');
const http = require('http');
const socket = require('socket.io');
const cors = require('cors');
const { OpenAI } = require('openai');

const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(cors());
app.use(express.json());

// --- TRANSLATION ROUTE ---
app.post('/translate', async (req, res) => {
    try {
        const { q, source, target } = req.body;
        if (!q) return res.status(400).json({ error: "Missing text (q)" });

        const prompt = `Translate the following text into the language code '${target || 'en'}'. Return ONLY the exact translated text without any conversational fillers, quotes, or explanations.\n\nText: ${q}`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are a professional, highly accurate translator." },
                { role: "user", content: prompt }
            ],
            temperature: 0.3,
            max_tokens: 500,
        });

        res.json({ translatedText: completion.choices[0].message.content.trim() });
    } catch (err) {
        console.error("Backend translation error:", err);
        res.status(500).json({ error: "Translation failed", detail: err.message });
    }
});

// --- TURN CREDENTIALS ROUTE ---
app.get('/turn-credentials', async (req, res) => {
    try {
        const appName = process.env.METERED_APP_NAME || "nitrocalls";
        const secretKey = process.env.METERED_SECRET_KEY;
        
        if (!secretKey) throw new Error("METERED_SECRET_KEY not set");

        const response = await fetch(`https://${appName}.metered.live/api/v1/turn/credential?secretKey=${secretKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ expiryInSeconds: 86400 })
        });
        
        if (!response.ok) throw new Error("Failed to fetch from Metered");
        const data = await response.json();

        res.json({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" },
                {
                    urls: `turn:${appName}.metered.live:80`,
                    username: data.username,
                    credential: data.password
                },
                {
                    urls: `turn:${appName}.metered.live:443`,
                    username: data.username,
                    credential: data.password
                },
                {
                    urls: `turn:${appName}.metered.live:443?transport=tcp`,
                    username: data.username,
                    credential: data.password
                }
            ]
        });
    } catch (err) {
        console.error("TURN error:", err);
        // Fallback to the dedicated VPS TURN server if Metered fails
        res.json({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" },
                {
                    urls: "turn:72.62.150.221:3478",
                    username: "nitro",
                    credential: "nitro321"
                }
            ]
        });
    }
});

// --- METERED TOKEN / ROOM ROUTE ---
app.post('/metered-token', async (req, res) => {
    try {
        const appName = process.env.METERED_APP_NAME || "nitrocalls";
        const secretKey = process.env.METERED_SECRET_KEY;
        const apiPath = "api/v1/token"; // You can change this to 'api/v1/room' if needed
        
        if (!secretKey) throw new Error("METERED_SECRET_KEY not set");

        const response = await fetch(`https://${appName}.metered.live/${apiPath}?secretKey=${secretKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ globalToken: true, ...req.body })
        });
        
        if (!response.ok) throw new Error("Failed to fetch token from Metered");
        const data = await response.json();

        res.json(data);
    } catch (err) {
        console.error("Metered Token error:", err);
        res.status(500).json({ error: "Token generation failed", detail: err.message });
    }
});

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
const roomWhiteboards = {}; // roomID -> Array of drawing segments
const roomWhiteboardActive = {}; // roomID -> boolean
const roomWhiteboardOpener = {}; // roomID -> socket.id of who opened whiteboard
const scheduledMeetings = []; // Array of { id, title, startTime, roomID, creator }

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
        rooms: activeRoomsData,
        scheduled: scheduledMeetings.filter(m => m.isPublic)
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

        // --- SCHEDULE CHECK ---
        const scheduled = scheduledMeetings.find(m => m.roomID === roomID);
        if (scheduled && !users[roomID]) {
            // First person joining a scheduled room
            if (username !== scheduled.creator) {
                const startTime = new Date(scheduled.startTime);
                if (new Date() < startTime) {
                    return socket.emit("join-error", `Toplantı hələ başlamayıb. Başlama vaxtı: ${startTime.toLocaleTimeString()}`);
                }
            }
        }

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
        
        // Sync whiteboard state for joiner
        if (roomWhiteboardActive[roomID]) {
            socket.emit("whiteboard-state", true, roomWhiteboardOpener[roomID]);
            // Also send existing drawing history immediately
            if (roomWhiteboards[roomID] && roomWhiteboards[roomID].length > 0) {
                socket.emit("whiteboard-history", roomWhiteboards[roomID]);
            }
        }

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
                delete roomWhiteboards[roomID];
                delete roomWhiteboardActive[roomID];
                delete roomWhiteboardOpener[roomID];
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
            delete roomWhiteboards[roomID];
            delete roomWhiteboardActive[roomID];
            delete roomWhiteboardOpener[roomID];
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

// Whiteboard
    socket.on('draw', (data) => {
        const roomID = socketToRoom[socket.id];
        if (roomID) {
            // Store whiteboard data for late joiners (optional but robust)
            if (!roomWhiteboards[roomID]) roomWhiteboards[roomID] = [];
            roomWhiteboards[roomID].push(data);
            
            // Limit stored points to avoid memory bloat
            if (roomWhiteboards[roomID].length > 5000) roomWhiteboards[roomID].shift();

            socket.broadcast.to(roomID).emit('remote-draw', data);
        }
    });

    socket.on('clear-whiteboard', () => {
        const roomID = socketToRoom[socket.id];
        if (roomID) {
            console.log(`[Whiteboard] Clearing board for room: ${roomID}`);
            roomWhiteboards[roomID] = [];
            socket.broadcast.to(roomID).emit('clear-whiteboard');
        }
    });


    socket.on('toggle-whiteboard', (isOpen) => {
        const roomID = String(socketToRoom[socket.id]);
        if (roomID !== "undefined") {
            roomWhiteboardActive[roomID] = isOpen;
            if (isOpen) {
                roomWhiteboardOpener[roomID] = socket.id;
            } else {
                if (roomWhiteboardOpener[roomID] === socket.id || curators[roomID] === socket.id) {
                    delete roomWhiteboardOpener[roomID];
                    roomWhiteboards[roomID] = []; // Clear drawings when whiteboard closes
                } else {
                    return; // Only opener or mod can close
                }
            }
            io.to(roomID).emit('whiteboard-state', isOpen, roomWhiteboardOpener[roomID]);
        }
    });

    socket.on('request-whiteboard-data', () => {
        const roomID = socketToRoom[socket.id];
        if (roomID) {
            if (roomWhiteboards[roomID]) {
                socket.emit('whiteboard-history', roomWhiteboards[roomID]);
            }
            if (roomWhiteboardActive[roomID]) {
                socket.emit('whiteboard-state', true, roomWhiteboardOpener[roomID]);
            }
        }
    });

    // Schedule
    socket.on('schedule-meeting', (meeting) => {
        const newMeeting = { ...meeting, id: Date.now().toString() };
        scheduledMeetings.push(newMeeting);
        broadcastRoomUpdates();
    });

    socket.on('delete-meeting', (id) => {
        const index = scheduledMeetings.findIndex(m => m.id === id);
        if (index > -1) {
            scheduledMeetings.splice(index, 1);
            broadcastRoomUpdates();
        }
    });
});

// roomWhiteboards is already declared at top level

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
