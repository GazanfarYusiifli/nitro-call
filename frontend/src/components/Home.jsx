import React, { useState } from 'react';
import { Video, Zap } from 'lucide-react';

const Home = ({ onJoin }) => {
    const [roomID, setRoomID] = useState('');
    const [username, setUsername] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (roomID && username) {
            onJoin(roomID, username);
        }
    };

    const createRoom = () => {
        const id = Math.random().toString(36).substring(2, 9);
        setRoomID(id);
    };

    return (
        <div className="home-container">
            <div className="flex items-center gap-2 mb-4">
                <Video className="text-indigo-500 w-10 h-10" />
                <h1 className="text-4xl font-bold tracking-tight">Nitro Call</h1>
            </div>
            
            <div className="glass-card">
                <h2 className="text-xl font-semibold text-center mb-4">Join or Create Room</h2>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <input 
                        type="text" 
                        placeholder="Your Username" 
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                    />
                    <div className="flex gap-2">
                        <input 
                            type="text" 
                            placeholder="Room ID" 
                            value={roomID}
                            onChange={(e) => setRoomID(e.target.value)}
                            required
                        />
                        <button 
                            type="button" 
                            onClick={createRoom}
                            className="bg-slate-700 px-4 rounded-lg hover:bg-slate-600 transition-colors"
                        >
                            <Zap size={20} />
                        </button>
                    </div>
                    <button type="submit" className="primary">
                        Enter Room
                    </button>
                </form>
            </div>

            <p className="text-slate-400 text-sm">
                Secure, peer-to-peer, real-time video calls.
            </p>
        </div>
    );
};

export default Home;
