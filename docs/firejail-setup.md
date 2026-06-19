# Firejail Setup Guide

## Install

```bash
sudo pacman -S firejail
```

## Create CPHub Profile

```bash
sudo tee /etc/firejail/cphub.local > /dev/null <<'EOF'
# CPHub grader sandbox profile
# NOTE: do NOT set `timeout` here. The grader passes `--timeout=hh:mm:ss`
# on the command line per request (dynamic per problem). Mixing profile
# `timeout` with CLI `--timeout=` causes firejail to error with
# "invalid timeout, please use a hh:mm:ss format".
# Memory is also bounded dynamically via CLI `--rlimit-as=`.
net none
noroot
seccomp
caps.drop all
private-dev
private-tmp
read-only /usr
read-only /lib
read-only /lib64
EOF
```

## Set SUID Bit

```bash
sudo chmod u+s /usr/bin/firejail
```

## System Limits

```bash
echo "cphub hard nproc 20" | sudo tee /etc/security/limits.d/cphub.conf
```

## Verify

```bash
# Test no network
firejail --net=none --noprofile ping google.com
# Expected: ping: socket: Operation not permitted

# Test seccomp
firejail --net=none --noprofile --seccomp bash -c "echo ok"
# Expected: ok

# Test read-only
firejail --net=none --noprofile touch /usr/test.txt
# Expected: touch: cannot touch '/usr/test.txt': Read-only file system
```

## Compiler Requirements

```bash
g++ --version     # GCC 14+
python3 --version # Python 3.12+
node --version    # Node.js 22+
java --version    # Java 21+
```
