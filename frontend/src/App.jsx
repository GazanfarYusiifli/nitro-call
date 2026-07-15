import React, { useState, useEffect, useRef } from 'react';
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
    const [incomingRequest, setIncomingRequest] = useState(null);
    const [waitingForApproval, setWaitingForApproval] = useState(false);
    const [socket, setSocket] = useState(null);

    useEffect(() => {
        const newSocket = io(BACKEND_URL);
        setSocket(newSocket);

        newSocket.on("lobby-update", ({ users, rooms }) => {
            setOnlineUsers(users);
            setOnlineRooms(rooms);
        });

        newSocket.on("rooms-update", (rooms) => {
            setOnlineRooms(rooms);
        });

        newSocket.on("join-request", ({ roomID, guestName, guestId }) => {
            setIncomingRequest({ roomID, guestName, guestId });
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
        });

        return () => {
            if (newSocket) newSocket.disconnect();
        };
    }, []);

    const handleCreate = (id, name, displayName) => {
        setRoomID(id);
        setRoomName(displayName || id);
        setUsername(name);
        localStorage.setItem('nitro_username', name);
    };

    const handleJoin = (id, name) => {
        setRoomID(id);
        setUsername(name);
        localStorage.setItem('nitro_username', name);
    };

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
