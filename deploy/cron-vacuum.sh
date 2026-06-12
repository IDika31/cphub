#!/bin/bash
# Weekly VACUUM ANALYZE for CPHub PostgreSQL
/usr/bin/docker exec cphub-db psql -U cphub -d cphub -c "VACUUM ANALYZE;" 2>&1
echo "$(date): VACUUM ANALYZE completed" >> /var/log/cphub/vacuum.log
