import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Video, Zap, User, ArrowRight, Shield, Globe, Zap as ZapIcon, Users, ShieldCheck, Calendar, Clock, Trash2 } from 'lucide-react';

const Home = (props) => {
    const { onJoin, onCreate, socket, onlineRooms, scheduledMeetings, onRequestJoin, username, setUsername, onlineUsers } = props;
    const [roomID, setRoomID] = useState('');
    const [roomName, setRoomName] = useState('');
    const [isInviteLink, setIsInviteLink] = useState(false);
    const [callingUser, setCallingUser] = useState(null);
    
    // Schedule States
    const [isScheduling, setIsScheduling] = useState(false);
    const [schedTitle, setSchedTitle] = useState('');
    const [schedTime, setSchedTime] = useState('');
    const [schedRoomID, setSchedRoomID] = useState('');
    const [invitees, setInvitees] = useState('');
    const [isPublic, setIsPublic] = useState(true);
    const [recentContacts, setRecentContacts] = useState([]);

    React.useEffect(() => {
        const saved = JSON.parse(localStorage.getItem('nitro_recent_contacts') || '[]');
        setRecentContacts(saved);
    }, []);

    React.useEffect(() => {
        if (!props.socket) return;
        
        const onCallAccepted = ({ roomID }) => {
            setCallingUser(null);
            onJoin(roomID, username);
        };
        
        const onCallDeclined = () => {
            setCallingUser(null);
            alert("Call was declined.");
        };

        props.socket.on("call-accepted", onCallAccepted);
        props.socket.on("call-declined", onCallDeclined);

        return () => {
            props.socket.off("call-accepted", onCallAccepted);
            props.socket.off("call-declined", onCallDeclined);
        };
    }, [props.socket, onJoin, username]);

    const callUser = (targetUserId, targetUsername) => {
        if (!username) {
            alert("Please enter a username first");
            return;
        }
        const newRoomID = Math.random().toString(36).substring(2, 9);
        props.socket.emit("call-user", { targetUserId, callerName: username, roomID: newRoomID });
        setCallingUser(targetUsername);
    };

    const clearRecentContact = (name) => {
        const updated = recentContacts.filter(c => c !== name);
        setRecentContacts(updated);
        localStorage.setItem('nitro_recent_contacts', JSON.stringify(updated.slice(-20)));
    };

    React.useEffect(() => {
        const queryParams = new URLSearchParams(window.location.search);
        const roomFromUrl = queryParams.get('room');
        if (roomFromUrl) {
            setRoomID(roomFromUrl);
            setIsInviteLink(true);
        }
    }, []);

    // Join lobby when username is available
    React.useEffect(() => {
        if (username && props.socket) {
            props.socket.emit("lobby-join", username);
        }
    }, [username, props.socket]);

    const handleSubmit = (e) => {
        e.preventDefault();
        
        if (roomID && username) {
            localStorage.setItem('nitro_username', username);
            if (isInviteLink) {
                // Joining via invite link — request to join existing room
                onJoin(roomID, username);
            } else {
                onCreate(roomID, username, roomName || roomID);
            }
        }
    };

    const createRoom = () => {
        const id = Math.random().toString(36).substring(2, 9);
        setRoomID(id);
    };

    const handleSchedule = (e) => {
        e.preventDefault();
        if (!schedTitle || !schedTime || !username) {
            alert("Title, Time and Username are required");
            return;
        }

        const meetingData = {
            title: schedTitle,
            startTime: schedTime,
            roomID: schedRoomID || Math.random().toString(36).substring(2, 9),
            creator: username,
            isPublic: isPublic
        };
        socket.emit("schedule-meeting", meetingData);

        // --- INVITE LOGIC (mailto & sms) ---
        const inviteeList = invitees.split(',').map(e => e.trim()).filter(e => e !== '');
        const emails = inviteeList.filter(e => e.includes('@'));
        const phones = inviteeList.filter(e => /^\+?[0-9\s-]{7,}$/.test(e));

        const joinLink = `https://nitrocalls.online/?room=${meetingData.roomID}`;
        const timeStr = new Date(meetingData.startTime).toLocaleString();
        const subject = encodeURIComponent(`Seminar Dəvəti: ${meetingData.title}`);
        const body = encodeURIComponent(
            `Salam! Sizi Nitro Calls platformasında keçiriləcək seminara dəvət edirəm.\n\n` +
            `Mövzu: ${meetingData.title}\n` +
            `Vaxt: ${timeStr}\n` +
            `Moderator: ${meetingData.creator}\n\n` +
            `Seminara qoşulmaq üçün link: ${joinLink}\n\n` +
            `Zəhmət olmasa təyin olunan vaxtda qoşulun. Təşəkkürlər!`
        );

        // Trigger Mailto for emails
        if (emails.length > 0) {
            const mailtoUrl = `mailto:${emails.join(',')}?subject=${subject}&body=${body}`;
            window.location.href = mailtoUrl;
        }

        // Trigger SMS for phones (one by one or first one for simplicity, as browsers handle sms link differently)
        if (phones.length > 0) {
            setTimeout(() => {
                const smsUrl = `sms:${phones[0]}?body=${body}`;
                window.open(smsUrl, '_blank');
            }, 1000);
        }

        setIsScheduling(false);
        setSchedTitle('');
        setSchedTime('');
        setSchedRoomID('');
        setInvitees('');
    };

    const deleteScheduled = (id) => {
        if (window.confirm("Are you sure you want to delete this scheduled meeting?")) {
            socket.emit("delete-meeting", id);
        }
    };

    return (
        <div className="home-container">
            {callingUser && (
                <div className="call-modal" style={{ zIndex: 1000 }}>
                    <div className="glass-card call-card outgoing">
                        <div className="pulse-circle">
                            <Video size={32} />
                        </div>
                        <h3>Calling...</h3>
                        <p>Waiting for <strong>{callingUser}</strong> to answer.</p>
                        <button onClick={() => setCallingUser(null)} className="decline-btn" style={{ background: '#ef4444', marginTop: '1rem', width: '100%' }}>Cancel</button>
                    </div>
                </div>
            )}
            <div className="animated-bg">
                <div className="blob"></div>
                <div className="blob"></div>
                <div className="blob"></div>
            </div>

            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className="home-content"
            >
                <header className="home-header" style={{ marginTop: 'min(10vh, 80px)' }}>
                    <div className="logo-container">
                        <div className="logo-icon">
                            <img src="/logo.png" alt="Nitro Call Logo" style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
                        </div>
                        <h1>Nitro Calls</h1>
                    </div>
                    <p className="subtitle">Premium Peer-to-Peer Video Communication</p>
                </header>

                <div className="main-layout">
                    <main className="glass-card main-card">
                        <form onSubmit={handleSubmit} className="home-form">
                            <div className="input-group">
                                <label><User size={16} /> Username</label>
                                <input 
                                    type="text" 
                                    placeholder="How should we call you?" 
                                    value={username}
                                    onChange={(e) => {
                                        setUsername(e.target.value);
                                        props.setUsername(e.target.value);
                                    }}
                                    required
                                />
                            </div>

                            {!isInviteLink && (
                                <>
                                    <div className="input-group">
                                        <label><Zap size={16} /> Room Name (Display)</label>
                                        <input 
                                            type="text" 
                                            placeholder="Enter meeting name" 
                                            value={roomName}
                                            onChange={(e) => setRoomName(e.target.value)}
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label><Zap size={16} /> Room ID</label>
                                        <div className="input-with-button">
                                            <input 
                                                type="text" 
                                                placeholder="Enter or generate ID" 
                                                value={roomID}
                                                onChange={(e) => setRoomID(e.target.value)}
                                                required
                                            />
                                            <button 
                                                type="button" 
                                                onClick={createRoom}
                                                className="icon-btn"
                                                title="Generate ID"
                                            >
                                                <ZapIcon size={18} />
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}

                            <button type="submit" className="primary-btn">
                                <span>{isInviteLink ? 'Join Room' : 'Start/Join Meeting'}</span>
                                <ArrowRight size={20} />
                            </button>
                            
                            {!isInviteLink && (
                                <button 
                                    type="button" 
                                    className="secondary-btn" 
                                    onClick={() => {
                                        setIsScheduling(true);
                                        setSchedRoomID(Math.random().toString(36).substring(2, 9));
                                    }}
                                    style={{ marginTop: '0.5rem', width: '100%', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)' }}
                                >
                                    <Calendar size={18} />
                                    <span>Schedule for Later</span>
                                </button>
                            )}
                        </form>
                    </main>

                    <aside className="glass-card lobby-card">
                        <div className="tabs-container">
                            <h3 style={{ marginBottom: '1rem' }}><Globe size={18} /> Lobby</h3>
                        </div>

                        <div className="lobby-section">
                            <h4 className="section-title">Active Rooms</h4>
                            <div className="online-list" style={{ marginBottom: '2rem' }}>
                                {(onlineRooms || []).length === 0 ? (
                                    <p className="empty-msg">No active rooms found.</p>
                                ) : (
                                    (onlineRooms || []).map(room => (
                                        <div key={room.roomID} className="online-user">
                                            <div className="room-info">
                                                <span className="room-id">{room.roomName || room.roomID}</span>
                                                <span className="admin-name">by {room.adminName}</span>
                                            </div>
                                            <div className="room-meta">
                                                <span className="user-count"><Users size={12} /> {room.userCount}/25</span>
                                                <button onClick={() => onRequestJoin(room)} className="call-btn">
                                                    Join
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        <div className="lobby-section">
                            <h4 className="section-title">Recent Participants</h4>
                            <div className="online-list" style={{ marginBottom: '2rem' }}>
                                {recentContacts.length === 0 ? (
                                    <p className="empty-msg">No recent participants yet.</p>
                                ) : (
                                    recentContacts.map((contactName, idx) => {
                                        const onlineUser = onlineUsers?.find(u => u.name === contactName);
                                        return (
                                            <div key={idx} className="online-user">
                                                <div className="room-info">
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span className="room-id">{contactName}</span>
                                                        {onlineUser && <span className="status-badge" style={{ backgroundColor: '#22c55e', padding: '1px 6px', borderRadius: '4px', fontSize: '10px' }}>Online</span>}
                                                    </div>
                                                    <span className="admin-name">Past collaborator</span>
                                                </div>
                                                <div className="room-meta" style={{ gap: '8px' }}>
                                                    {onlineUser && onlineUser.id !== socket?.id && (
                                                        <button 
                                                            onClick={() => callUser(onlineUser.id, onlineUser.name)}
                                                            className="call-btn mini"
                                                            style={{ fontSize: '11px', padding: '4px 10px' }}
                                                        >
                                                            Call
                                                        </button>
                                                    )}
                                                    <button 
                                                        onClick={() => clearRecentContact(contactName)}
                                                        className="trash-btn mini"
                                                        style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: '#ef4444', padding: '6px', borderRadius: '6px', cursor: 'pointer' }}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        <div className="lobby-section">
                            <h4 className="section-title">Upcoming Meetings</h4>
                            <div className="online-list">
                                {(scheduledMeetings || []).length === 0 ? (
                                    <p className="empty-msg">No scheduled meetings.</p>
                                ) : (
                                    (scheduledMeetings || []).map(meeting => (
                                        <div key={meeting.id} className="online-user scheduled-item">
                                            <div className="room-info">
                                                <span className="room-id">{meeting.title}</span>
                                                <div className="time-tag">
                                                    <Clock size={12} />
                                                    <span>{new Date(meeting.startTime).toLocaleString()}</span>
                                                </div>
                                            </div>
                                            <div className="room-meta">
                                                <button 
                                                    onClick={() => {
                                                        setRoomID(meeting.roomID);
                                                        setRoomName(meeting.title);
                                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                                    }} 
                                                    className="call-btn join"
                                                >
                                                    Select
                                                </button>
                                                {meeting.creator === username && (
                                                    <button onClick={() => deleteScheduled(meeting.id)} className="delete-icon-btn">
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </aside>
                </div>

                <section className="about-section glass-card">
                    <div className="disclaimer-badge">Institutional-Grade P2P Platform</div>
                    <h3>Nitro Calls for Education & Professional Use</h3>
                    <p className="about-subtitle">
                        Nitro Calls is a high-performance, secure peer-to-peer communication platform designed for educational institutions and professional teams. 
                        By utilizing direct browser-to-browser encryption, we ensure that sensitive academic or corporate data never touches our infrastructure.
                    </p>
                    
                    <div className="about-content">
                        <div className="about-item">
                            <div className="icon-wrapper">
                                <Shield size={24} />
                            </div>
                            <h4>End-to-End Privacy</h4>
                            <p>Direct bitstream encryption between participants. No intermediate processing, ensuring complete institutional privacy and data sovereignty.</p>
                        </div>
                        <div className="about-item">
                            <div className="icon-wrapper">
                                <Globe size={24} />
                            </div>
                            <h4>Scalable P2P Architecture</h4>
                            <p>Optimized for groups up to 25 participants, providing low-latency video and audio transmission across global networks.</p>
                        </div>
                        <div className="about-item">
                            <div className="icon-wrapper">
                                <Zap size={24} />
                            </div>
                            <h4>Zero-Trust Deployment</h4>
                            <p>Requires no local installation or administrative privileges. Seamlessly integrates into any existing institutional workflow via standard browsers.</p>
                        </div>
                        <div className="about-item">
                            <div className="icon-wrapper">
                                <ShieldCheck size={24} />
                            </div>
                            <h4>Compliant & Secure</h4>
                            <p>Strict adherence to modern security protocols. We do not collect, store, or log any personal identifiers or session data.</p>
                        </div>
                    </div>
                </section>

                <footer className="home-footer">
                    <div className="footer-links">
                        <a href="/privacy.html" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
                        <a href="/terms.html" target="_blank" rel="noopener noreferrer">Terms of Service</a>
                        <a href="/safety.html" target="_blank" rel="noopener noreferrer">Child Safety</a>
                        <a href="mailto:admin@nitrocalls.online">Contact Support</a>
                    </div>
                    <p className="copyright">
                        &copy; 2026 Nitro Calls. Secure Institutional Communication. 
                        Developed by <a href="https://www.instagram.com/jusifle/" target="_blank" rel="noopener noreferrer" className="jusifle-link">jusifle</a>
                    </p>
                </footer>
            </motion.div>

            {/* Schedule Modal */}
            {isScheduling && (
                <div className="call-modal schedule-modal" style={{ zIndex: 1100 }}>
                    <div className="glass-card schedule-card">
                        <div className="modal-header">
                            <h3><Calendar size={22} /> Schedule a Meeting</h3>
                            <button onClick={() => setIsScheduling(false)} className="close-btn">×</button>
                        </div>
                        <form onSubmit={handleSchedule} className="modal-form">
                            <div className="input-group">
                                <label>Meeting Title</label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. Weekly Sync" 
                                    value={schedTitle}
                                    onChange={(e) => setSchedTitle(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="input-group">
                                <label>Date & Time</label>
                                <input 
                                    type="datetime-local" 
                                    value={schedTime}
                                    onChange={(e) => setSchedTime(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="input-group">
                                <label>Custom Room ID (Optional)</label>
                                <input 
                                    type="text" 
                                    placeholder="Leave blank for random" 
                                    value={schedRoomID}
                                    onChange={(e) => setSchedRoomID(e.target.value)}
                                />
                            </div>
                            <div className="input-group">
                                <label>Invitee Emails (Comma separated)</label>
                                <input 
                                    type="email" 
                                    placeholder="e.g. user@example.com, friend@example.com" 
                                    value={invitees}
                                    onChange={(e) => setInvitees(e.target.value)}
                                    multiple
                                />
                            </div>
                            <div className="input-group checkbox-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }}>
                                <input 
                                    type="checkbox" 
                                    id="public-check"
                                    checked={isPublic}
                                    onChange={(e) => setIsPublic(e.target.checked)}
                                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                                />
                                <label htmlFor="public-check" style={{ marginBottom: 0, cursor: 'pointer' }}>Visible in Lobby (Public)</label>
                            </div>
                            <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginTop: '-0.5rem' }}>
                                If private, only those with the link can join.
                            </p>
                            <div className="modal-footer">
                                <button type="button" onClick={() => setIsScheduling(false)} className="cancel-btn">Cancel</button>
                                <button type="submit" className="confirm-btn">Confirm Schedule</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Home;
