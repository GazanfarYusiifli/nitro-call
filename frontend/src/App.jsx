import React, { useState } from 'react';
import Home from './components/Home';
import Room from './components/Room';

function App() {
    const [roomID, setRoomID] = useState(null);
    const [username, setUsername] = useState('');

    if (roomID) {
        return <Room roomID={roomID} username={username} onLeave={() => setRoomID(null)} />;
    }

    return <Home onJoin={(id, name) => {
        setRoomID(id);
        setUsername(name);
    }} />;
}

export default App;
