#!/bin/bash
# Shared helpers. Called by install.sh/update.sh after validating APP_DIR/owner.
servit_write_service() {
  local node_bin
  node_bin="$(command -v node)"
  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=SERV-IT Ticketing System
After=network-online.target postgresql.service
Wants=network-online.target
[Service]
Type=simple
User=${APP_OWNER}
Group=${APP_GROUP}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=${node_bin} ${APP_DIR}/server/src/server.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
UMask=0027
[Install]
WantedBy=multi-user.target
EOF
  chmod 644 "/etc/systemd/system/${SERVICE_NAME}.service"
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
}

servit_configure_nginx() {
  # Existing domain routing and trusted certificates must never be overwritten.
  if [[ -f /etc/nginx/sites-available/servit ]]; then
    nginx -t
    systemctl enable --now nginx
    return
  fi
  local domain="${SERVIT_DOMAIN:-_}" cert key
  if [[ "$domain" != _ && ! "$domain" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*[A-Za-z0-9]$ ]]; then
    echo "Invalid SERVIT_DOMAIN." >&2; return 1
  fi
  cert="/etc/letsencrypt/live/$domain/fullchain.pem"
  key="/etc/letsencrypt/live/$domain/privkey.pem"
  if [[ ! -f "$cert" || ! -f "$key" ]]; then
    cert=/etc/ssl/servit/servit.crt; key=/etc/ssl/servit/servit.key
    install -d -m 700 /etc/ssl/servit
    if [[ ! -f "$cert" || ! -f "$key" ]]; then
      openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout "$key" -out "$cert" -subj "/O=SERV-IT/CN=${domain/_/localhost}" >/dev/null 2>&1
      chmod 600 "$key"
    fi
    echo 'Using the existing/local certificate. Configure a trusted certificate before public use if this is self-signed.'
  fi
  install -d /etc/nginx/sites-available /etc/nginx/sites-enabled
  cat > /etc/nginx/sites-available/servit <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${domain};
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${domain};
    ssl_certificate ${cert};
    ssl_certificate_key ${key};
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 30M;
    location / {
        proxy_pass http://127.0.0.1:${SERVIT_PORT:-5000};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }
}
EOF
  chmod 644 /etc/nginx/sites-available/servit
  ln -sfn /etc/nginx/sites-available/servit /etc/nginx/sites-enabled/servit
  if [[ -L /etc/nginx/sites-enabled/default ]]; then unlink /etc/nginx/sites-enabled/default; fi
  nginx -t
  systemctl enable --now nginx
  systemctl reload nginx
}
