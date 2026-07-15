import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Video, VideoOff, LogOut, Monitor, MonitorUp, MessageSquare, Hand, Smile, Users, XCircle, Link, RefreshCcw, Edit3, Circle } from 'lucide-react';

const Controls = ({ stream, onLeave, onShareScreen, onToggleChat, onToggleParticipants, onRaiseHand, onShowEmojis, onInvite, isHandRaised, isModerator, onCloseMeeting, isChatOpen, initialMicOn, initialCameraOn, onToggleCamera, onSwitchCamera, isMutedByMod, onSelfUnmute, onToggleWhiteboard, isWhiteboardOpen, isRecording, onToggleRecording }) => {
    const [micOn, setMicOn] = useState(initialMicOn !== false);
    const [cameraOn, setCameraOn] = useState(initialCameraOn !== false);

    const toggleMic = () => {
        if (isMutedByMod) {
            // Self-unmute from mod mute
            if (stream && stream.getAudioTracks().length > 0) {
                stream.getAudioTracks()[0].enabled = true;
            }
            setMicOn(true);
            if (onSelfUnmute) onSelfUnmute();
            return;
        }
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
            const isNowOff = cameraOn;
            setCameraOn(!cameraOn);
            if (onToggleCamera) onToggleCamera(isNowOff);
        } else {
            console.warn("No video track found to toggle");
        }
    };

    // Sync micOn state when muted by mod externally
    useEffect(() => {
        if (isMutedByMod) {
            setMicOn(false);
        }
    }, [isMutedByMod]);




    const micBtnStyle = isMutedByMod
        ? { 
            backgroundColor: '#ef4444', 
            boxShadow: '0 0 16px rgba(239,68,68,0.7)', 
            animation: 'mutedPulse 1.5s ease-in-out infinite' 
          }
        : {};

    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth <= 768);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    return (
        <div className="controls-bar">
            <button 
                onClick={toggleMic} 
                className={`control-btn ${(!micOn || isMutedByMod) ? 'active' : ''}`}
                title={isMutedByMod ? 'Muted by moderator — click to unmute' : micOn ? 'Mute' : 'Unmute'}
                style={micBtnStyle}
            >
                {(micOn && !isMutedByMod) ? <Mic size={24} /> : <MicOff size={24} />}
            </button>
            
            <button 
                onClick={toggleCamera} 
                className={`control-btn ${!cameraOn ? 'active' : ''}`}
                title={cameraOn ? 'Turn Camera Off' : 'Turn Camera On'}
            >
                {cameraOn ? <Video size={24} /> : <VideoOff size={24} />}
            </button>

            <button 
                onClick={onToggleRecording} 
                className={`control-btn rec-btn ${isRecording ? 'recording' : ''}`}
                title={isRecording ? 'Kaydı Durdur' : 'Kaydı Başlat'}
                style={{ 
                    display: 'flex', 
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    padding: '8px 12px',
                    backgroundColor: isRecording ? '#ef4444' : 'rgba(255, 255, 255, 0.05)',
                    border: isRecording ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: isRecording ? '0 0 20px rgba(239, 68, 68, 0.4)' : 'none',
                    animation: isRecording ? 'pulse 1.5s infinite ease-in-out' : 'none',
                }}
            >
                {isRecording ? <div className="rec-dot-pulse" style={{ width: 10, height: 10, backgroundColor: 'white', borderRadius: '50%', marginRight: 4 }} /> : null}
                <span style={{ fontSize: '12px', fontWeight: '800', letterSpacing: '0.05em', color: isRecording ? 'white' : '#ef4444' }}>
                    {isRecording ? 'STOP' : 'REC'}
                </span>
            </button>

            {isMobile && onSwitchCamera && cameraOn && (
                <button 
                    onClick={onSwitchCamera} 
                    className="control-btn"
                    title="Switch Camera"
                >
                    <RefreshCcw size={24} />
                </button>
            )}

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
                title="Dəvət Linkini Köçür"
            >
                <Link size={24} />
            </button>

            {!isMobile && (
                <button 
                    onClick={onShareScreen} 
                    className={`control-btn desktop-only ${isWhiteboardOpen ? 'active' : ''}`}
                    title="Share Menu"
                    style={isWhiteboardOpen ? { backgroundColor: '#6366f1' } : {}}
                >
                    <MonitorUp size={24} />
                </button>
            )}

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
                    title="İclası Hamı Üçün Bağla"
                    style={{ backgroundColor: '#ef4444' }}
                >
                    <XCircle size={24} />
                </button>
            )}
        </div>
    );
};

export default Controls;

