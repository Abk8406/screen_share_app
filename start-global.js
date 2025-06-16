const { spawn } = require('child_process');
const path = require('path');

// Start the server
const server = spawn('node', ['server.js'], {
    stdio: 'inherit',
    shell: true
});

// Wait for server to start
setTimeout(() => {
    console.log('Starting ngrok tunnel...');
    // Start ngrok for HTTPS
    const ngrok = spawn('ngrok', ['http', '3443', '--log=stdout'], {
        stdio: 'inherit',
        shell: true
    });

    // Handle ngrok process exit
    ngrok.on('exit', (code) => {
        console.log(`ngrok process exited with code ${code}`);
        server.kill();
        process.exit();
    });

    // Handle ngrok errors
    ngrok.on('error', (err) => {
        console.error('Failed to start ngrok:', err);
        console.log('\nPlease make sure:');
        console.log('1. ngrok is installed globally (npm install -g ngrok)');
        console.log('2. You have a valid ngrok authtoken configured');
        console.log('3. No other process is using port 3443');
        server.kill();
        process.exit(1);
    });

    // Log ngrok URL when available
    ngrok.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('https://')) {
            console.log('\nYour ngrok URL is:', output.match(/https:\/\/[a-z0-9-]+\.ngrok\.io/)[0]);
            console.log('\nShare this URL with others to test screen sharing.');
        }
    });
}, 5000);

// Handle server errors
server.on('error', (err) => {
    console.error('Failed to start server:', err);
});

// Handle process termination
process.on('SIGINT', () => {
    server.kill();
    process.exit();
}); 