import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Send, X, Paperclip, FileText, Download } from 'lucide-react';

const Chat = ({ messages, onSendMessage, onClose, onSendFile }) => {
    const [msg, setMsg] = useState('');
    const scrollRef = useRef();
    const fileInputRef = useRef();

    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (msg.trim()) {
            onSendMessage(msg);
            setMsg('');
        }
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // For professional use, we'll use base64 for simplicity in this demo, 
        // or a real professional implementation would use P2P data channels or cloud storage.
        const reader = new FileReader();
        reader.onload = (event) => {
            onSendFile({
                name: file.name,
                type: file.type,
                size: file.size,
                data: event.target.result // base64
            });
        };
        reader.readAsDataURL(file);
        e.target.value = ''; // clear input
    };

    return (
        <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className="chat-sidebar"
        >
            <div className="chat-header-simple">
                <div className="header-left">
                    <h3 className="chat-title">Chat</h3>
                </div>
                <button onClick={onClose} className="close-sidebar-btn" aria-label="Close">
                    <X size={18} />
                </button>
            </div>
            
            <div className="chat-messages-area">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500 opacity-50">
                        <p className="text-sm italic">No messages yet...</p>
                    </div>
                ) : (
                    messages.map((m, i) => (
                        <div key={i} className={`message-bubble-wrapper ${m.type === 'spoken' ? 'spoken' : ''}`}>
                            <div className="message-info">
                                <span className="sender">{m.sender} {m.type === 'spoken' && <span className="spoken-badge">🎙️ Spoken</span>}</span>
                                <span className="time">{m.time}</span>
                            </div>
                            <div className="message-bubble">
                                {m.file ? (
                                    <div className="message-file">
                                        <div className="file-info">
                                            <FileText size={16} />
                                            <span>{m.file.name}</span>
                                            <span style={{ opacity: 0.5 }}>({(m.file.size / 1024).toFixed(1)} KB)</span>
                                        </div>
                                        <a href={m.file.data} download={m.file.name} className="download-link">
                                            <Download size={14} /> Download File
                                        </a>
                                    </div>
                                ) : (
                                    <div className="text-content">{m.text}</div>
                                )}
                            </div>
                        </div>
                    ))
                )}
                <div ref={scrollRef} />
            </div>

            <div className="chat-input-wrapper">
                <input 
                    type="file" 
                    id="file-upload" 
                    className="hidden" 
                    onChange={handleFileChange}
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                />
                <label htmlFor="file-upload" className="file-upload-label" title="Send Document">
                    <Paperclip size={18} />
                </label>
                <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', gap: '0.5rem' }}>
                    <input 
                        type="text" 
                        placeholder="Type message..." 
                        value={msg}
                        onChange={(e) => setMsg(e.target.value)}
                        className="chat-input"
                    />
                    <button type="submit" className="chat-send-btn">
                        <Send size={18} />
                    </button>
                </form>
            </div>
        </motion.div>
    );
};

export default Chat;
