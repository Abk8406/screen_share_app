const path = require('path');

const config = {
    development: {
        httpPort: 3003,
        httpsPort: 3443,
        corsOrigin: '*',
        socketPath: '/socket.io/',
        ssl: {
            key: path.join(__dirname, 'ssl', 'private.key'),
            cert: path.join(__dirname, 'ssl', 'certificate.crt')
        }
    },
    production: {
        httpPort: process.env.PORT || 80,
        httpsPort: process.env.HTTPS_PORT || 443,
        corsOrigin: process.env.CORS_ORIGIN || '*',
        socketPath: '/socket.io/',
        ssl: {
            key: process.env.SSL_KEY_PATH || '/etc/letsencrypt/live/yourdomain.com/privkey.pem',
            cert: process.env.SSL_CERT_PATH || '/etc/letsencrypt/live/yourdomain.com/fullchain.pem'
        }
    }
};

module.exports = config[process.env.NODE_ENV || 'development']; 