import React, { useState, useRef, useEffect } from 'react';
import { Send, X, User } from 'lucide-react';

const Chat = ({ messages, onSendMessage, onClose }) => {
    const [msg, setMsg] = useState('');
    const scrollRef = useRef();

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

    return (
        <div className="chat-sidebar">
            <div className="chat-header">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-indigo-500/20 rounded-lg">
                        <User size={18} className="text-indigo-400" />
                    </div>
                    <span className="font-bold text-slate-100">Live Chat</span>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-slate-700/50 rounded-full transition-colors">
                    <X size={20} className="text-slate-400" />
                </button>
            </div>
            
            <div className="chat-messages-area">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500 opacity-50">
                        <p className="text-sm italic">No messages yet...</p>
                    </div>
                ) : (
                    messages.map((m, i) => (
                        <div key={i} className="message-bubble-wrapper">
                            <div className="message-info">
                                <span className="sender">{m.sender}</span>
                                <span className="time">{m.time}</span>
                            </div>
                            <div className="message-bubble">
                                {m.text}
                            </div>
                        </div>
                    ))
                )}
                <div ref={scrollRef} />
            </div>

            <form onSubmit={handleSubmit} className="chat-input-wrapper">
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
    );
};

export default Chat;
