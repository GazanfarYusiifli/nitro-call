#!/bin/bash
set -e

DOMAIN="nitrocalls.online"

echo "Configuring Nginx for $DOMAIN..."
cat > /etc/nginx/conf.d/nitro.conf << EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    root /var/www/html;
    index index.html index.htm;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host \$host;
    }
}
EOF

systemctl restart nginx

echo "Attempting to install Certbot for WebRTC HTTPS requirement..."
dnf install -y epel-release > /dev/null || true
dnf install -y certbot python3-certbot-nginx > /dev/null || true

echo "Done."
