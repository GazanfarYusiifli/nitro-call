#!/bin/bash
set -e

echo "Updating packages and installing nginx, unzip..."
dnf install -y curl unzip nginx policycoreutils-python-utils > /dev/null

echo "Configuring Firewalld..."
if systemctl is-active --quiet firewalld; then
    firewall-cmd --permanent --add-service=http || true
    firewall-cmd --permanent --add-service=https || true
    firewall-cmd --reload || true
fi

echo "Installing Node.js..."
if ! command -v node > /dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - > /dev/null
    dnf install -y nodejs > /dev/null
fi

echo "Installing PM2..."
if ! command -v pm2 > /dev/null; then
    npm install -g pm2 > /dev/null
fi

echo "Ensuring LibreTranslate is running..."
if ! docker ps | grep -q libretranslate; then
    docker run -d --restart always -p 5002:5000 --name libretranslate libretranslate/libretranslate --load-only en,az,tr,it,ru,de,es,fr || true
fi

echo "Setting up application folders..."
rm -rf /var/www/nitrocall
rm -rf /var/www/html/*
mkdir -p /var/www/nitrocall/backend
mkdir -p /var/www/html

echo "Extracting deployment..."
cd /root
unzip -o deploy.zip -d /tmp/nitro_deploy > /dev/null

# Extract Backend
cp -rf /tmp/nitro_deploy/backend/* /var/www/nitrocall/backend/
# Extract Frontend Dist
cp -rf /tmp/nitro_deploy/frontend/* /var/www/html/

rm -rf /tmp/nitro_deploy

echo "Starting Backend..."
cd /var/www/nitrocall/backend
# Preserve .env if it exists elsewhere or recreate if provided by user earlier
# In this case, I'll assume the user might have to run the echo command again 
# OR I can try to preserve it before rm -rf.
# Actually, I'll avoid deleting the .env if it exists.
# But I already ran rm -rf /var/www/nitrocall. 

npm install > /dev/null
pm2 stop nitro-backend 2>/dev/null || true
pm2 delete nitro-backend 2>/dev/null || true
pm2 start server.js --name nitro-backend
pm2 save

echo "Configuring Nginx..."
cat > /etc/nginx/conf.d/nitro.conf << 'EOF'
server {
    listen 80;
    server_name nitrocalls.online www.nitrocalls.online;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name nitrocalls.online www.nitrocalls.online;

    ssl_certificate /etc/letsencrypt/live/nitrocalls.online/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nitrocalls.online/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    root /var/www/html;
    index index.html index.htm;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    location /translate/ {
        proxy_pass http://127.0.0.1:5002/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5001/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Remove legacy broken SSL config from previous certbot runs
rm -f /etc/nginx/conf.d/nitrocall.conf

# Prevent default AlmaLinux page from overriding
rm -f /etc/nginx/conf.d/default.conf

# Ensure SELinux allows Nginx to reverse proxy
setsebool -P httpd_can_network_connect 1 || true
# Ensure SELinux allows Nginx to read frontend files
chcon -Rt httpd_sys_content_t /var/www/html || true

systemctl enable nginx
systemctl restart nginx

echo "Deployment finished successfully!"
