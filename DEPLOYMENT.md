# Screen Sharing Application Deployment Guide

## Prerequisites

1. A Linux server (Ubuntu 20.04 LTS recommended)
2. Node.js 14.x or later
3. Nginx
4. Domain name (for SSL certificates)
5. PM2 (for process management)

## Step 1: Server Setup

1. Update your server:
```bash
sudo apt update && sudo apt upgrade -y
```

2. Install Node.js:
```bash
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt install -y nodejs
```

3. Install Nginx:
```bash
sudo apt install nginx -y
```

4. Install PM2:
```bash
sudo npm install -g pm2
```

## Step 2: Application Deployment

1. Clone your repository:
```bash
git clone <your-repository-url>
cd screen-sharing-app
```

2. Install dependencies:
```bash
npm install --production
```

3. Set up environment variables:
```bash
export NODE_ENV=production
export PORT=80
export HTTPS_PORT=443
export CORS_ORIGIN=https://yourdomain.com
```

4. Set up SSL certificates using Let's Encrypt:
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com
```

5. Configure Nginx:
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

6. Start the application with PM2:
```bash
pm2 start server.js --name "screen-sharing"
pm2 save
pm2 startup
```

## Step 3: Security Considerations

1. Set up a firewall:
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

2. Configure SSL/TLS settings in Nginx:
```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
ssl_prefer_server_ciphers off;
```

## Step 4: Monitoring and Maintenance

1. Monitor your application:
```bash
pm2 monit
```

2. View logs:
```bash
pm2 logs screen-sharing
```

3. Set up automatic SSL renewal:
```bash
sudo certbot renew --dry-run
```

## Troubleshooting

1. Check application logs:
```bash
pm2 logs screen-sharing
```

2. Check Nginx logs:
```bash
sudo tail -f /var/log/nginx/error.log
```

3. Check SSL certificate status:
```bash
sudo certbot certificates
```

## Backup and Recovery

1. Backup SSL certificates:
```bash
sudo tar -czf ssl-backup.tar.gz /etc/letsencrypt/
```

2. Backup application data:
```bash
pm2 save
```

## Scaling Considerations

1. Load Balancing:
   - Consider using multiple application instances
   - Use Nginx as a load balancer
   - Implement Redis for session management

2. Monitoring:
   - Set up monitoring with PM2
   - Use external monitoring services
   - Implement logging aggregation

## Maintenance

1. Regular updates:
```bash
npm update
pm2 reload all
```

2. SSL certificate renewal:
```bash
sudo certbot renew
```

3. System updates:
```bash
sudo apt update && sudo apt upgrade
``` 