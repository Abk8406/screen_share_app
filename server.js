const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const os = require('os');
const config = require('./config');
const helmet = require('helmet');
const compression = require('compression');

const app = express();

// Security middleware with modified CSP for WebRTC
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
            mediaSrc: ["'self'", "blob:"],
            connectSrc: ["'self'", "ws:", "wss:"],
            frameSrc: ["'self'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: []
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(compression());

// SSL configuration
let sslOptions;
try {
    sslOptions = {
        key: fs.readFileSync(config.ssl.key),
        cert: fs.readFileSync(config.ssl.cert)
    };
} catch (error) {
    console.warn('SSL certificates not found. Running in HTTP-only mode.');
    sslOptions = null;
}

// Create HTTP server
const httpServer = http.createServer(app);

// Create HTTPS server if SSL is available
let httpsServer = null;
if (sslOptions) {
    httpsServer = https.createServer(sslOptions, app);
}

// Get local IP address
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const devName in interfaces) {
        const iface = interfaces[devName];
        for (const alias of iface) {
            if (alias.family === 'IPv4' && !alias.internal) {
                return alias.address;
            }
        }
    }
    return 'localhost';
}

const localIP = getLocalIP();

// Configure CORS for Express
app.use(cors({
    origin: '*', // Allow all origins for development
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Handle preflight requests
app.options('*', cors());

// Configure Socket.IO with proper CORS and transport settings
const io = socketIo(httpsServer || httpServer, {
    cors: {
        origin: '*', // Allow all origins for development
        methods: ["GET", "POST", "OPTIONS"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
    path: config.socketPath,
    connectTimeout: 45000,
    maxHttpBufferSize: 1e8
});

// Serve static files with caching
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1d',
    etag: true,
    lastModified: true,
    setHeaders: (res, path) => {
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        } else if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        }
    }
}));

// Add basic Express route for testing
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Add health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok',
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime()
    });
});

// Store connected users and their rooms
const users = new Map();
const rooms = new Map();

// Handle Socket.IO connection errors
io.engine.on("connection_error", (err) => {
    console.log('Connection error:', err);
});

io.on('connect_error', (error) => {
    console.log('Socket.IO connection error:', error);
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    users.set(socket.id, { 
        id: socket.id,
        room: null,
        isSharing: false
    });
    
    // Send immediate response to verify connection
    socket.emit('connection-established', { id: socket.id });
    
    // Join a room
    socket.on('join-room', (roomId) => {
        const user = users.get(socket.id);
        if (user) {
            // Leave previous room if any
            if (user.room) {
                socket.leave(user.room);
                const room = rooms.get(user.room);
                if (room) {
                    room.delete(socket.id);
                    if (room.size === 0) {
                        rooms.delete(user.room);
                    }
                }
            }
            
            // Join new room
            socket.join(roomId);
            user.room = roomId;
            
            // Initialize room if it doesn't exist
            if (!rooms.has(roomId)) {
                rooms.set(roomId, new Set());
            }
            rooms.get(roomId).add(socket.id);
            
            // Notify room members
            io.to(roomId).emit('user-joined', {
                userId: socket.id,
                roomId: roomId
            });
            
            // Send room members list
            const roomMembers = Array.from(rooms.get(roomId)).map(id => ({
                id,
                isSharing: users.get(id)?.isSharing || false
            }));
            io.to(roomId).emit('room-members', roomMembers);
        }
    });
    
    // Handle screen sharing
    socket.on('start-sharing', (data) => {
        const user = users.get(socket.id);
        if (user && user.room) {
            user.isSharing = true;
            // Create and send offer to all room members
            io.to(user.room).emit('user-started-sharing', {
                userId: socket.id,
                roomId: user.room
            });
        }
    });
    
    socket.on('stop-sharing', (data) => {
        const user = users.get(socket.id);
        if (user && user.room) {
            user.isSharing = false;
            io.to(user.room).emit('user-stopped-sharing', {
                userId: socket.id,
                roomId: user.room
            });
        }
    });
    
    // Handle WebRTC signaling
    socket.on('offer', (data) => {
        const user = users.get(socket.id);
        if (user && user.room) {
            console.log('Offer received from:', socket.id, 'for room:', user.room);
            // Send offer to target user
            socket.to(data.target).emit('offer', {
                offer: data.offer,
                sender: socket.id,
                roomId: user.room
            });
        }
    });
    
    socket.on('answer', (data) => {
        const user = users.get(socket.id);
        if (user && user.room) {
            console.log('Answer received from:', socket.id, 'for room:', user.room);
            // Send answer to target user
            socket.to(data.target).emit('answer', {
                answer: data.answer,
                sender: socket.id,
                roomId: user.room
            });
        }
    });
    
    socket.on('ice-candidate', (data) => {
        const user = users.get(socket.id);
        if (user && user.room) {
            console.log('ICE candidate received from:', socket.id, 'for room:', user.room);
            // Send ICE candidate to target user
            socket.to(data.target).emit('ice-candidate', {
                candidate: data.candidate,
                sender: socket.id,
                roomId: user.room
            });
        }
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        const user = users.get(socket.id);
        if (user && user.room) {
            // Notify room members
            socket.to(user.room).emit('user-left', {
                userId: socket.id,
                roomId: user.room
            });
            
            // Remove user from room
            const room = rooms.get(user.room);
            if (room) {
                room.delete(socket.id);
                if (room.size === 0) {
                    rooms.delete(user.room);
                }
            }
        }
        users.delete(socket.id);
    });

    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
});

// Handle server errors
httpServer.on('error', (error) => {
    console.error('HTTP Server error:', error);
});

if (httpsServer) {
    httpsServer.on('error', (error) => {
        console.error('HTTPS Server error:', error);
    });
}

// Start servers
httpServer.listen(config.httpPort, '0.0.0.0', () => {
    console.log(`HTTP Server running on port ${config.httpPort}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Access the application at:`);
    console.log(`Local: http://localhost:${config.httpPort}`);
    console.log(`Network: http://${getLocalIP()}:${config.httpPort}`);
});

if (httpsServer) {
    httpsServer.listen(config.httpsPort, '0.0.0.0', () => {
        console.log(`HTTPS Server running on port ${config.httpsPort}`);
        console.log(`Access the application at:`);
        console.log(`Local: https://localhost:${config.httpsPort}`);
        console.log(`Network: https://${getLocalIP()}:${config.httpsPort}`);
    });
} 