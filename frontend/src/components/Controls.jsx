import React, { useState } from 'react';
import { Mic, MicOff, Video, VideoOff, LogOut, Monitor, MessageSquare, Hand, Smile, Users, XCircle, Link } from 'lucide-react';

const Controls = ({ stream, onLeave, onShareScreen, onToggleChat, onToggleParticipants, onRaiseHand, onShowEmojis, onInvite, isHandRaised, isModerator, onCloseMeeting }) => {
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
                onClick={onRaiseHand} 
                className={`control-btn ${isHandRaised ? 'active' : ''}`}
                title="Raise Hand"
                style={isHandRaised ? { backgroundColor: '#f59e0b' } : {}}
            >
                <Hand size={24} />
            </button>

            <button 
                onClick={onShowEmojis} 
                className="control-btn"
                title="Reactions"
            >
                <Smile size={24} />
            </button>

            <button 
                onClick={onInvite} 
                className="control-btn"
                title="Copy Invite Link"
            >
                <Link size={24} />
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
                onClick={onToggleParticipants} 
                className="control-btn"
                title="Participants"
            >
                <Users size={24} />
            </button>

            <button 
                onClick={onLeave} 
                className="control-btn leave-btn"
                title="Leave Call"
            >
                <LogOut size={24} />
            </button>

            {isModerator && (
                <button 
                    onClick={onCloseMeeting} 
                    className="control-btn end-meeting-btn"
                    title="End Meeting for All"
                    style={{ backgroundColor: '#ef4444' }}
                >
                    <XCircle size={24} />
                </button>
            )}
        </div>
    );
};

export default Controls;
