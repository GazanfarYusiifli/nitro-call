import React, { useState, useEffect, useRef, useCallback } from 'react';
import io from "socket.io-client";
import { Video, Shield, User } from 'lucide-react';
import Home from './components/Home';
import Room from './components/Room';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

function App() {
    const [roomID, setRoomID] = useState(null);
    const [roomName, setRoomName] = useState('');
    const [username, setUsername] = useState(localStorage.getItem('nitro_username') || '');
    const [onlineUsers, setOnlineUsers] = useState([]);
    const [onlineRooms, setOnlineRooms] = useState([]);
    const [scheduledMeetings, setScheduledMeetings] = useState([]);
    const [incomingRequest, setIncomingRequest] = useState(null);
    const [incomingCall, setIncomingCall] = useState(null);
    const [waitingForApproval, setWaitingForApproval] = useState(false);
    const [socket, setSocket] = useState(null);
    const ringingIntervalRef = useRef(null);

    const playSound = (type) => {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            const now = audioCtx.currentTime;

            if (type === 'ring') {
                // Rhythmic ping for incoming calls
                osc.type = 'sine';
                osc.frequency.setValueAtTime(660, now);
                osc.frequency.exponentialRampToValueAtTime(440, now + 0.5);
                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(0.1, now + 0.1);
                gain.gain.linearRampToValueAtTime(0, now + 0.5);
                osc.start(now);
                osc.stop(now + 0.5);
            }
        } catch (e) { console.warn("Audio error", e); }
    };

    useEffect(() => {
        if (incomingRequest || incomingCall) {
            playSound('ring');
            ringingIntervalRef.current = setInterval(() => playSound('ring'), 2000);
        } else {
            if (ringingIntervalRef.current) {
                clearInterval(ringingIntervalRef.current);
                ringingIntervalRef.current = null;
            }
        }
        return () => { if (ringingIntervalRef.current) clearInterval(ringingIntervalRef.current); };
    }, [incomingRequest, incomingCall]);

    useEffect(() => {
        const newSocket = io(BACKEND_URL);
        setSocket(newSocket);

        newSocket.on("lobby-update", ({ users, rooms, scheduled }) => {
            setOnlineUsers(users);
            setOnlineRooms(rooms);
            if (scheduled) setScheduledMeetings(scheduled);
        });

        newSocket.on("rooms-update", (rooms) => {
            setOnlineRooms(rooms);
        });

        newSocket.on("join-request", ({ roomID, guestName, guestId }) => {
            setIncomingRequest({ roomID, guestName, guestId });
        });

        newSocket.on("incoming-call", ({ callerName, roomID, callerId }) => {
            setIncomingCall({ callerName, roomID, callerId });
        });

        newSocket.on("join-approved", ({ roomID, roomName }) => {
            setRoomID(roomID);
            if (roomName) setRoomName(roomName);
            setWaitingForApproval(false);
        });

        newSocket.on("join-declined", () => {
            alert("Your request to join was declined by the moderator.");
            setWaitingForApproval(false);
        });

        newSocket.on("join-error", (error) => {
            alert(error);
            setWaitingForApproval(false);
            setRoomID(null);
            window.history.replaceState({}, '', window.location.pathname);
        });

        return () => {
            if (newSocket) newSocket.disconnect();
        };
    }, []);

    const handleCreate = useCallback((id, name, displayName) => {
        setRoomID(id);
        setRoomName(displayName || id);
        setUsername(name);
        localStorage.setItem('nitro_username', name);
    }, []);

    const handleJoin = useCallback((id, name) => {
        setRoomID(id);
        setUsername(name);
        localStorage.setItem('nitro_username', name);
    }, []);

    const handleLeave = () => {
        setRoomID(null);
        setRoomName('');
        window.history.replaceState({}, '', window.location.pathname);
        // Re-join lobby
        if (username && socket) {
            socket.emit("lobby-join", username);
        }
    };

    const acceptJoin = () => {
        socket.emit("accept-join", { 
            guestId: incomingRequest.guestId, 
            roomID: incomingRequest.roomID 
        });
        setIncomingRequest(null);
    };

    const declineJoin = () => {
        socket.emit("decline-join", { guestId: incomingRequest.guestId });
        setIncomingRequest(null);
    };

    const acceptCall = () => {
        socket.emit("call-accepted", { callerId: incomingCall.callerId, roomID: incomingCall.roomID });
        handleJoin(incomingCall.roomID, username || "Guest");
        setIncomingCall(null);
    };

    const declineCall = () => {
        socket.emit("call-declined", { callerId: incomingCall.callerId });
        setIncomingCall(null);
    };

    const requestToJoin = (room) => {
        if (!username) {
            alert("Please enter a username first");
            return;
        }
        setWaitingForApproval(true);
        socket.emit("request-join", { roomID: room.roomID, username });
    };

    return (
        <div className="app-container">
            {roomID ? (
                <Room 
                    roomID={roomID} 
                    roomName={roomName}
                    username={username} 
                    socket={socket} 
                    onLeave={handleLeave} 
                />
            ) : (
                <Home 
                    socket={socket} 
                    onlineUsers={onlineUsers}
                    onlineRooms={onlineRooms} 
                    scheduledMeetings={scheduledMeetings}
                    username={username}
                    setUsername={setUsername}
                    onJoin={handleJoin} 
                    onCreate={handleCreate}
                    onRequestJoin={requestToJoin}
                />
            )}
            
            {incomingRequest && (
                <div className="call-modal">
                    <div className="glass-card call-card incoming">
                        <div className="pulse-circle">
                            <User size={32} />
                        </div>
                        <h3>Join Request</h3>
                        <p><strong>{incomingRequest.guestName}</strong> wants to join your room.</p>
                        <div className="call-actions">
                            <button onClick={acceptJoin} className="accept-btn">Accept</button>
                            <button onClick={declineJoin} className="decline-btn">Decline</button>
                        </div>
                    </div>
                </div>
            )}

            {incomingCall && (
                <div className="call-modal">
                    <div className="glass-card call-card incoming">
                        <div className="pulse-circle">
                            <Video size={32} />
                        </div>
                        <h3>Incoming Call</h3>
                        <p><strong>{incomingCall.callerName}</strong> is calling you...</p>
                        <div className="call-actions">
                            <button onClick={acceptCall} className="accept-btn">Answer</button>
                            <button onClick={declineCall} className="decline-btn" style={{ background: '#ef4444' }}>Decline</button>
                        </div>
                    </div>
                </div>
            )}

            {waitingForApproval && (
                <div className="call-modal">
                    <div className="glass-card call-card outgoing">
                        <div className="pulse-circle calling">
                            <Shield size={32} />
                        </div>
                        <h3>Waiting...</h3>
                        <p>Waiting for the moderator to approve your request</p>
                        <div className="call-actions">
                            <button onClick={() => setWaitingForApproval(false)} className="decline-btn">Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
