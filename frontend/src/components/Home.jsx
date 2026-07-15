import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Video, Zap, User, ArrowRight, Shield, Globe, Zap as ZapIcon, Users } from 'lucide-react';

const Home = (props) => {
    const { onJoin, onCreate, socket, onlineRooms, onRequestJoin, username, setUsername } = props;
    const [roomID, setRoomID] = useState('');
    const [roomName, setRoomName] = useState('');
    const [isInviteLink, setIsInviteLink] = useState(false);

    React.useEffect(() => {
        const queryParams = new URLSearchParams(window.location.search);
        const roomFromUrl = queryParams.get('room');
        if (roomFromUrl) {
            setRoomID(roomFromUrl);
            setIsInviteLink(true);
            const savedName = localStorage.getItem('nitro_username');
            if (savedName) {
                onJoin(roomFromUrl, savedName);
            }
        }
    }, [onJoin]);

    // Join lobby when username is available
    React.useEffect(() => {
        if (username && props.socket) {
            props.socket.emit("lobby-join", username);
        }
    }, [username, props.socket]);

    const handleSubmit = (e) => {
        e.preventDefault();
        
        if (roomID && username) {
            onCreate(roomID, username, roomName || roomID);
        }
    };

    const createRoom = () => {
        const id = Math.random().toString(36).substring(2, 9);
        setRoomID(id);
    };

    return (
        <div className="home-container">
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
                <header className="home-header">
                    <div className="logo-container">
                        <div className="logo-icon">
                            <Video size={32} />
                        </div>
                        <h1>Nitro Call</h1>
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
                        </form>
                    </main>

                    <aside className="glass-card lobby-card">
                        <h3><Globe size={18} /> Active Rooms</h3>
                        <div className="online-list">
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
                                            <span className="user-count"><Users size={12} /> {room.userCount}/10</span>
                                            <button onClick={() => onRequestJoin(room)} className="call-btn">
                                                Join
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </aside>
                </div>

                <footer className="home-features">
                    <div className="feature">
                        <Shield size={20} />
                        <span>Secure P2P</span>
                    </div>
                    <div className="feature">
                        <Globe size={20} />
                        <span>No Install</span>
                    </div>
                    <div className="feature">
                        <ZapIcon size={20} />
                        <span>Low Latency</span>
                    </div>
                </footer>
            </motion.div>
        </div>
    );
};

export default Home;
