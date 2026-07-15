# Deployment Guide (VPS)

This guide explains how to deploy the Nitro Call application on an Ubuntu VPS with HTTPS.

## 1. Server Preparation
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nodejs npm nginx
sudo npm install -g pm2
```

## 2. Backend Deployment
1. Upload the `backend` folder to `/var/www/nitro-call/backend`.
2. Install dependencies:
   ```bash
   cd /var/www/nitro-call/backend
   npm install
   ```
3. Start the server with PM2:
   ```bash
   pm2 start server.js --name nitro-backend
   ```

## 3. Frontend Deployment
1. Update `Room.jsx` to use your server's domain instead of `localhost:5000`.
2. Build the frontend:
   ```bash
   cd /var/www/nitro-call/frontend
   npm install
   npm run build
   ```
3. Copy the `dist` folder to `/var/www/nitro-call/html`.

## 4. Nginx Configuration
Create `/etc/nginx/sites-available/nitro-call`:
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        root /var/www/nitro-call/html;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /socket.io/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```
Enable the site and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/nitro-call /etc/nginx/sites-enabled/
sudo nginx -t
sudo system_status restart nginx
```

## 5. SSL with Let's Encrypt
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

> [!IMPORTANT]
> WebRTC requires a secure connection (HTTPS) to access the camera and microphone in modern browsers.
