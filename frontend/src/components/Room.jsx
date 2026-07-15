import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import io from "socket.io-client";
import Peer from "simple-peer";
import { motion, AnimatePresence } from "framer-motion";
import { Hand, Mic, MicOff, Video as VideoIcon, VideoOff, Monitor, Edit3, XCircle } from "lucide-react";
import Controls from "./Controls";
import Chat from "./Chat";
import ParticipantList from "./ParticipantList";
import EmojiPanel from "./EmojiPanel";
import Whiteboard from "./Whiteboard";

import { Buffer } from 'buffer';
if (!window.Buffer) window.Buffer = Buffer;

const playSound = (type) => {
    try {
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
    } catch (e) {
        console.warn("Audio Context failed to start:", e);
    }
};

const RemoteVideo = (props) => {
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
    }, [props.stream]);

    // Handle dynamic volume changes for ducking
    useEffect(() => {
        if (ref.current) {
            ref.current.volume = props.volume !== undefined ? props.volume : 1;
        }
    }, [props.volume]);

    const username = props.username || "Participant";

    return (
        <div className={`video-container ${props.isFocused ? 'focused' : ''}`} data-total={props.total} onClick={props.onClick}>
            <video playsInline autoPlay ref={ref} />
            {props.isCameraOff && !props.isSharing && (
                <div className="user-avatar-overlay">
                    <div className="avatar-circle">
                        {username.charAt(0).toUpperCase()}
                    </div>
                </div>
            )}
            <div className="username-tag">{username} {props.isSharing && " - Sharing"}</div>
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
    const [isJoined, setIsJoined] = useState(false);
    const [micEnabled, setMicEnabled] = useState(true);
    const [videoEnabled, setVideoEnabled] = useState(true);
    const [localCameraOff, setLocalCameraOff] = useState(false);
    const [streamReady, setStreamReady] = useState(false);
    const [isFrontCamera, setIsFrontCamera] = useState(true);
    const [isMutedByMod, setIsMutedByMod] = useState(false);
    const [peerVolumes, setPeerVolumes] = useState({}); // { peerID: volume }
    const [isWhiteboardOpen, setIsWhiteboardOpen] = useState(false);
    const [isWhiteboardOpener, setIsWhiteboardOpener] = useState(false);
    const [whiteboardSharerId, setWhiteboardSharerId] = useState(null);
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
    const [showShareMenu, setShowShareMenu] = useState(false);
    const [isRecording, setIsRecording] = useState(false);

    const socketRef = useRef(null);
    const userVideo = useRef();
    const peersRef = useRef([]); // { peerID, peer, username, nativeLang }
    const streamRef = useRef();
    const recognitionRef = useRef(null);
    const pendingUsersRef = useRef([]);
    const pendingSignalsRef = useRef([]);
    const isJoinedRef = useRef(false);
    const whiteboardStreamRef = useRef(null); // canvas captureStream for whiteboard sharing
    const isWhiteboardOpenerRef = useRef(false); // ref mirror of isWhiteboardOpener for use in closures
    const cameraTrackRef = useRef(null); // persistent ref to the current camera track
    const activeScreenTrackRef = useRef(null); // ref to active screen share track
    const activeWhiteboardTrackRef = useRef(null); // ref to active whiteboard track
    const mediaRecorderRef = useRef(null);
    const recordedChunksRef = useRef([]);

    const iceServersRef = useRef([
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
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
    ]);

    useEffect(() => {
        const fetchIce = async () => {
            try {
                let baseBackend = import.meta.env.VITE_BACKEND_URL || "";
                if (!baseBackend && import.meta.env.RAILWAY_PUBLIC_DOMAIN) {
                    baseBackend = "https://" + import.meta.env.RAILWAY_PUBLIC_DOMAIN;
                } else if (!baseBackend && import.meta.env.RAILWAY_STATIC_URL) {
                    baseBackend = "https://" + import.meta.env.RAILWAY_STATIC_URL;
                }
                const url = baseBackend + "/turn-credentials";
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    if (data.iceServers) iceServersRef.current = data.iceServers;
                }
            } catch (err) { console.log("Using default ICE servers", err); }
        };
        fetchIce();
    }, []);

    // NEW Tool: Ensure only the tracks we want are sent/shown.
    const getActiveVideoTrack = () => activeScreenTrackRef.current || activeWhiteboardTrackRef.current || cameraTrackRef.current;

    const getCleanStream = () => {
        const clean = new MediaStream();
        if (streamRef.current) {
            streamRef.current.getAudioTracks().forEach(t => clean.addTrack(t));
            const v = getActiveVideoTrack();
            if (v) clean.addTrack(v);
        }
        return clean;
    };

    const forceSingleVideoTrack = (newTrack) => {
        if (!streamRef.current || !newTrack) return;
        streamRef.current.getVideoTracks().forEach(t => {
            if (t !== newTrack) streamRef.current.removeTrack(t);
        });
        if (!streamRef.current.getVideoTracks().includes(newTrack)) {
            streamRef.current.addTrack(newTrack);
        }
        
        // Also update all active peers' send streams
        peersRef.current.forEach(p => {
            if (p.sendStream) {
                p.sendStream.getVideoTracks().forEach(t => {
                    if (t !== newTrack) p.sendStream.removeTrack(t);
                });
                if (!p.sendStream.getVideoTracks().includes(newTrack)) {
                    p.sendStream.addTrack(newTrack);
                }
            }
        });
    };
    const roomID = props.roomID;

    // Keep socket ref in sync
    // Warm up SpeechSynthesis voices
    useEffect(() => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.getVoices();
            const handleVoicesChanged = () => window.speechSynthesis.getVoices();
            window.speechSynthesis.onvoiceschanged = handleVoicesChanged;
            return () => {
                window.speechSynthesis.onvoiceschanged = null;
            };
        }
    }, []);

    // Keep socket ref in sync
    useEffect(() => {
        socketRef.current = props.socket;
    }, [props.socket]);

    const processIncomingSignal = (payload, isCancelled) => {
        let existing = peersRef.current.find(p => p.peerID === payload.callerID);
        
        if (existing && existing.peer) {
            existing.peer.signal(payload.signal);
            return;
        }

        const sendStream = getCleanStream();
        const peer = addPeer(payload.signal, payload.callerID, sendStream);
        
        if (existing) {
            existing.peer = peer;
            existing.sendStream = sendStream;
            existing.username = payload.username || existing.username;
            existing.nativeLang = payload.nativeLang || existing.nativeLang;
        } else {
            existing = { 
                peerID: payload.callerID, 
                peer, 
                sendStream,
                username: payload.username, 
                nativeLang: payload.nativeLang || 'az-AZ',
                status: 'connecting'
            };
            peersRef.current.push(existing);
        }

        peer.on("stream", rs => {
            if (isCancelled) return;
            const target = peersRef.current.find(p => p.peerID === payload.callerID);
            if (target) {
                target.stream = rs;
                target.status = 'connected';
            }
            setPeers([...peersRef.current]);
        });
        peer.on("connect", () => {
            if (isCancelled) return;
            const target = peersRef.current.find(p => p.peerID === payload.callerID);
            if (target) target.status = 'connected';
            setPeers([...peersRef.current]);
        });

        setPeers([...peersRef.current]);
    };

    const joinMeeting = () => {
        isJoinedRef.current = true;
        setIsJoined(true);
        if (!videoEnabled) {
            setLocalCameraOff(true);
        }
        if (socketRef.current) {
            if (!videoEnabled) {
                setTimeout(() => socketRef.current.emit("camera-toggled", true), 500);
            }
        }
    };

    useEffect(() => {
        if (isJoined && streamReady && streamRef.current && socketRef.current) {
            if (pendingUsersRef.current.length > 0) {
                pendingUsersRef.current.forEach(u => initiatePeerConnection(u.id, u.username, streamRef.current));
                pendingUsersRef.current = [];
            }
            if (pendingSignalsRef.current.length > 0) {
                pendingSignalsRef.current.forEach(payload => processIncomingSignal(payload, false));
                pendingSignalsRef.current = [];
            }
        }
    }, [isJoined, streamReady]);

    const togglePrejoinMic = () => {
        if (streamRef.current) {
            const track = streamRef.current.getAudioTracks()[0];
            if (track) {
                track.enabled = !micEnabled;
                setMicEnabled(!micEnabled);
            }
        }
    };

    const togglePrejoinVideo = () => {
        if (streamRef.current) {
            const track = streamRef.current.getVideoTracks()[0];
            if (track) {
                track.enabled = !videoEnabled;
                setVideoEnabled(!videoEnabled);
            }
        }
    };

    useEffect(() => {
        let isCancelled = false;
        
        // --- SOCKET LISTENERS ---
        const handlers = {            "all-users": users => {
                const recent = JSON.parse(localStorage.getItem('nitro_recent_contacts') || '[]');
                const updated = Array.from(new Set([...recent, ...users.map(u => u.username)]));
                localStorage.setItem('nitro_recent_contacts', JSON.stringify(updated.slice(-20))); // Keep last 20 unique

                users.forEach(user => {
                    if (user.id !== socketRef.current.id) {
                        if (!isJoinedRef.current || !streamRef.current) {
                            pendingUsersRef.current.push({ id: user.id, username: user.username, nativeLang: user.nativeLang });
                        } else {
                            initiatePeerConnection(user.id, user.username, streamRef.current);
                        }
                    }
                });
            },
            "user-joined": ({ id, username, nativeLang }) => {
                console.log("New user joined room:", username);
                playSound('join');
                
                const recent = JSON.parse(localStorage.getItem('nitro_recent_contacts') || '[]');
                if (!recent.includes(username)) {
                    recent.push(username);
                    localStorage.setItem('nitro_recent_contacts', JSON.stringify(recent.slice(-20)));
                }

                // Add placeholder if not already tracked
                if (!peersRef.current.find(p => p.peerID === id)) {
                    peersRef.current.push({
                        peerID: id, username, stream: null, status: 'connecting', isHandRaised: false, isCameraOff: false, nativeLang: nativeLang || 'az-AZ'
                    });
                }
                setPeers([...peersRef.current]);
                // NOTE: The new joiner will send us a 'user-joined-signal' via the 'all-users' → initiatePeerConnection flow.
                // We do NOT initiate here to avoid double-connections. The signal will arrive via 'user-joined-signal'.
            },
            "user-camera-toggled": ({ id, isOff }) => {
                const target = peersRef.current.find(p => p.peerID === id);
                if (target) target.isCameraOff = isOff;
                setPeers([...peersRef.current]);
            },
            "user-joined-signal": payload => {
                if (!isJoinedRef.current || !streamRef.current) {
                    pendingSignalsRef.current.push(payload);
                    return;
                }
                processIncomingSignal(payload, isCancelled);
            },
            "receiving-returned-signal": payload => {
                const item = peersRef.current.find(p => p.peerID === payload.id);
                if (item && item.peer) {
                    item.peer.signal(payload.signal);
                    item.nativeLang = payload.nativeLang || item.nativeLang;
                    setPeers([...peersRef.current]);
                }
            },
            "user-left": id => {
                playSound('leave');
                const pObj = peersRef.current.find(p => p.peerID === id);
                if (pObj && pObj.peer && !pObj.peer.destroyed) {
                    try { pObj.peer.destroy(); } catch(e) { console.warn("Peer destroy error:", e); }
                }
                peersRef.current = peersRef.current.filter(p => p.peerID !== id);
                setPeers(prev => prev.filter(p => p.peerID !== id));
            },
            "receive-message": (m) => { 
                playSound('message'); 
                setMessages(prev => [...prev, m]); 
            },
            "user-hand-raised": ({ id, isRaised }) => {
                if (isRaised) playSound('hand');
                const target = peersRef.current.find(p => p.peerID === id);
                if (target) target.isHandRaised = isRaised;
                setPeers([...peersRef.current]);
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
                // Ensure audio is still in mixer if they re-share or toggle
            },
            "moderator-status": s => {
                if (!isCancelled) setIsModerator(s);
            },
            "kicked": () => { 
                alert("You have been kicked."); 
                props.onLeave(); 
            },
            "muted-by-mod": () => {
                if (!isCancelled) {
                    setIsMutedByMod(true);
                    if (streamRef.current && streamRef.current.getAudioTracks().length > 0) {
                        streamRef.current.getAudioTracks()[0].enabled = false;
                    }
                }
            },
            "unmuted-by-mod": () => {
                if (!isCancelled) {
                    setIsMutedByMod(false);
                }
            },
            "whiteboard-state": (isOpen, openerId) => {
                console.log("[Whiteboard] State update from remote:", isOpen, "Opener:", openerId);
                setIsWhiteboardOpen(isOpen);
                setWhiteboardSharerId(isOpen ? openerId : null);
                // If server says false, we are no longer the opener
                if (!isOpen) setIsWhiteboardOpener(false);
            },
            "meeting-closed": () => { 
                console.log("Meeting closed by moderator.");
                alert("The moderator has closed the meeting."); 
                props.onLeave(); 
            }
        };

        // Attach listeners
        if (socketRef.current) {
            Object.keys(handlers).forEach(event => {
                socketRef.current.on(event, handlers[event]);
            });
            
            // JOIN ROOM IMMEDIATELY ON MOUNT
            // This ensures we receive room events (whiteboard, chat) even before clicking "Join Now"
            socketRef.current.emit("join-room", { 
                roomID, 
                username: props.username || "Guest", 
                nativeLang: 'auto' 
            });
        }

        // --- MEDIA STREAM SETUP ---
        const startMedia = () => {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true })
                    .then(stream => {
                        if (isCancelled) {
                            stream.getTracks().forEach(t => t.stop());
                            return;
                        }
                        if (userVideo.current) userVideo.current.srcObject = stream;
                        streamRef.current = stream;
                        cameraTrackRef.current = stream.getVideoTracks()[0];
                        forceSingleVideoTrack(cameraTrackRef.current);
                        setStreamReady(true);
                    })
                    .catch(err => {
                        console.error("Media failed:", err);
                        alert("Kamera/Mikrofon Hatası: Lütfen tarayıcı ayarlarından (adres çubuğundaki kilit simgesi) kamera ve mikrofon izinlerini verdiğinizden emin olun.\n\nDetay: " + err.message);
                        setStreamReady(true); // Allow joining even without media
                    });
            } else {
                setStreamReady(true);
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
            peersRef.current.forEach(p => {
                if (p.peer && !p.peer.destroyed) {
                    try { p.peer.destroy(); } catch(e) { console.warn("Cleanup peer destroy error:", e); }
                }
            });
            peersRef.current = [];
        };
    }, [roomID, props.username, props.socket]);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // --- SPEECH RECOGNITION REMOVED AS PER USER REQUEST ---

    // Handle local video re-attachment when layout changes (remounts)
    // useLayoutEffect runs synchronously after DOM mutations — fixes camera not showing on unpin
    useLayoutEffect(() => {
        if (userVideo.current && streamRef.current) {
            userVideo.current.srcObject = streamRef.current;
        }
    }, [pinnedId, sharingId]);

    const initiatePeerConnection = (userID, username, stream) => {
        let existing = peersRef.current.find(p => p.peerID === userID);
        if (existing && existing.peer && !existing.peer.destroyed) return;

        const sendStream = getCleanStream();
        const peer = createPeer(userID, socketRef.current?.id, sendStream);

        if (existing) {
            // Update placeholder peer in place (created by user-joined event)
            existing.peer = peer;
            existing.sendStream = sendStream;
            existing.username = username || existing.username;
            existing.status = 'connecting';
        } else {
            const pObj = {
                peerID: userID,
                peer,
                sendStream,
                username: username || "Participant",
                nativeLang: 'az-AZ',
                status: 'connecting',
                stream: null
            };
            peersRef.current.push(pObj);
        }
        
        peer.on("stream", remoteStream => {
            const curP = peersRef.current.find(p => p.peerID === userID);
            if (curP) {
                curP.stream = remoteStream;
                curP.status = 'connected';
            }
            setPeers([...peersRef.current]);
        });
        peer.on("connect", () => {
            const curP = peersRef.current.find(p => p.peerID === userID);
            if (curP) curP.status = 'connected';
            setPeers([...peersRef.current]);
        });
        
        setPeers([...peersRef.current]);
    };

    function createPeer(userToSignal, callerID, stream) {
        const peer = new Peer({
            initiator: true,
            trickle: true,
            stream,
            config: {
                iceServers: iceServersRef.current
            }
        });

        peer.on("signal", signal => {
            socketRef.current.emit("sending-signal", { userToSignal, callerID, signal, username: props.username, nativeLang: 'auto' });
        });

        peer.on("error", err => {
            console.error(`Peer error with ${userToSignal}:`, err);
            alert("Bağlantı Hatası: " + err.message);
        });

        peer.on("data", handleIncomingData);

        return peer;
    }

    function addPeer(incomingSignal, callerID, stream) {
        const peer = new Peer({
            initiator: false,
            trickle: true,
            stream,
            config: {
                iceServers: iceServersRef.current
            }
        });

        peer.on("signal", signal => {
            socketRef.current.emit("returning-signal", { signal, callerID, nativeLang: 'auto' });
        });

        peer.on("error", err => {
            console.error(`Peer error with caller ${callerID}:`, err);
        });

        peer.on("data", handleIncomingData);

        peer.signal(incomingSignal);

        return peer;
    }

    const shareScreen = () => {
        setShowShareMenu(!showShareMenu);
    };

    const startScreenShare = () => {
        setShowShareMenu(false);
        if (!navigator.mediaDevices.getDisplayMedia) {
            alert("Screen sharing is not supported in this browser or context.");
            return;
        }

        navigator.mediaDevices.getDisplayMedia({ cursor: true }).then(screenStream => {
            const screenTrack = screenStream.getTracks()[0];
            const cameraTrack = cameraTrackRef.current;
            activeScreenTrackRef.current = screenTrack;

            socketRef.current.emit("toggle-screen-share", true);
            setSharingId(socketRef.current?.id);

            peersRef.current.forEach(({ peer, sendStream }) => {
                if (peer && !peer.destroyed && cameraTrack && screenTrack) {
                    peer.replaceTrack(cameraTrack, screenTrack, sendStream);
                }
            });

            // NEW: Ensure streamRef.current AND all peer streams ONLY have the screen track
            forceSingleVideoTrack(screenTrack);

            userVideo.current.srcObject = screenStream;

            screenTrack.onended = () => {
                socketRef.current.emit("toggle-screen-share", false);
                setSharingId(null);
                
                peersRef.current.forEach(({ peer, sendStream }) => {
                    if (peer && !peer.destroyed && cameraTrack && screenTrack) {
                        peer.replaceTrack(screenTrack, cameraTrack, sendStream);
                    }
                });

                // NEW: Restore camera track to all streams
                forceSingleVideoTrack(cameraTrack);
                activeScreenTrackRef.current = null;

                userVideo.current.srcObject = streamRef.current;
            };
        }).catch(err => {
            console.error("Screen share failed:", err);
        });
    };

    const switchCamera = async () => {
        if (!streamReady || !streamRef.current) return;
        const oldVideoTrack = cameraTrackRef.current;
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            
            const useFacingMode = videoDevices.length < 2 || !videoDevices[0].deviceId;
            
            // Mövcud kameranı dayandırırıq və Android cihazlarda hardware kilidinin 
            // açılması üçün mütləq 400ms gözləyirik.
            if (oldVideoTrack) {
                oldVideoTrack.stop();
                await new Promise(resolve => setTimeout(resolve, 400));
            }

            let newStream;
            if (useFacingMode) {
                const newMode = isFrontCamera ? "environment" : "user";
                try {
                    newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: newMode } } });
                } catch (e) {
                    newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: newMode } });
                }
            } else {
                const currentLabel = oldVideoTrack ? oldVideoTrack.label : "";
                let currentIndex = videoDevices.findIndex(d => d.label === currentLabel);
                if (currentIndex === -1) currentIndex = isFrontCamera ? 0 : 1;
                
                const nextDevice = videoDevices[(currentIndex + 1) % videoDevices.length];
                newStream = await navigator.mediaDevices.getUserMedia({ 
                    video: { deviceId: { exact: nextDevice.deviceId } }
                });
            }
            
            const newVideoTrack = newStream.getVideoTracks()[0];
            
            if (streamRef.current) {
                forceSingleVideoTrack(newVideoTrack);
            }
            cameraTrackRef.current = newVideoTrack;
            
            peersRef.current.forEach(({ peer, sendStream }) => {
                if (peer && !peer.destroyed) {
                    if (!activeScreenTrackRef.current && !activeWhiteboardTrackRef.current) {
                        peer.replaceTrack(oldVideoTrack, newVideoTrack, sendStream);
                    }
                }
            });
            
            if (userVideo.current) {
                userVideo.current.srcObject = streamRef.current;
            }
            
            if (localCameraOff) {
                newVideoTrack.enabled = false;
            }
            
            setIsFrontCamera(!isFrontCamera);
        } catch (err) {
            console.error("Failed to switch camera:", err);
            alert("Digər kamera tapılmadı və ya açılmadı.");
            // Try to recover original camera
            try {
                const recStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: isFrontCamera ? "user" : "environment" }});
                const recTrack = recStream.getVideoTracks()[0];
                forceSingleVideoTrack(recTrack);
                cameraTrackRef.current = recTrack;
                peersRef.current.forEach(({ peer, sendStream }) => {
                    if (peer && !peer.destroyed && !activeScreenTrackRef.current && !activeWhiteboardTrackRef.current) {
                        peer.replaceTrack(oldVideoTrack, recTrack, sendStream);
                    }
                });
                if (userVideo.current) userVideo.current.srcObject = streamRef.current;
                if (localCameraOff) recTrack.enabled = false;
            } catch (e) {
                console.error("Camera recovery failed", e);
            }
        }
    };

    const togglePin = (id) => {
        setPinnedId(prev => (prev === id ? null : id));
    };

    const focusedId = sharingId || whiteboardSharerId || pinnedId;
    const isFocusMode = !!focusedId;

    const sendMessage = (text) => {
        const msg = {
            sender: props.username,
            text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        socketRef.current.emit("send-message", msg);
    };

    const sendFile = (fileData) => {
        const msg = {
            sender: props.username,
            file: fileData,
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

    const handleIncomingData = (data) => {
        // Data channel functionality reserved for future professional features (e.g., file sharing)
        try {
            const dataString = (typeof data === 'string') ? data : Buffer.from(data).toString();
            // Silence processing of transcripts for professional version
        } catch (e) {
            console.error("Error handling data channel message:", e);
        }
    };

    // Called when Whiteboard canvas stream is ready — pipe it through WebRTC like a screen share
    const handleWhiteboardStreamReady = (canvasStream) => {
        if (!isWhiteboardOpenerRef.current) return;
        whiteboardStreamRef.current = canvasStream;

        const canvasTrack = canvasStream.getVideoTracks()[0];
        const cameraTrack = cameraTrackRef.current;
        activeWhiteboardTrackRef.current = canvasTrack;

        // Replace video track in all peer connections with canvas stream
        peersRef.current.forEach(({ peer, sendStream }) => {
            if (peer && !peer.destroyed && cameraTrack && canvasTrack) {
                peer.replaceTrack(cameraTrack, canvasTrack, sendStream);
            }
        });

        // NEW: Ensure all streams ONLY have the whiteboard track
        forceSingleVideoTrack(canvasTrack);

        // Show canvas stream in local video preview
        if (userVideo.current) {
            userVideo.current.srcObject = canvasStream;
        }

        // We do NOT call setSharingId(socketRef.current?.id) or emit toggle-screen-share here,
        // so the whiteboard will be seen in the camera feed area without triggering focus/pin mode.
    };

    // Close whiteboard and restore original camera track
    const handleWhiteboardClose = () => {
        setIsWhiteboardOpen(false);

        if (isWhiteboardOpener) {
            setIsWhiteboardOpener(false);
            isWhiteboardOpenerRef.current = false;

            const cameraTrack = cameraTrackRef.current;
            // Capture canvas track reference BEFORE stopping the stream
            const canvasTrack = activeWhiteboardTrackRef.current;

            // Restore original camera track in all peer connections
            peersRef.current.forEach(({ peer, sendStream }) => {
                if (peer && !peer.destroyed && cameraTrack && canvasTrack) {
                    peer.replaceTrack(canvasTrack, cameraTrack, sendStream);
                }
            });

            // NEW: Restore exactly the camera track to all streams
            forceSingleVideoTrack(cameraTrack);
            activeWhiteboardTrackRef.current = null;

            // Now safe to stop canvas stream tracks
            if (whiteboardStreamRef.current) {
                whiteboardStreamRef.current.getTracks().forEach(t => t.stop());
            }
            whiteboardStreamRef.current = null;

            // Restore local camera preview
            if (userVideo.current) {
                userVideo.current.srcObject = streamRef.current;
            }

            // Un-focus from video grid
            socketRef.current?.emit('toggle-screen-share', false);
            setSharingId(null);

            // Tell everyone the whiteboard is closed
            socketRef.current?.emit('toggle-whiteboard', false);
        }
        // Non-openers just close their local whiteboard-open state silently (no broadcast)
    };

    const handleSelfUnmute = () => {
        setIsMutedByMod(false);
        if (socketRef.current) {
            socketRef.current.emit("self-unmute");
        }
    };

    const copyInviteLink = () => {
        const url = `${window.location.origin}/?room=${roomID}`;
        navigator.clipboard.writeText(url)
            .then(() => alert("Invite link copied to clipboard!"))
            .catch(err => console.error("Could not copy text: ", err));
    };

    const toggleRecording = async () => {
        if (isRecording) {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
            setIsRecording(false);
        } else {
            try {
                let stream;
                if (navigator.mediaDevices.getDisplayMedia) {
                    stream = await navigator.mediaDevices.getDisplayMedia({
                        video: { cursor: "always" },
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true,
                            sampleRate: 44100
                        }
                    });
                } else if (streamRef.current) {
                    alert("Ekran kaydı bu cihazda desteklenmiyor. Bunun yerine yerel kameranız kaydediliyor.");
                    stream = streamRef.current;
                } else {
                    throw new Error("Kayıt için kullanılabilir bir medya kaynağı bulunamadı.");
                }

                recordedChunksRef.current = [];
                
                // Use a standard mimeType for better compatibility
                let mimeType = 'video/webm;codecs=vp9,opus';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = 'video/webm';
                }

                const recorder = new MediaRecorder(stream, { mimeType });
                mediaRecorderRef.current = recorder;

                recorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        recordedChunksRef.current.push(event.data);
                    }
                };

                recorder.onstop = () => {
                    if (recordedChunksRef.current.length === 0) return;

                    const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
                    const url = URL.createObjectURL(blob);
                    
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const fileName = `NitroCall-Record-${timestamp}.webm`;

                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = url;
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    
                    setTimeout(() => {
                        document.body.removeChild(a);
                        window.URL.revokeObjectURL(url);
                    }, 100);
                    
                    // Stop screen capture tracks
                    stream.getTracks().forEach(t => t.stop());
                };

                // Watch for user clicking "Stop Sharing" in browser UI
                stream.getVideoTracks()[0].onended = () => {
                    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                        mediaRecorderRef.current.stop();
                    }
                    setIsRecording(false);
                };

                recorder.start(1000); // Checkpoint every second
                setIsRecording(true);
            } catch (err) {
                console.error("Failed to start recording:", err);
                // Don't alert on user cancellation
                if (err.name !== 'NotAllowedError') {
                    alert("Recording failed: " + err.message);
                }
            }
        }
    };

    if (!isJoined) {
        return (
            <div className="prejoin-overlay">
                <div className="prejoin-card glass-card">
                    <h2>Ready to join?</h2>
                    <div className="prejoin-preview-wrapper">
                        {streamReady && streamRef.current ? (
                            <video 
                                autoPlay 
                                playsInline 
                                muted 
                                className={isFrontCamera ? "local-video" : ""}
                                ref={(ref) => {
                                    if (ref && streamRef.current) ref.srcObject = streamRef.current;
                                }} 
                            />
                        ) : (
                            <div className="preview-placeholder">
                                <span>{streamReady ? "No camera detected" : "Starting camera..."}</span>
                            </div>
                        )}
                        {!videoEnabled && streamRef.current && (
                            <div className="preview-placeholder" style={{ position: 'absolute', top: 0, left: 0, background: '#0f172a' }}>
                                <VideoOff size={48} />
                            </div>
                        )}
                    </div>
                    <div className="prejoin-controls">
                        <button 
                            onClick={togglePrejoinMic}
                            className={`prejoin-btn ${!micEnabled ? 'off' : ''}`}
                            title={micEnabled ? 'Mute Microphone' : 'Unmute Microphone'}
                        >
                            {micEnabled ? <Mic size={24} /> : <MicOff size={24} />}
                        </button>
                        <button 
                            onClick={togglePrejoinVideo}
                            className={`prejoin-btn ${!videoEnabled ? 'off' : ''}`}
                            title={videoEnabled ? 'Turn Camera Off' : 'Turn Camera On'}
                        >
                            {videoEnabled ? <VideoIcon size={24} /> : <VideoOff size={24} />}
                        </button>
                    </div>
                    <button onClick={joinMeeting} className="join-now-btn" disabled={!streamReady}>
                        Join Room
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={`${isChatOpen ? "chat-open" : ""} ${isParticipantsOpen ? "participants-open" : ""}`} style={{ height: '100vh', width: '100vw', backgroundColor: '#0f172a', display: 'flex', overflow: 'hidden', position: 'relative' }}>
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
                                    <video 
                                        muted 
                                        autoPlay 
                                        playsInline 
                                        className={sharingId === socketRef.current?.id ? "" : (isFrontCamera ? "local-video" : "")} 
                                        ref={(node) => {
                                            userVideo.current = node;
                                            if (node && streamRef.current) {
                                                node.srcObject = streamRef.current;
                                            }
                                        }}
                                    />
                                    {localCameraOff && !isWhiteboardOpener && (
                                        <div className="user-avatar-overlay">
                                            <div className="avatar-circle">
                                                {(props.username || "U").charAt(0).toUpperCase()}
                                            </div>
                                        </div>
                                    )}
                                    <div className="username-tag">{props.username || "You"} (You) {sharingId === socketRef.current?.id && " - Sharing"}</div>
                                </div>
                            ) : (
                                peers.filter(p => p.peerID === focusedId).map(p => (
                                    <RemoteVideo 
                                        key={p.peerID} 
                                        stream={p.stream} 
                                        username={p.username} 
                                        status={p.status} 
                                        isHandRaised={p.isHandRaised} 
                                        isFocused={true}
                                        isSharing={sharingId === p.peerID || whiteboardSharerId === p.peerID}
                                        isCameraOff={p.isCameraOff}
                                        volume={peerVolumes[p.peerID]}
                                        onClick={() => togglePin(p.peerID)}
                                    />
                                ))
                            )}
                        </div>
                    )}

                    <div className={isFocusMode ? "participants-bottom-row" : "grid-container-inner"}>
                        {focusedId !== socketRef.current?.id && (
                            <div className="video-container" onClick={() => togglePin(socketRef.current?.id)}>
                                <video 
                                    muted 
                                    autoPlay 
                                    playsInline 
                                    className={sharingId === socketRef.current?.id ? "" : (isFrontCamera ? "local-video" : "")} 
                                    ref={(node) => {
                                        userVideo.current = node;
                                        if (node && streamRef.current) {
                                            node.srcObject = streamRef.current;
                                        }
                                    }}
                                />
                                    {localCameraOff && !isWhiteboardOpener && (
                                    <div className="user-avatar-overlay">
                                        <div className="avatar-circle">
                                            {(props.username || "U").charAt(0).toUpperCase()}
                                        </div>
                                    </div>
                                )}
                                <div className="username-tag">{props.username || "You"} (You)</div>
                                <div className="pin-hint">Pin Me</div>
                                {isHandRaised && (
                                    <div className="hand-raise-badge">
                                        <Hand size={14} fill="currentColor" /> Raised
                                    </div>
                                )}
                            </div>
                        )}
                        {peers.filter(p => p.peerID !== focusedId).map((peer) => (
                            <RemoteVideo 
                                key={peer.peerID} 
                                stream={peer.stream} 
                                username={peer.username} 
                                status={peer.status} 
                                isHandRaised={peer.isHandRaised} 
                                isSharing={sharingId === peer.peerID || whiteboardSharerId === peer.peerID}
                                isCameraOff={peer.isCameraOff}
                                volume={peerVolumes[peer.peerID]}
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
                    isChatOpen={isChatOpen}
                    isMutedByMod={isMutedByMod}
                    onSelfUnmute={handleSelfUnmute}
                    initialMicOn={micEnabled}
                    initialCameraOn={videoEnabled}
                    onToggleCamera={(isOff) => {
                        setLocalCameraOff(isOff);
                        socketRef.current.emit("camera-toggled", isOff);
                    }}
                    onSwitchCamera={switchCamera}
                    isWhiteboardOpen={isWhiteboardOpen}
                    onToggleWhiteboard={() => {
                        if (!isModerator) {
                            alert("Yalnız moderator lövhəni açaraq paylaşa bilər.");
                            return;
                        }
                        const newState = !isWhiteboardOpen;
                        setIsWhiteboardOpen(newState);
                        if (newState) {
                            setIsWhiteboardOpener(true);
                            isWhiteboardOpenerRef.current = true;
                        }
                        socketRef.current.emit("toggle-whiteboard", newState);
                    }}
                    isRecording={isRecording}
                    onToggleRecording={toggleRecording}
                />

                <AnimatePresence>
                    {showShareMenu && !isMobile && (
                        <motion.div 
                            initial={{ opacity: 0, y: 50, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 50, scale: 0.9 }}
                            className="share-menu-modal"
                            style={{
                                position: 'absolute',
                                bottom: '90px',
                                left: '50%',
                                marginLeft: '-175px',
                                backgroundColor: 'white',
                                padding: '24px 32px',
                                borderRadius: '16px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '24px',
                                boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                                zIndex: 100,
                                border: '1px solid #e2e8f0',
                                width: '350px'
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
                                <h3 style={{ margin: 0, color: '#0f172a', fontSize: '18px', fontWeight: 600 }}>Paylaşım Növü</h3>
                                <XCircle size={24} style={{ cursor: 'pointer', color: '#64748b' }} onClick={() => setShowShareMenu(false)} />
                            </div>
                            
                            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
                                <button 
                                    onClick={startScreenShare}
                                    style={{
                                        background: '#f8fafc',
                                        border: '2px solid #e2e8f0',
                                        borderRadius: '12px',
                                        padding: '24px 20px',
                                        color: '#3b82f6',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '12px',
                                        cursor: 'pointer',
                                        width: '140px',
                                        transition: 'all 0.2s',
                                        boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
                                    }}
                                    onMouseOver={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.background = '#eff6ff'; }}
                                    onMouseOut={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc'; }}
                                >
                                    <Monitor size={48} strokeWidth={1.5} />
                                    <span style={{ fontWeight: 600, color: '#334155', fontSize: '15px' }}>Ekran</span>
                                </button>

                                <button 
                                    onClick={() => {
                                        if (!isModerator) {
                                            alert("Yalnız moderator lövhəni açaraq paylaşa bilər.");
                                            return;
                                        }
                                        setShowShareMenu(false);
                                        const newState = !isWhiteboardOpen;
                                        setIsWhiteboardOpen(newState);
                                        if (newState) {
                                            setIsWhiteboardOpener(true);
                                            isWhiteboardOpenerRef.current = true;
                                        }
                                        socketRef.current.emit("toggle-whiteboard", newState);
                                    }}
                                    style={{
                                        background: '#f8fafc',
                                        border: '2px solid #e2e8f0',
                                        borderRadius: '12px',
                                        padding: '24px 20px',
                                        color: '#6366f1',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '12px',
                                        cursor: 'pointer',
                                        width: '140px',
                                        transition: 'all 0.2s',
                                        boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
                                    }}
                                    onMouseOver={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.background = '#eef2ff'; }}
                                    onMouseOut={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc'; }}
                                >
                                    <Edit3 size={48} strokeWidth={1.5} />
                                    <span style={{ fontWeight: 600, color: '#334155', fontSize: '15px' }}>Lövhə</span>
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

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
                        onSendFile={sendFile}
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

            <AnimatePresence>
                {/* Only the opener sees the full whiteboard drawing UI.
                    Others see the canvas as a video stream in the video grid (via WebRTC). 
                    No modal is rendered for them, ensuring they have no interactive access. */}
                {isWhiteboardOpen && isWhiteboardOpener && (
                    <Whiteboard 
                        socket={socketRef.current} 
                        roomID={roomID} 
                        isOpener={true}
                        onStreamReady={handleWhiteboardStreamReady}
                        onClose={handleWhiteboardClose}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

const Video = (props) => {
    return <VideoIcon {...props} />;
};

export default Room;
