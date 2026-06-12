#!/bin/bash
# Cleanup orphaned grader temp directories older than 60 minutes
find /tmp/cphub-grader -mindepth 1 -maxdepth 1 -type d -mmin +60 -exec rm -rf {} \; 2>/dev/null
echo "$(date): cleaned orphaned cphub temp dirs" >> /var/log/cphub/cleanup.log
