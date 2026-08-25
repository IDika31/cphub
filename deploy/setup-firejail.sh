#!/bin/bash
# Install firejail and the CPHub system limits.
# Run as: sudo bash deploy/setup-firejail.sh
#
# No firejail profile is installed on purpose. The grader passes its hardening
# flags on the command line (--noprofile --net=none --seccomp --caps.drop=all
# --private-dev --read-only=/usr --whitelist=<rundir> --rlimit-*), because a
# profile that carries a `timeout` directive keeps the sandbox alive for its full
# duration after the payload exits — which reports every run as TLE.

set -e

LIMITS_CONF="/etc/security/limits.d/cphub.conf"

echo "=== CPHub Firejail Setup ==="

if [ "$(id -u)" -ne 0 ]; then
    echo "Error: must run as root (sudo)"
    exit 1
fi

if ! command -v firejail >/dev/null 2>&1; then
    echo "Installing firejail..."
    if command -v apt-get >/dev/null 2>&1; then
        apt-get update -qq && apt-get install -y firejail
    elif command -v pacman >/dev/null 2>&1; then
        pacman -S --noconfirm firejail
    elif command -v dnf >/dev/null 2>&1; then
        dnf install -y firejail
    else
        echo "Error: no supported package manager found — install firejail manually"
        exit 1
    fi
fi

FIREJAIL_BIN="$(command -v firejail)"
chmod u+s "$FIREJAIL_BIN"
echo "Firejail suid bit set on $FIREJAIL_BIN"

# Remove the legacy profile: it set `timeout`, which caused false TLE verdicts.
if [ -f /etc/firejail/cphub.local ]; then
    rm -f /etc/firejail/cphub.local
    echo "Removed stale /etc/firejail/cphub.local (caused false TLE)"
fi

cat > "$LIMITS_CONF" <<LIMITS
cphub hard nproc 256
cphub hard nofile 4096
LIMITS
echo "System limits installed: $LIMITS_CONF"

echo ""
echo "=== Verification ==="
firejail --noprofile --quiet --net=none --seccomp /bin/echo "seccomp: OK" || echo "seccomp: FAIL"
echo ""
echo "Setup complete. Restart the API so it re-measures sandbox overhead."
