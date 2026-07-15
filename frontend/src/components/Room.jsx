import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import Peer from "simple-peer";
import Controls from "./Controls";
import Chat from "./Chat";

// Polyfill Buffer for simple-peer
import { Buffer } from 'buffer';
window.Buffer = window.Buffer || Buffer;

const Room = (props) => {
    const [peers, setPeers] = useState([]); // { peerID, username, stream, status }
    const [messages, setMessages] = useState([]);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const socketRef = useRef();
    const userVideo = useRef();
    const peersRef = useRef([]); // { peerID, peer }
    const streamRef = useRef();
    const roomID = props.roomID;

    useEffect(() => {
        // Use environment variable for production backend URL
        const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";
        socketRef.current = io(BACKEND_URL);
        
        navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
            userVideo.current.srcObject = stream;
            streamRef.current = stream;
            socketRef.current.emit("join-room", roomID, props.username);

            socketRef.current.on("all-users", users => {
                console.log("Connect to existing users:", users);
                users.forEach(user => {
                    const peer = createPeer(user.id, socketRef.current.id, stream, props.username);
                    peersRef.current.push({
                        peerID: user.id,
                        peer,
                    });
                    
                    setPeers(prev => [...prev.filter(p => p.peerID !== user.id), {
                        peerID: user.id,
                        username: user.username,
                        stream: null,
                        status: 'connecting'
                    }]);

                    peer.on("stream", remoteStream => {
                        console.log("Stream arrived from:", user.username);
                        setPeers(prev => prev.map(p => p.peerID === user.id ? { ...p, stream: remoteStream, status: 'connected' } : p));
                    });
                    
                    peer.on("connect", () => {
                        console.log("WebRTC Connected with:", user.username);
                        setPeers(prev => prev.map(p => p.peerID === user.id ? { ...p, status: 'connected' } : p));
                    });

                    peer.on("error", err => {
                        console.error("Peer error:", user.username, err);
                        setPeers(prev => prev.map(p => p.peerID === user.id ? { ...p, status: 'error' } : p));
                    });
                });
            });

            socketRef.current.on("user-joined-signal", payload => {
                console.log("Receiving signal from:", payload.username);
                const existing = peersRef.current.find(p => p.peerID === payload.callerID);
                
                if (existing) {
                    console.log("Adding additional signal to existing peer:", payload.username);
                    existing.peer.signal(payload.signal);
                    return;
                }

                const peer = addPeer(payload.signal, payload.callerID, stream);
                peersRef.current.push({
                    peerID: payload.callerID,
                    peer,
                });

                setPeers(prev => [...prev.filter(p => p.peerID !== payload.callerID), {
                    peerID: payload.callerID,
                    username: payload.username,
                    stream: null,
                    status: 'connecting'
                }]);

                peer.on("stream", remoteStream => {
                    setPeers(prev => prev.map(p => p.peerID === payload.callerID ? { ...p, stream: remoteStream, status: 'connected' } : p));
                });

                peer.on("connect", () => {
                    setPeers(prev => prev.map(p => p.peerID === payload.callerID ? { ...p, status: 'connected' } : p));
                });

                peer.on("error", (err) => {
                    console.error("Peer error (inbound):", err);
                    setPeers(prev => prev.map(p => p.peerID === payload.callerID ? { ...p, status: 'error' } : p));
                });
            });

            socketRef.current.on("receiving-returned-signal", payload => {
                console.log("Handshake returned from peer");
                const item = peersRef.current.find(p => p.peerID === payload.id);
                if (item) {
                    item.peer.signal(payload.signal);
                }
            });

            socketRef.current.on("user-left", id => {
                const peerObj = peersRef.current.find(p => p.peerID === id);
                if (peerObj) {
                    peerObj.peer.destroy();
                }
                peersRef.current = peersRef.current.filter(p => p.peerID !== id);
                setPeers(prev => prev.filter(p => p.peerID !== id));
            });

            socketRef.current.on("receive-message", message => {
                setMessages(prev => [...prev, message]);
            });

        }).catch(err => {
            console.error("Media devices failed:", err);
            alert("Camera and Microphone access are required for video calls.");
        });

        return () => {
            if (socketRef.current) socketRef.current.disconnect();
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            peersRef.current.forEach(p => p.peer.destroy());
        };
    }, [roomID, props.username]);

    function createPeer(userToSignal, callerID, stream, username) {
        // Return to trickle: true but ensure signals are relayed
        const peer = new Peer({
            initiator: true,
            trickle: true,
            stream,
            config: {
                iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
            }
        });

        peer.on("signal", signal => {
            socketRef.current.emit("sending-signal", { userToSignal, callerID, signal, username });
        });

        return peer;
    }

    function addPeer(incomingSignal, callerID, stream) {
        const peer = new Peer({
            initiator: false,
            trickle: true,
            stream,
            config: {
                iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
            }
        });

        peer.on("signal", signal => {
            socketRef.current.emit("returning-signal", { signal, callerID });
        });

        peer.signal(incomingSignal);

        return peer;
    }

    const shareScreen = () => {
        navigator.mediaDevices.getDisplayMedia({ cursor: true }).then(screenStream => {
            const screenTrack = screenStream.getTracks()[0];
            peersRef.current.forEach(({ peer }) => {
                if (peer.replaceTrack) {
                    peer.replaceTrack(
                        streamRef.current.getVideoTracks()[0],
                        screenTrack,
                        streamRef.current
                    );
                }
            });

            userVideo.current.srcObject = screenStream;

            screenTrack.onended = () => {
                peersRef.current.forEach(({ peer }) => {
                    if (peer.replaceTrack) {
                        peer.replaceTrack(
                            screenTrack,
                            streamRef.current.getVideoTracks()[0],
                            streamRef.current
                        );
                    }
                });
                userVideo.current.srcObject = streamRef.current;
            };
        });
    };

    const sendMessage = (text) => {
        const msg = {
            sender: props.username,
            text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        socketRef.current.emit("send-message", msg);
    };

    return (
        <div style={{ height: '100vh', width: '100vw', backgroundColor: '#0f172a', display: 'flex', overflow: 'hidden', position: 'relative' }}>
            <div className="participant-badge">
                <div className="pulse-dot"></div>
                {peers.length + 1} {peers.length + 1 === 1 ? 'Participant' : 'Participants'}
                <span className="mx-2 text-slate-500">|</span>
                <span className="text-slate-300">Room: {roomID}</span>
            </div>
            
            <div style={{ flex: 1, position: 'relative' }}>
                <div className="video-grid">
                    <div className="video-container">
                        <video muted ref={userVideo} autoPlay playsInline />
                        <div className="username-tag">{props.username} (You)</div>
                    </div>
                    {peers.map((peer) => (
                        <Video key={peer.peerID} stream={peer.stream} username={peer.username} status={peer.status} />
                    ))}
                </div>
                
                <Controls 
                    stream={streamRef.current} 
                    onLeave={props.onLeave}
                    onShareScreen={shareScreen}
                    onToggleChat={() => setIsChatOpen(!isChatOpen)}
                />
            </div>
            
            {isChatOpen && (
                <Chat 
                    messages={messages} 
                    onSendMessage={sendMessage} 
                    onClose={() => setIsChatOpen(false)} 
                />
            )}
        </div>
    );
};

const Video = (props) => {
    const ref = useRef();

    useEffect(() => {
        if (props.stream && ref.current) {
            ref.current.srcObject = props.stream;
        }
    }, [props.stream]);

    return (
        <div className="video-container">
            <video playsInline autoPlay ref={ref} />
            <div className="username-tag">{props.username}</div>
            {props.status !== 'connected' && (
                <div className="connection-status">
                    <span className={`status-dot status-${props.status || 'connecting'}`}></span>
                    {props.status === 'error' ? 'Connection Failed' : 'Connecting...'}
                </div>
            )}
        </div>
    );
};

export default Room;
