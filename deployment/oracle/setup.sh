#!/usr/bin/env bash
set -euo pipefail

# Dora Search - Oracle Cloud Always Free Setup Script
# Ubuntu 22.04 / 24.04 LTS on ARM64 or AMD64

echo "=== Dora Search Oracle Cloud Setup ==="

# 1. Update system packages
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y curl ufw git ca-certificates openssl

# 2. Configure host firewall (UFW)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment "SSH"
sudo ufw allow 80/tcp comment "HTTP (ACME Challenge)"
sudo ufw allow 443/tcp comment "HTTPS"
sudo ufw --force enable

# Note for Oracle Cloud: Also ensure Ingress Rules in Oracle Cloud Console
# (Virtual Cloud Network -> Security Lists -> Ingress Rules) allow TCP 80 and 443.

# 3. Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker "$USER"
    rm get-docker.sh
fi

# 4. Generate secrets if .env doesn't exist
if [ ! -f .env ]; then
    echo "Generating .env configuration..."
    SEARXNG_SECRET=$(openssl rand -hex 32)
    UPSTREAM_SECRET_TOKEN=$(openssl rand -hex 24)
    cat <<EOF > .env
DOMAIN=search.yourdomain.com
ACME_EMAIL=admin@yourdomain.com
SEARXNG_SECRET=${SEARXNG_SECRET}
UPSTREAM_SECRET_TOKEN=${UPSTREAM_SECRET_TOKEN}
EOF
    echo ".env created with generated secrets."
    echo "IMPORTANT: Edit .env to set your actual domain and ACME email."
fi

# 5. Enable and start systemd service
sudo cp dora-search.service /etc/systemd/system/dora-search.service
sudo systemctl daemon-reload
sudo systemctl enable dora-search.service

echo "Setup complete! Once you edit .env, run:"
echo "  sudo systemctl start dora-search"

