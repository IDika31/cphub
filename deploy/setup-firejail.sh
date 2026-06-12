#!/bin/bash
# Copy firejail profile and set up CPHub system limits
# Run as: sudo bash deploy/setup-firejail.sh

set -e

FIREJAIL_PROFILE="/etc/firejail/cphub.local"
LIMITS_CONF="/etc/security/limits.d/cphub.conf"

echo "=== CPHub Firejail Setup ==="

if [ "$(id -u)" -ne 0 ]; then
    echo "Error: must run as root (sudo)"
    exit 1
fi

# Install firejail
if ! command -v firejail &> /dev/null; then
    echo "Installing firejail..."
    pacman -S --noconfirm firejail
fi

# Copy profile
cp deploy/cphub.local "$FIREJAIL_PROFILE"
echo "Firejail profile installed: $FIREJAIL_PROFILE"

# Set suid bit
chmod u+s /usr/bin/firejail
echo "Firejail suid bit set"

# System limits
cat > "$LIMITS_CONF" <<EOF
cphub hard nproc 20
cphub hard nofile 4096
EOF
echo "System limits installed: $LIMITS_CONF"

# Verify
echo ""
echo "=== Verification ==="
firejail --net=none --noprofile --seccomp bash -c "echo 'seccomp: OK'" 2>/dev/null || echo "seccomp: FAIL"
echo ""
echo "Setup complete. Run 'bun run infra:up && bun run dev:api' to start."
