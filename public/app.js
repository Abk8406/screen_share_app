// WebRTC configuration
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
    ]
};

let peerConnection = null;
let localStream = null;
let screenStream;
let socket;
let currentSharingUser = null;
let isSharing = false;
let isInitiator = false;
let remoteConnections = new Map();
let hasPendingOffer = false;

// Store ICE candidates until remote description is set
let pendingIceCandidates = [];

// Update UI based on connection status
function updateConnectionStatus(connected) {
    const statusElement = document.getElementById('connection-status');
    if (statusElement) {
        statusElement.textContent = connected ? 'Connected' : 'Disconnected';
        statusElement.style.color = connected ? 'green' : 'red';
    }
}

// Show message to user
function showMessage(message, type = 'info') {
    const messageElement = document.getElementById('message');
    if (messageElement) {
        messageElement.textContent = message;
        messageElement.className = `message ${type}`;
        messageElement.style.display = 'block';
        setTimeout(() => {
            messageElement.style.display = 'none';
        }, 5000);
    }
}

// Initialize Socket.IO connection
function initializeSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = window.location.port;
    const socketUrl = `${protocol}//${host}:${port}`;

    socket = io(socketUrl, {
        transports: ['websocket'],
        secure: window.location.protocol === 'https:',
        rejectUnauthorized: false // Only for development
    });

    socket.on('connect', () => {
        console.log('Connected to server');
        updateConnectionStatus(true);
        showMessage('Connected to server', 'success');
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        updateConnectionStatus(false);
        showMessage('Disconnected from server', 'error');
    });

    socket.on('error', (error) => {
        console.error('Socket error:', error);
        showMessage('Connection error: ' + error.message, 'error');
    });

    // Handle WebRTC signaling
    socket.on('offer', async (data) => {
        try {
            console.log('Received offer from:', data.sender);
            
            if (!peerConnection || peerConnection.signalingState === 'closed') {
                createPeerConnection();
            }
            
            if (peerConnection.signalingState !== 'stable') {
                console.log('Ignoring offer in non-stable state');
                return;
            }
            
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            console.log('Set remote description (offer)');
            
            const answer = await peerConnection.createAnswer();
            console.log('Created answer, setting local description');
            await peerConnection.setLocalDescription(answer);
            
            socket.emit('answer', { answer, target: data.sender });
            
        } catch (error) {
            console.error('Error handling offer:', error);
            showMessage('Error handling offer: ' + error.message, 'error');
        }
    });

    socket.on('answer', async (data) => {
        try {
            console.log('Received answer from:', data.sender);
            console.log('Current signaling state:', peerConnection?.signalingState);
            
            if (peerConnection && peerConnection.signalingState === 'have-local-offer') {
                console.log('Setting remote description (answer)');
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            } else {
                console.log('Ignoring answer in current state:', peerConnection?.signalingState);
            }
        } catch (error) {
            console.error('Error handling answer:', error);
            showMessage('Error handling answer: ' + error.message, 'error');
        }
    });

    socket.on('ice-candidate', async (data) => {
        try {
            if (peerConnection && peerConnection.remoteDescription) {
                console.log('Adding ICE candidate');
                await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            } else {
                console.log('Storing ICE candidate for later');
                pendingIceCandidates.push(data.candidate);
            }
        } catch (error) {
            console.error('Error handling ICE candidate:', error);
        }
    });

    socket.on('user-started-sharing', (userId) => {
        console.log('User started sharing:', userId);
        showMessage('Remote user started sharing');
    });

    socket.on('user-stopped-sharing', (userId) => {
        console.log('User stopped sharing:', userId);
        showMessage('Remote user stopped sharing');
    });
}

// Initialize UI
function initializeUI() {
    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton');
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    
    if (localVideo) {
        localVideo.style.width = '100%';
        localVideo.style.maxWidth = '800px';
        localVideo.style.display = 'none';
    }
    if (remoteVideo) {
        remoteVideo.style.width = '100%';
        remoteVideo.style.maxWidth = '800px';
        remoteVideo.style.display = 'none';
    }
    
    if (startButton && stopButton) {
        startButton.disabled = false;
        stopButton.disabled = true;
        updateConnectionStatus(false);
        
        startButton.addEventListener('click', startScreenSharing);
        stopButton.addEventListener('click', stopSharing);
    }
}

// Start screen sharing
async function startScreenSharing() {
    try {
        // Check if the browser supports screen sharing
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
            throw new Error('Your browser does not support screen sharing. Please use a modern browser like Chrome, Firefox, or Edge.');
        }

        // Check if we're in a secure context
        if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
            throw new Error('Screen sharing requires a secure context (HTTPS) or localhost.');
        }

        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: "always",
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            },
            audio: false
        });
        
        localStream = stream;
        isInitiator = true;
        
        // Update UI
        const startButton = document.getElementById('startButton');
        const stopButton = document.getElementById('stopButton');
        if (startButton) startButton.disabled = true;
        if (stopButton) stopButton.disabled = false;
        
        // Display local video
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.srcObject = stream;
            localVideo.style.display = 'block';
        }

        // Create peer connection and add stream
        createPeerConnection();
        
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
        
        // Create and send offer
        const offer = await peerConnection.createOffer();
        console.log('Created offer, setting local description');
        await peerConnection.setLocalDescription(offer);
        
        socket.emit('offer', { offer });
        showMessage('Screen sharing started', 'success');
        
    } catch (error) {
        console.error('Error starting screen sharing:', error);
        showMessage('Failed to start screen sharing: ' + error.message, 'error');
        
        // Reset UI state
        const startButton = document.getElementById('startButton');
        const stopButton = document.getElementById('stopButton');
        if (startButton) startButton.disabled = false;
        if (stopButton) stopButton.disabled = true;
    }
}

// Stop screen sharing
function stopSharing() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    isInitiator = false;
    hasPendingOffer = false;
    
    // Update UI
    const startButton = document.getElementById('startButton');
    const stopButton = document.getElementById('stopButton');
    if (startButton) startButton.disabled = false;
    if (stopButton) stopButton.disabled = true;
    
    // Clear video elements
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    if (localVideo) {
        localVideo.srcObject = null;
        localVideo.style.display = 'none';
    }
    if (remoteVideo) {
        remoteVideo.srcObject = null;
        remoteVideo.style.display = 'none';
    }
    
    socket.emit('stop-sharing');
    showMessage('Screen sharing stopped', 'info');
}

// Create peer connection
function createPeerConnection() {
    if (peerConnection) {
        peerConnection.close();
    }
    
    peerConnection = new RTCPeerConnection(configuration);

    // Log state changes
    peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', peerConnection.iceConnectionState);
    };

    peerConnection.onsignalingstatechange = () => {
        console.log('Signaling state:', peerConnection.signalingState);
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('Sending ICE candidate');
            socket.emit('ice-candidate', { candidate: event.candidate });
        }
    };

    peerConnection.ontrack = (event) => {
        console.log('Received remote track:', event.track.kind);
        const remoteVideo = document.getElementById('remoteVideo');
        if (remoteVideo && event.streams && event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            remoteVideo.style.display = 'block';
            showMessage('Remote stream received', 'success');
        }
    };

    // Add any pending ICE candidates
    pendingIceCandidates.forEach(candidate => {
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
            .catch(error => console.error('Error adding pending ICE candidate:', error));
    });
    pendingIceCandidates = [];

    return peerConnection;
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    initializeSocket();
    initializeUI();
}); 