import React, { useRef, useEffect, useState } from 'react';
import { X, Eraser, Pencil, Download, Trash2, Edit3, Minus, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Whiteboard = ({ onClose, socket, roomID, isOpener, onStreamReady }) => {
    const canvasRef = useRef(null);
    const contextRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [color, setColor] = useState('#ffffff');
    const [lineWidth, setLineWidth] = useState(4);
    const [tool, setTool] = useState('pencil'); // pencil, eraser

    // Base resolution for sync — ensures consistent drawing across devices
    const BASE_WIDTH = 1600;
    const BASE_HEIGHT = 900;

    const colors = [
        '#ffffff', '#f87171', '#fbbf24', '#34d399', 
        '#60a5fa', '#a78bfa', '#f472b6', '#94a3b8'
    ];

    const drawingHistoryRef = useRef([]);
    const resizeTimeoutRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        
        const redrawCanvas = () => {
            if (!ctx) return;
            ctx.clearRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
            
            // Reapply settings because resize wipes them
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            drawingHistoryRef.current.forEach(data => {
                ctx.strokeStyle = data.color;
                ctx.lineWidth = data.width;
                ctx.beginPath();
                ctx.moveTo(data.lastX, data.lastY);
                ctx.lineTo(data.x, data.y);
                ctx.stroke();
            });

            // Restore current local settings
            ctx.strokeStyle = tool === 'eraser' ? '#0f172a' : color;
            ctx.lineWidth = lineWidth;
        };

        const resizeCanvas = () => {
            const container = canvas.parentElement;
            if (!container) return;
            const { width, height } = container.getBoundingClientRect();
            
            // Set display size
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            
            // Set internal resolution (highres fixed base)
            canvas.width = BASE_WIDTH;
            canvas.height = BASE_HEIGHT;
            
            redrawCanvas();
            contextRef.current = ctx;
        };

        const handleRemoteDraw = (data) => {
            drawingHistoryRef.current.push(data);
            const c = contextRef.current;
            if (!c) return;

            const oldStroke = c.strokeStyle;
            const oldWidth = c.lineWidth;

            c.strokeStyle = data.color;
            c.lineWidth = data.width;
            c.beginPath();
            c.moveTo(data.lastX, data.lastY);
            c.lineTo(data.x, data.y);
            c.stroke();

            c.strokeStyle = oldStroke;
            c.lineWidth = oldWidth;
        };

        const handleHistory = (history) => {
            drawingHistoryRef.current = history;
            redrawCanvas();
        };

        const handleClear = () => {
            drawingHistoryRef.current = [];
            if (contextRef.current) {
                contextRef.current.clearRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
            }
        };

        resizeCanvas();

        // If this user is the opener, stream the canvas through WebRTC
        if (isOpener && onStreamReady && canvas.captureStream) {
            const canvasStream = canvas.captureStream(30);
            onStreamReady(canvasStream);
        }
        
        const debouncedResize = () => {
            clearTimeout(resizeTimeoutRef.current);
            resizeTimeoutRef.current = setTimeout(resizeCanvas, 100);
        };

        window.addEventListener('resize', debouncedResize);

        if (socket) {
            socket.on('remote-draw', handleRemoteDraw);
            socket.on('clear-whiteboard', handleClear);
            socket.on('whiteboard-history', handleHistory);
            socket.emit('request-whiteboard-data');
        }

        return () => {
            window.removeEventListener('resize', debouncedResize);
            if (socket) {
                socket.off('remote-draw', handleRemoteDraw);
                socket.off('clear-whiteboard', handleClear);
                socket.off('whiteboard-history', handleHistory);
            }
        };
    }, [socket, roomID]);

    useEffect(() => {
        if (contextRef.current) {
            contextRef.current.strokeStyle = tool === 'eraser' ? '#0f172a' : color;
            contextRef.current.lineWidth = lineWidth;
        }
    }, [color, lineWidth, tool]);

    const getMousePos = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        let clientX, clientY;
        if (e.touches && e.touches[0]) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    };

    const startDrawing = (e) => {
        const { x, y } = getMousePos(e.nativeEvent);
        setIsDrawing(true);
        contextRef.current.lastX = x;
        contextRef.current.lastY = y;
    };

    const draw = (e) => {
        if (!isDrawing) return;
        const { x, y } = getMousePos(e.nativeEvent);
        const ctx = contextRef.current;
        const lastX = ctx.lastX;
        const lastY = ctx.lastY;

        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
        ctx.stroke();

        const drawData = {
            x, y, lastX, lastY,
            color: ctx.strokeStyle,
            width: ctx.lineWidth
        };

        drawingHistoryRef.current.push(drawData);

        if (socket) {
            socket.emit('draw', drawData);
        }

        ctx.lastX = x;
        ctx.lastY = y;
    };

    const stopDrawing = () => {
        setIsDrawing(false);
    };

    const clearCanvas = () => {
        const ctx = contextRef.current;
        ctx.clearRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
        if (socket) socket.emit('clear-whiteboard');
    };

    const downloadBoard = () => {
        const canvas = canvasRef.current;
        const image = canvas.toDataURL("image/png");
        const link = document.createElement('a');
        link.download = `nitro-board-${new Date().getTime()}.png`;
        link.href = image;
        link.click();
    };

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="whiteboard-modal"
        >
            {/* Header / Brand */}
            <div className="board-header-premium">
                <div className="logo-section">
                    <Edit3 size={24} className="text-indigo-400" />
                    <span>Institutional Drawing Board</span>
                </div>
                <button onClick={onClose} className="exit-board-btn">
                    <X size={20} />
                    <span>{isOpener ? 'Close for Everyone' : 'Exit Board'}</span>
                </button>
            </div>

            {/* Floating Toolbar */}
            <div className="floating-toolbar-wrapper">
                <div className="premium-toolbar">
                    {/* Tool Group */}
                    <div className="tool-group-v">
                        <button 
                            onClick={() => setTool('pencil')}
                            className={`tool-icon-btn ${tool === 'pencil' ? 'active' : ''}`}
                        >
                            <Pencil size={20} />
                        </button>
                        <button 
                            onClick={() => setTool('eraser')}
                            className={`tool-icon-btn ${tool === 'eraser' ? 'active' : ''}`}
                        >
                            <Eraser size={20} />
                        </button>
                    </div>

                    <div className="v-line" />

                    {/* Color Swatches */}
                    <div className="swatch-group">
                        {colors.map(c => (
                            <button 
                                key={c}
                                onClick={() => { setColor(c); setTool('pencil'); }}
                                className={`swatch-btn ${color === c && tool === 'pencil' ? 'selected' : ''}`}
                                style={{ backgroundColor: c }}
                            />
                        ))}
                    </div>

                    <div className="v-line" />

                    {/* Size Control */}
                    <div className="size-control-group">
                        <span className="size-label">Size</span>
                        <div className="slider-wrapper">
                            <input 
                                type="range" 
                                min="1" max="25" 
                                value={lineWidth} 
                                onChange={(e) => setLineWidth(parseInt(e.target.value))}
                                className="range-slider-premium"
                            />
                            <span className="current-size">{lineWidth}px</span>
                        </div>
                    </div>

                    <div className="v-line" />

                    {/* Meta Controls */}
                    <div className="meta-group">
                        <button onClick={downloadBoard} className="meta-icon-btn" title="Export PNG">
                            <Download size={20} />
                        </button>
                        <button onClick={clearCanvas} className="meta-icon-btn clear" title="Clear Canvas">
                            <Trash2 size={20} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="board-canvas-wrapper" onTouchMove={(e) => e.preventDefault()}>
                <canvas 
                    ref={canvasRef}
                    onMouseDown={isOpener ? startDrawing : undefined}
                    onMouseMove={isOpener ? draw : undefined}
                    onMouseUp={isOpener ? stopDrawing : undefined}
                    onMouseLeave={isOpener ? stopDrawing : undefined}
                    onTouchStart={isOpener ? startDrawing : undefined}
                    onTouchMove={isOpener ? draw : undefined}
                    onTouchEnd={isOpener ? stopDrawing : undefined}
                />
            </div>
        </motion.div>
    );
};

export default Whiteboard;
