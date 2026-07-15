import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import Peer from "simple-peer";
import { motion, AnimatePresence } from "framer-motion";
import { Hand } from "lucide-react";
import Controls from "./Controls";
import Chat from "./Chat";
import ParticipantList from "./ParticipantList";
import EmojiPanel from "./EmojiPanel";

import { Buffer } from 'buffer';

const playSound = (type) => {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'message') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.1, now + 0.05);
        gain.gain.linearRampToValueAtTime(0, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
    } else if (type === 'join') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.2);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.1, now + 0.1);
        gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    } else if (type === 'hand') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.1);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.05, now + 0.05);
        gain.gain.linearRampToValueAtTime(0, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
    } else if (type === 'leave') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(220, now + 0.2);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.1, now + 0.05);
        gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    }
};

const Room = (props) => {
    const [peers, setPeers] = useState([]); // { peerID, username, stream, status, isResedHand }
    const [messages, setMessages] = useState([]);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
    const [isHandRaised, setIsHandRaised] = useState(false);
    const [showEmojiPanel, setShowEmojiPanel] = useState(false);
    const [floatingEmojis, setFloatingEmojis] = useState([]); // { id, emoji, senderID }
    const [isModerator, setIsModerator] = useState(false);
    const [pinnedId, setPinnedId] = useState(null);
    const [sharingId, setSharingId] = useState(null);
    const socketRef = useRef();
    const userVideo = useRef();
    const peersRef = useRef([]); // { peerID, peer }
    const streamRef = useRef();
    const pendingUsersRef = useRef([]);
    const roomID = props.roomID;

    useEffect(() => {
        let isCancelled = false;
        socketRef.current = props.socket;
        
        // --- SOCKET LISTENERS ---
        const handlers = {
            "all-users": users => {
                console.log("Existing users in room:", users);
                setPeers(users.map(user => ({
                    peerID: user.id,
                    username: user.username,
                    stream: null,
                    status: 'connecting',
                    isHandRaised: false
                })));
                if (streamRef.current) {
                    users.forEach(user => initiatePeerConnection(user.id, user.username, streamRef.current));
                } else {
                    pendingUsersRef.current = users;
                }
            },
            "user-joined": ({ id, username }) => {
                console.log("New user joined room:", username);
                playSound('join');
                setPeers(prev => [...prev.filter(p => p.peerID !== id), {
                    peerID: id, username, stream: null, status: 'connecting', isHandRaised: false
                }]);
            },
            "user-joined-signal": payload => {
                if (!streamRef.current) return;
                const existing = peersRef.current.find(p => p.peerID === payload.callerID);
                if (existing) {
                    existing.peer.signal(payload.signal);
                    return;
                }
                const peer = addPeer(payload.signal, payload.callerID, streamRef.current);
                peersRef.current.push({ peerID: payload.callerID, peer });
                peer.on("stream", rs => {
                    if (isCancelled) return;
                    setPeers(prev => prev.map(p => p.peerID === payload.callerID ? { ...p, stream: rs, status: 'connected' } : p));
                });
                peer.on("connect", () => {
                    if (isCancelled) return;
                    setPeers(prev => prev.map(p => p.peerID === payload.callerID ? { ...p, status: 'connected' } : p));
                });
            },
            "receiving-returned-signal": payload => {
                const item = peersRef.current.find(p => p.peerID === payload.id);
                if (item) item.peer.signal(payload.signal);
            },
            "user-left": id => {
                playSound('leave');
                const pObj = peersRef.current.find(p => p.peerID === id);
                if (pObj) pObj.peer.destroy();
                peersRef.current = peersRef.current.filter(p => p.peerID !== id);
                setPeers(prev => prev.filter(p => p.peerID !== id));
            },
            "receive-message": m => { playSound('message'); setMessages(prev => [...prev, m]); },
            "user-hand-raised": ({ id, isRaised }) => {
                if (isRaised) playSound('hand');
                setPeers(prev => prev.map(p => p.peerID === id ? { ...p, isHandRaised: isRaised } : p));
            },
            "receive-emoji": ({ id, emoji }) => {
                const newEmoji = { id: Math.random(), emoji, senderID: id };
                setFloatingEmojis(prev => [...prev, newEmoji]);
                setTimeout(() => {
                    if (!isCancelled) setFloatingEmojis(prev => prev.filter(e => e.id !== newEmoji.id));
                }, 3000);
            },
            "user-toggle-screen-share": ({ id, isSharing }) => {
                if (!isCancelled) setSharingId(isSharing ? id : null);
            },
            "moderator-status": s => {
                if (!isCancelled) setIsModerator(s);
            },
            "kicked": () => { 
                alert("You have been kicked."); 
                props.onLeave(); 
            },
            "muted-by-mod": () => {
                alert("Moderator muted you.");
                if (streamRef.current) {
                    const track = streamRef.current.getAudioTracks()[0];
                    if (track) track.enabled = false;
                }
            },
            "meeting-closed": () => { 
                alert("Meeting closed."); 
                props.onLeave(); 
            }
        };

        Object.entries(handlers).forEach(([evt, func]) => socketRef.current.on(evt, func));

        // --- MEDIA STREAM SETUP ---
        const startMedia = () => {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                navigator.mediaDevices.getUserMedia({ video: true, audio: true })
                    .then(stream => {
                        if (isCancelled) {
                            stream.getTracks().forEach(t => t.stop());
                            return;
                        }
                        if (userVideo.current) userVideo.current.srcObject = stream;
                        streamRef.current = stream;
                        socketRef.current.emit("join-room", roomID, props.username, props.roomName);
                        if (pendingUsersRef.current.length > 0) {
                            pendingUsersRef.current.forEach(u => initiatePeerConnection(u.id, u.username, stream));
                            pendingUsersRef.current = [];
                        }
                    })
                    .catch(err => {
                        console.error("Media failed:", err);
                        if (!isCancelled) socketRef.current.emit("join-room", roomID, props.username, props.roomName);
                    });
            }
        };

        // Delay media startup slightly to ensure previous session fully releases hardware
        const mediaTimeout = setTimeout(startMedia, 300);

        return () => {
            isCancelled = true;
            clearTimeout(mediaTimeout);
            if (socketRef.current) {
                socketRef.current.emit("leave-room");
                Object.keys(handlers).forEach(evt => socketRef.current.off(evt));
            }
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }
            if (userVideo.current) {
                userVideo.current.srcObject = null;
            }
            peersRef.current.forEach(p => p.peer.destroy());
            peersRef.current = [];
        };
    }, [roomID, props.username]);

    // Handle local video re-attachment when layout changes (remounts)
    useEffect(() => {
        if (userVideo.current && streamRef.current) {
            userVideo.current.srcObject = streamRef.current;
        }
        return () => {
            if (userVideo.current) userVideo.current.srcObject = null;
        };
    }, [pinnedId, sharingId]);

    const initiatePeerConnection = (userID, username, stream) => {
        const peer = createPeer(userID, socketRef.current?.id, stream, props.username);
        peersRef.current.push({ peerID: userID, peer });
        
        peer.on("stream", remoteStream => {
            setPeers(prev => prev.map(p => p.peerID === userID ? { ...p, stream: remoteStream, status: 'connected' } : p));
        });
        peer.on("connect", () => {
            setPeers(prev => prev.map(p => p.peerID === userID ? { ...p, status: 'connected' } : p));
        });
    };

    function createPeer(userToSignal, callerID, stream, username) {
        const peer = new Peer({
            initiator: true,
            trickle: false,
            stream,
            config: {
                iceServers: [
                    { urls: "stun:stun.l.google.com:19302" },
                    { urls: "stun:global.stun.twilio.com:3478" },
                    {
                        urls: "turn:openrelay.metered.ca:80",
                        username: "openrelayproject",
                        credential: "openrelayproject"
                    },
                    {
                        urls: "turn:openrelay.metered.ca:443",
                        username: "openrelayproject",
                        credential: "openrelayproject"
                    },
                    {
                        urls: "turn:openrelay.metered.ca:443?transport=tcp",
                        username: "openrelayproject",
                        credential: "openrelayproject"
                    }
                ]
            }
        });

        peer.on("signal", signal => {
            socketRef.current.emit("sending-signal", { userToSignal, callerID, signal, username });
        });

        peer.on("error", err => {
            console.error(`Peer error with ${username}:`, err);
        });

        return peer;
    }

    function addPeer(incomingSignal, callerID, stream) {
        const peer = new Peer({
            initiator: false,
            trickle: false,
            stream,
            config: {
                iceServers: [
                    { urls: "stun:stun.l.google.com:19302" },
                    { urls: "stun:global.stun.twilio.com:3478" },
                    {
                        urls: "turn:openrelay.metered.ca:80",
                        username: "openrelayproject",
                        credential: "openrelayproject"
                    },
                    {
                        urls: "turn:openrelay.metered.ca:443",
                        username: "openrelayproject",
                        credential: "openrelayproject"
                    },
                    {
                        urls: "turn:openrelay.metered.ca:443?transport=tcp",
                        username: "openrelayproject",
                        credential: "openrelayproject"
                    }
                ]
            }
        });

        peer.on("signal", signal => {
            socketRef.current.emit("returning-signal", { signal, callerID });
        });

        peer.on("error", err => {
            console.error(`Peer error with caller ${callerID}:`, err);
        });

        peer.signal(incomingSignal);

        return peer;
    }

    const shareScreen = () => {
        if (!navigator.mediaDevices.getDisplayMedia) {
            alert("Screen sharing is not supported in this browser or context.");
            return;
        }

        navigator.mediaDevices.getDisplayMedia({ cursor: true }).then(screenStream => {
            const screenTrack = screenStream.getTracks()[0];
            const originalVideoTrack = streamRef.current.getVideoTracks()[0];

            socketRef.current.emit("toggle-screen-share", true);
            setSharingId(socketRef.current?.id);

            peersRef.current.forEach(({ peer }) => {
                if (peer && !peer.destroyed) {
                    peer.replaceTrack(originalVideoTrack, screenTrack, streamRef.current);
                }
            });

            userVideo.current.srcObject = screenStream;

            screenTrack.onended = () => {
                socketRef.current.emit("toggle-screen-share", false);
                setSharingId(null);
                
                peersRef.current.forEach(({ peer }) => {
                    if (peer && !peer.destroyed) {
                        peer.replaceTrack(screenTrack, originalVideoTrack, streamRef.current);
                    }
                });
                userVideo.current.srcObject = streamRef.current;
            };
        }).catch(err => {
            console.error("Screen share failed:", err);
        });
    };

    const togglePin = (id) => {
        setPinnedId(prev => (prev === id ? null : id));
    };

    const focusedId = sharingId || pinnedId;
    const isFocusMode = !!focusedId;

    const sendMessage = (text) => {
        const msg = {
            sender: props.username,
            text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        socketRef.current.emit("send-message", msg);
    };

    const toggleHandRaise = () => {
        const newState = !isHandRaised;
        setIsHandRaised(newState);
        socketRef.current.emit('toggle-hand-raise', newState);
    };

    const sendEmoji = (emoji) => {
        socketRef.current.emit('emoji-reaction', emoji);
        const newEmoji = { id: Date.now(), emoji, senderID: socketRef.current?.id };
        setFloatingEmojis(prev => [...prev, newEmoji]);
        setTimeout(() => {
            setFloatingEmojis(prev => prev.filter(e => e.id !== newEmoji.id));
        }, 3000);
    };

    const copyInviteLink = () => {
        const url = `${window.location.origin}/?room=${roomID}`;
        navigator.clipboard.writeText(url)
            .then(() => alert("Invite link copied to clipboard!"))
            .catch(err => console.error("Could not copy text: ", err));
    };

    return (
        <div style={{ height: '100vh', width: '100vw', backgroundColor: '#0f172a', display: 'flex', overflow: 'hidden', position: 'relative' }}>
            <AnimatePresence>
                {floatingEmojis.map(e => (
                    <motion.div
                        key={e.id}
                        initial={{ y: 0, x: -20, opacity: 0, scale: 0.5 }}
                        animate={{ y: -400, x: Math.random() * 100 - 50, opacity: 1, scale: 1.5 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 2.5, ease: "easeOut" }}
                        className="floating-emoji"
                        style={{ 
                            left: e.senderID === socketRef.current?.id ? '20%' : '70%',
                            zIndex: 9999
                        }}
                    >
                        {e.emoji}
                    </motion.div>
                ))}
            </AnimatePresence>

            <div className="participant-badge">
                <div className="pulse-dot"></div>
                {peers.length + 1} {peers.length + 1 === 1 ? 'Participant' : 'Participants'}
                <span className="mx-2 text-slate-500">|</span>
                <span className="text-slate-300">Room: {roomID}</span>
            </div>
            
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                <div className={`video-grid ${isFocusMode ? 'focus-mode' : ''}`} data-total={peers.length + 1}>
                    {isFocusMode && (
                        <div className="focused-video-area">
                            {focusedId === socketRef.current?.id ? (
                                <div className="video-container focused local" onClick={() => togglePin(socketRef.current?.id)}>
                                    <video muted ref={userVideo} autoPlay playsInline className={sharingId === socketRef.current?.id ? "" : "local-video"} />
                                    <div className="username-tag">{props.username} (You) {sharingId === socketRef.current?.id && " - Sharing"}</div>
                                </div>
                            ) : (
                                peers.filter(p => p.peerID === focusedId).map(p => (
                                    <Video 
                                        key={p.peerID} 
                                        stream={p.stream} 
                                        username={p.username} 
                                        status={p.status} 
                                        isHandRaised={p.isHandRaised} 
                                        isFocused={true}
                                        isSharing={sharingId === p.peerID}
                                        onClick={() => togglePin(p.peerID)}
                                    />
                                ))
                            )}
                        </div>
                    )}

                    <div className={isFocusMode ? "participants-bottom-row" : "grid-container-inner"}>
                        {focusedId !== socketRef.current?.id && (
                            <div className="video-container" onClick={() => togglePin(socketRef.current?.id)}>
                                <video muted ref={userVideo} autoPlay playsInline className={sharingId === socketRef.current?.id ? "" : "local-video"} />
                                <div className="username-tag">{props.username} (You)</div>
                                <div className="pin-hint">Pin Me</div>
                                {isHandRaised && (
                                    <div className="hand-raise-badge">
                                        <Hand size={14} fill="currentColor" /> Raised
                                    </div>
                                )}
                            </div>
                        )}
                        {peers.filter(p => p.peerID !== focusedId).map((peer) => (
                            <Video 
                                key={peer.peerID} 
                                stream={peer.stream} 
                                username={peer.username} 
                                status={peer.status} 
                                isHandRaised={peer.isHandRaised} 
                                total={peers.length + 1} 
                                onClick={() => togglePin(peer.peerID)}
                            />
                        ))}
                    </div>
                </div>
                
                <Controls 
                    stream={streamRef.current} 
                    onLeave={props.onLeave}
                    onShareScreen={shareScreen}
                    onToggleChat={() => setIsChatOpen(!isChatOpen)}
                    onToggleParticipants={() => setIsParticipantsOpen(!isParticipantsOpen)}
                    onRaiseHand={toggleHandRaise}
                    onShowEmojis={() => setShowEmojiPanel(!showEmojiPanel)}
                    onInvite={copyInviteLink}
                    isHandRaised={isHandRaised}
                    isModerator={isModerator}
                    onCloseMeeting={() => socketRef.current.emit("close-meeting")}
                />
                
                <AnimatePresence>
                    {showEmojiPanel && (
                        <EmojiPanel 
                            onSelect={sendEmoji} 
                            onClose={() => setShowEmojiPanel(false)} 
                        />
                    )}
                </AnimatePresence>
            </div>
            
            <AnimatePresence>
                {isChatOpen && (
                    <Chat 
                        messages={messages} 
                        onSendMessage={sendMessage} 
                        onClose={() => setIsChatOpen(false)} 
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isParticipantsOpen && (
                    <ParticipantList 
                        participants={peers} 
                        currentUser={props.username}
                        onClose={() => setIsParticipantsOpen(false)} 
                        isModerator={isModerator}
                        onKick={(id) => socketRef.current.emit("kick-user", id)}
                        onMute={(id) => socketRef.current.emit("mute-user", id)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

const Video = (props) => {
    const ref = useRef();

    useEffect(() => {
        if (props.stream && ref.current) {
            if (ref.current.srcObject !== props.stream) {
                ref.current.srcObject = props.stream;
            }
            
            ref.current.onloadedmetadata = () => {
                const playPromise = ref.current.play();
                if (playPromise !== undefined) {
                    playPromise.catch(e => console.log("Play failed:", e));
                }
            };
        }
        return () => {
            if (ref.current) ref.current.srcObject = null;
        };
    }, [props.stream, props.isFocused, props.isSharing]);

    return (
        <div className={`video-container ${props.isFocused ? 'focused' : ''}`} data-total={props.total} onClick={props.onClick}>
            <video playsInline autoPlay ref={ref} />
            <div className="username-tag">{props.username} {props.isSharing && " - Sharing"}</div>
            {!props.isFocused && <div className="pin-hint">Click to Pin</div>}
            {props.isHandRaised && (
                <div className="hand-raise-badge">
                    <Hand size={14} fill="currentColor" /> Raised
                </div>
            )}
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
