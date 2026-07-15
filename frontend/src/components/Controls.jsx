import React, { useState } from 'react';
import { Mic, MicOff, Video, VideoOff, LogOut, Monitor, MessageSquare } from 'lucide-react';

const Controls = ({ stream, onLeave, onShareScreen, onToggleChat }) => {
    const [micOn, setMicOn] = useState(true);
    const [cameraOn, setCameraOn] = useState(true);

    const toggleMic = () => {
        if (stream && stream.getAudioTracks().length > 0) {
            const track = stream.getAudioTracks()[0];
            track.enabled = !micOn;
            setMicOn(!micOn);
        } else {
            console.warn("No audio track found to toggle");
        }
    };

    const toggleCamera = () => {
        if (stream && stream.getVideoTracks().length > 0) {
            const track = stream.getVideoTracks()[0];
            track.enabled = !cameraOn;
            setCameraOn(!cameraOn);
        } else {
            console.warn("No video track found to toggle");
        }
    };

    return (
        <div className="controls-bar">
            <button 
                onClick={toggleMic} 
                className={`control-btn ${!micOn ? 'active' : ''}`}
                title={micOn ? 'Mute' : 'Unmute'}
            >
                {micOn ? <Mic size={24} /> : <MicOff size={24} />}
            </button>
            
            <button 
                onClick={toggleCamera} 
                className={`control-btn ${!cameraOn ? 'active' : ''}`}
                title={cameraOn ? 'Turn Camera Off' : 'Turn Camera On'}
            >
                {cameraOn ? <Video size={24} /> : <VideoOff size={24} />}
            </button>

            <button 
                onClick={onShareScreen} 
                className="control-btn"
                title="Share Screen"
            >
                <Monitor size={24} />
            </button>

            <button 
                onClick={onToggleChat} 
                className="control-btn"
                title="Chat"
            >
                <MessageSquare size={24} />
            </button>

            <button 
                onClick={onLeave} 
                className="control-btn leave-btn"
                title="Leave Call"
            >
                <LogOut size={24} />
            </button>
        </div>
    );
};

export default Controls;
