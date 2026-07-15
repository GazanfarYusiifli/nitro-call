import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const EMOJIS = ['🔥', '❤️', '👏', '😂', '😮', '👍'];

const EmojiPanel = ({ onSelect, onClose }) => {
    return (
        <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            className="emoji-panel"
        >
            {EMOJIS.map(emoji => (
                <button 
                    key={emoji} 
                    onClick={() => {
                        onSelect(emoji);
                        onClose();
                    }}
                    className="emoji-btn"
                >
                    {emoji}
                </button>
            ))}
        </motion.div>
    );
};

export default EmojiPanel;
