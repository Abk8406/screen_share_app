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

// Security middleware
app.use(helmet());
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
    origin: config.corsOrigin,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Handle preflight requests
app.options('*', cors());

// Configure Socket.IO with proper CORS and transport settings
const io = socketIo(httpsServer || httpServer, {
    cors: {
        origin: config.corsOrigin,
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
    lastModified: true
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

// Store connected users
const users = new Map();

// Handle Socket.IO connection errors
io.engine.on("connection_error", (err) => {
    console.log('Connection error:', err);
});

io.on('connect_error', (error) => {
    console.log('Socket.IO connection error:', error);
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    users.set(socket.id, { id: socket.id });
    
    // Send immediate response to verify connection
    socket.emit('connection-established', { id: socket.id });
    
    // Broadcast user list to all clients
    io.emit('user-list', Array.from(users.values()));
    
    // Handle screen sharing
    socket.on('start-sharing', () => {
        console.log('User started sharing:', socket.id);
        socket.broadcast.emit('user-started-sharing', socket.id);
    });
    
    socket.on('stop-sharing', () => {
        console.log('User stopped sharing:', socket.id);
        socket.broadcast.emit('user-stopped-sharing', socket.id);
    });
    
    // Handle WebRTC signaling
    socket.on('offer', (data) => {
        console.log('Offer received from:', socket.id);
        socket.broadcast.emit('offer', {
            offer: data.offer,
            sender: socket.id
        });
    });
    
    socket.on('answer', (data) => {
        console.log('Answer received from:', socket.id);
        if (data.target) {
            io.to(data.target).emit('answer', {
                answer: data.answer,
                sender: socket.id
            });
        } else {
            socket.broadcast.emit('answer', {
                answer: data.answer,
                sender: socket.id
            });
        }
    });
    
    socket.on('ice-candidate', (data) => {
        console.log('ICE candidate received from:', socket.id);
        socket.broadcast.emit('ice-candidate', {
            candidate: data.candidate,
            sender: socket.id
        });
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        users.delete(socket.id);
        io.emit('user-list', Array.from(users.values()));
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