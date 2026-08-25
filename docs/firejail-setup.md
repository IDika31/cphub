# Firejail Setup Guide

The grader runs every submission inside firejail. All sandbox flags are passed on
the command line by the grader itself — **do not install a profile**.

## Install

```bash
sudo bash deploy/setup-firejail.sh
```

That installs firejail (apt / pacman / dnf), sets the suid bit, removes the legacy
`/etc/firejail/cphub.local` profile, and writes `/etc/security/limits.d/cphub.conf`.

Manual equivalent:

```bash
sudo apt install firejail        # or: pacman -S firejail
sudo chmod u+s /usr/bin/firejail
```

## Why no profile

A profile with a `timeout` directive keeps the sandbox alive for the whole
duration even after the payload exits, so the grader's wall-clock deadline always
fired first and **every run came back TLE**. The same applies to `--timeout=` on
the command line. Wall-clock limits belong to the grader (Go context), which
SIGKILLs the process group on deadline.

Flags the grader passes per run:

```
--quiet --noprofile --net=none --caps.drop=all --nonewprivs --nogroups
--seccomp --private-dev --read-only=/usr --whitelist=<run dir>
--rlimit-as=<mem> --rlimit-fsize=64M --rlimit-cpu=<limit+2s>
```

`GRADER_FIREJAIL_PROFILE` still exists as an escape hatch. If the profile it
points at contains `timeout`, the API logs a warning and ignores the file.

## Time limits

The verdict uses the problem's time limit. The hard kill happens at
`limit + measured sandbox overhead + grace`:

| Env | Default | Meaning |
|---|---|---|
| `GRADER_TIME_GRACE_MS` | 500 | slack before the hard kill |
| `GRADER_SANDBOX_OVERHEAD_MS` | 0 (auto) | pin the sandbox startup cost instead of measuring it |
| `GRADER_MAX_TIME_LIMIT_MS` | 15000 | ceiling for a client-supplied limit |

Startup measures firejail's own start/teardown cost (best of three empty runs) and
subtracts it from reported runtimes. Check the log line:

```
[grader] sandbox overhead 62ms, grace 500ms
```

If that number is high (say >400ms), the host is slow or seccomp filter setup is
expensive — raise `GRADER_TIME_GRACE_MS` rather than the time limits.

## Verify

```bash
# no network
firejail --noprofile --net=none ping -c1 google.com
# expected: ping: socket: Operation not permitted

# seccomp works
firejail --noprofile --quiet --net=none --seccomp /bin/echo ok

# read-only /usr
firejail --noprofile --read-only=/usr touch /usr/test.txt
# expected: Read-only file system
```

## Compiler requirements

```bash
g++ --version     # GCC 12+
python3 --version # Python 3.10+
node --version    # Node.js 20+
java --version    # Java 21+
```

Ubuntu: `sudo apt install g++ python3 nodejs openjdk-21-jdk`
