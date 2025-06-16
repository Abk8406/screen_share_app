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

// DOM Elements
const roomInput = document.getElementById('roomInput');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const startSharingBtn = document.getElementById('startSharingBtn');
const stopSharingBtn = document.getElementById('stopSharingBtn');
const roomMembersList = document.getElementById('roomMembersList');
const screenPreview = document.getElementById('screenPreview');

let peerConnections = {};
let roomId = null;
let currentRoomMembers = new Set();

// Update UI based on connection status
function updateConnectionStatus(connected) {
    const connectionStatus = document.getElementById('connectionStatus');
    if (!connectionStatus) return;

    connectionStatus.textContent = connected ? 'Connected' : 'Disconnected';
    connectionStatus.className = `status ${connected ? 'connected' : 'disconnected'}`;
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
    socket = io({
        path: '/socket.io/',
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
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

    socket.on('connection-established', (data) => {
        console.log('Connection established:', data);
    });

    socket.on('user-joined', (data) => {
        console.log('User joined:', data);
        if (data.roomId === roomId) {
            currentRoomMembers.add(data.userId);
            updateRoomMembersList(Array.from(currentRoomMembers).map(id => ({
                id,
                isSharing: id === data.userId ? false : (peerConnections[id]?.isSharing || false)
            })));
        }
    });

    socket.on('user-left', (data) => {
        console.log('User left:', data);
        if (data.roomId === roomId) {
            currentRoomMembers.delete(data.userId);
            if (peerConnections[data.userId]) {
                peerConnections[data.userId].close();
                delete peerConnections[data.userId];
            }
            updateRoomMembersList(Array.from(currentRoomMembers).map(id => ({
                id,
                isSharing: peerConnections[id]?.isSharing || false
            })));
        }
    });

    socket.on('room-members', (members) => {
        console.log('Room members:', members);
        currentRoomMembers = new Set(members.map(m => m.id));
        updateRoomMembersList(members);
    });

    socket.on('user-started-sharing', (data) => {
        console.log('User started sharing:', data);
        if (data.userId !== socket.id && data.roomId === roomId) {
            console.log('Creating peer connection for sharing user:', data.userId);
            const pc = createPeerConnection(data.userId);
            peerConnections[data.userId] = pc;
        }
    });

    socket.on('user-stopped-sharing', (data) => {
        console.log('User stopped sharing:', data);
        if (data.roomId === roomId && peerConnections[data.userId]) {
            peerConnections[data.userId].close();
            delete peerConnections[data.userId];
            updateRoomMembersList(Array.from(currentRoomMembers).map(id => ({
                id,
                isSharing: id === data.userId ? false : (peerConnections[id]?.isSharing || false)
            })));
        }
    });

    // WebRTC signaling handlers
    socket.on('offer', async (data) => {
        console.log('Received offer:', data);
        if (data.sender !== socket.id && data.roomId === roomId) {
            try {
                console.log('Creating peer connection for offer sender:', data.sender);
                const pc = createPeerConnection(data.sender);
                peerConnections[data.sender] = pc;
                
                console.log('Setting remote description');
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                
                console.log('Creating answer');
                const answer = await pc.createAnswer();
                
                console.log('Setting local description');
                await pc.setLocalDescription(answer);
                
                console.log('Sending answer to:', data.sender);
                socket.emit('answer', {
                    answer: answer,
                    target: data.sender,
                    roomId: roomId
                });
            } catch (error) {
                console.error('Error handling offer:', error);
            }
        }
    });

    socket.on('answer', async (data) => {
        console.log('Received answer:', data);
        if (data.sender !== socket.id && data.roomId === roomId && peerConnections[data.sender]) {
            try {
                console.log('Setting remote description from answer');
                await peerConnections[data.sender].setRemoteDescription(new RTCSessionDescription(data.answer));
                console.log('Remote description set successfully');
            } catch (error) {
                console.error('Error handling answer:', error);
            }
        }
    });

    socket.on('ice-candidate', async (data) => {
        console.log('Received ICE candidate:', data);
        if (data.sender !== socket.id && data.roomId === roomId && peerConnections[data.sender]) {
            try {
                console.log('Adding ICE candidate');
                await peerConnections[data.sender].addIceCandidate(new RTCIceCandidate(data.candidate));
                console.log('ICE candidate added successfully');
            } catch (error) {
                console.error('Error adding ICE candidate:', error);
            }
        }
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
        
        startButton.addEventListener('click', startSharing);
        stopButton.addEventListener('click', stopSharing);
    }
}

// Join room
async function joinRoom() {
    const newRoomId = roomInput.value.trim();
    if (!newRoomId) {
        alert('Please enter a room ID');
        return;
    }

    if (roomId) {
        // Leave current room
        socket.emit('leave-room', roomId);
        roomId = null;
        currentRoomMembers.clear();
    }

    roomId = newRoomId;
    socket.emit('join-room', roomId);
    updateRoomStatus(true);
}

// Start screen sharing
async function startSharing() {
    try {
        console.log('Starting screen sharing...');
        const roomId = document.getElementById('roomInput').value;
        if (!roomId) {
            alert('Please enter a room ID');
            return;
        }

        // Request screen sharing with specific constraints
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: 'always',
                displaySurface: 'monitor',
                logicalSurface: true,
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30 }
            },
            audio: false
        });

        if (!stream) {
            throw new Error('Failed to get screen sharing stream');
        }

        console.log('Screen sharing stream obtained:', stream.getTracks().map(t => ({
            kind: t.kind,
            enabled: t.enabled,
            muted: t.muted,
            readyState: t.readyState
        })));

        // Store the stream
        localStream = stream;

        // Set up local preview
        const screenPreview = document.getElementById('screenPreview');
        if (screenPreview) {
            screenPreview.srcObject = stream;
            await screenPreview.play().catch(error => {
                console.error('Error playing local preview:', error);
            });
        }

        // Get room members from the room members list
        const roomMembersList = document.getElementById('roomMembersList');
        const roomMembers = Array.from(roomMembersList.children).map(li => li.dataset.userId);
        console.log('Sending offer to room members:', roomMembers);

        for (const memberId of roomMembers) {
            if (memberId && memberId !== socket.id) {
                try {
                    console.log('Creating peer connection for member:', memberId);
                    const pc = createPeerConnection(memberId);
                    peerConnections[memberId] = pc;

                    // Add local stream to peer connection
                    stream.getTracks().forEach(track => {
                        console.log('Adding track to peer connection:', track.kind);
                        pc.addTrack(track, stream);
                    });

                    // Create and send offer
                    console.log('Creating offer for member:', memberId);
                    const offer = await pc.createOffer({
                        offerToReceiveVideo: true,
                        offerToReceiveAudio: false
                    });
                    console.log('Setting local description for member:', memberId);
                    await pc.setLocalDescription(offer);
                    console.log('Sending offer to member:', memberId);
                    socket.emit('offer', {
                        offer: offer,
                        target: memberId,
                        roomId: roomId
                    });
                } catch (error) {
                    console.error('Error creating/sending offer for member:', memberId, error);
                }
            }
        }

        // Update UI
        document.getElementById('startSharingBtn').style.display = 'none';
        document.getElementById('stopSharingBtn').style.display = 'block';
        document.getElementById('stopSharingBtn').disabled = false;

        // Handle stream ended
        stream.getVideoTracks()[0].onended = () => {
            console.log('Screen sharing ended by user');
            stopSharing();
        };

        // Notify server about sharing start
        socket.emit('start-sharing', { roomId });

    } catch (error) {
        console.error('Error starting screen sharing:', error);
        alert('Error starting screen sharing: ' + error.message);
        // Clean up on error
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        // Reset UI
        document.getElementById('startSharingBtn').style.display = 'block';
        document.getElementById('stopSharingBtn').style.display = 'none';
        document.getElementById('stopSharingBtn').disabled = true;
    }
}

// Create peer connection for receiving screen share
function createPeerConnection(userId) {
    console.log('Creating new peer connection for user:', userId);
    
    const pc = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
        ],
        iceCandidatePoolSize: 10
    });

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('Sending ICE candidate for user:', userId);
            socket.emit('ice-candidate', {
                candidate: event.candidate,
                target: userId,
                roomId: document.getElementById('roomInput').value
            });
        }
    };

    // Handle incoming tracks
    pc.ontrack = (event) => {
        console.log('Received remote track:', event.track.kind);
        const remoteVideos = document.getElementById('remoteVideos');
        if (!remoteVideos) {
            console.error('Remote videos container not found');
            return;
        }

        // Check if we already have a video element for this user
        let videoElement = document.getElementById(`remote-video-${userId}`);
        if (!videoElement) {
            console.log('Creating new video element for user:', userId);
            videoElement = document.createElement('video');
            videoElement.id = `remote-video-${userId}`;
            videoElement.autoplay = true;
            videoElement.playsInline = true;
            videoElement.style.width = '100%';
            videoElement.style.maxWidth = '800px';
            videoElement.style.marginBottom = '10px';
            
            const container = document.createElement('div');
            container.className = 'remote-video-container';
            container.appendChild(videoElement);
            remoteVideos.appendChild(container);
        }

        // Add the track to the video element
        if (event.streams && event.streams[0]) {
            console.log('Setting video source from stream');
            videoElement.srcObject = event.streams[0];
        } else {
            console.log('Creating new MediaStream with track');
            const stream = new MediaStream();
            stream.addTrack(event.track);
            videoElement.srcObject = stream;
        }

        // Ensure the video plays
        videoElement.play().then(() => {
            console.log('Video playback started');
        }).catch(error => {
            console.error('Error playing video:', error);
        });
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
        console.log(`Connection state for ${userId}:`, pc.connectionState);
        if (pc.connectionState === 'connected') {
            console.log('Connection established with:', userId);
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
            console.log('Connection failed or disconnected with:', userId);
            // Remove the video element if connection is lost
            const videoElement = document.getElementById(`remote-video-${userId}`);
            if (videoElement) {
                videoElement.parentElement.remove();
            }
            // Attempt to reconnect
            setTimeout(() => {
                if (pc.connectionState !== 'connected') {
                    console.log('Attempting to reconnect with:', userId);
                    startSharing();
                }
            }, 5000);
        }
    };

    // Handle ICE connection state changes
    pc.oniceconnectionstatechange = () => {
        console.log(`ICE connection state for ${userId}:`, pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed') {
            console.log('ICE connection failed, attempting to restart ICE');
            pc.restartIce();
        }
    };

    return pc;
}

// Update UI functions
function updateRoomStatus(inRoom) {
    const roomStatus = document.getElementById('roomStatus');
    if (!roomStatus) return;

    roomStatus.textContent = inRoom ? `In Room: ${roomId}` : 'Not in room';
    roomStatus.className = `status ${inRoom ? 'in-room' : 'not-in-room'}`;
}

function updateSharingStatus(sharing) {
    if (startSharingBtn) startSharingBtn.disabled = sharing;
    if (stopSharingBtn) stopSharingBtn.disabled = !sharing;
}

function updateRoomMembersList(members) {
    const roomMembersList = document.getElementById('roomMembersList');
    if (!roomMembersList) return;

    roomMembersList.innerHTML = '';
    members.forEach(member => {
        const li = document.createElement('li');
        li.textContent = `User ${member.id} ${member.isSharing ? '(Sharing)' : ''}`;
        li.dataset.userId = member.id;
        roomMembersList.appendChild(li);
    });
}

// Event listeners
joinRoomBtn.addEventListener('click', joinRoom);
startSharingBtn.addEventListener('click', startSharing);
stopSharingBtn.addEventListener('click', stopSharing);

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    initializeSocket();
    initializeUI();
});

// Stop screen sharing
function stopSharing() {
    console.log('Stopping screen sharing...');
    if (localStream) {
        localStream.getTracks().forEach(track => {
            track.stop();
            console.log('Stopped track:', track.kind);
        });
        localStream = null;
    }
    screenPreview.srcObject = null;
    isSharing = false;
    updateSharingStatus(false);

    // Close all peer connections
    Object.entries(peerConnections).forEach(([userId, pc]) => {
        console.log('Closing peer connection for user:', userId);
        pc.close();
    });
    peerConnections = {};

    // Remove all remote video elements
    const remoteVideos = document.getElementById('remoteVideos');
    if (remoteVideos) {
        remoteVideos.innerHTML = '';
    }

    socket.emit('stop-sharing', { roomId });
} 