import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mic, MicOff, Video, VideoOff, User, UserMinus } from 'lucide-react';

const ParticipantList = ({ participants, currentUser, onClose, isModerator, onKick, onMute }) => {
    return (
        <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className="chat-sidebar participant-list"
        >
            <div className="chat-header">
                <h3>Participants ({participants.length + 1})</h3>
                <button onClick={onClose} className="p-3 hover:bg-slate-700/50 rounded-lg transition-colors flex items-center gap-1" aria-label="Close participants">
                    <span className="text-sm font-medium text-slate-400 mr-2 md:hidden">Close</span>
                    <X size={24} className="text-slate-400" />
                </button>
            </div>
            
            <div className="participants-area">
                <div className="participant-item me">
                    <div className="participant-info">
                        <div className="avatar">
                            <User size={16} />
                        </div>
                        <span>{currentUser} (You)</span>
                    </div>
                </div>

                {participants.map(p => (
                    <div key={p.peerID} className="participant-item">
                        <div className="participant-info">
                            <div className="avatar">
                                <User size={16} />
                            </div>
                            <span>{p.username}</span>
                        </div>
                        <div className="participant-actions">
                            {isModerator && (
                                <>
                                    <button 
                                        onClick={() => onMute(p.peerID)}
                                        className="mod-action-btn mute"
                                        title="Mute User"
                                    >
                                        <MicOff size={16} />
                                    </button>
                                    <button 
                                        onClick={() => onKick(p.peerID)}
                                        className="mod-action-btn kick"
                                        title="Kick User"
                                    >
                                        <UserMinus size={16} />
                                    </button>
                                </>
                            )}
                            {p.status === 'connected' ? <span className="status-badge connected">Live</span> : <span className="status-badge connecting">...</span>}
                        </div>
                    </div>
                ))}
            </div>
        </motion.div>
    );
};

export default ParticipantList;
