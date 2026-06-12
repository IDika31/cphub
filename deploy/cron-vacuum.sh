#!/bin/bash
# Weekly VACUUM ANALYZE for CPHub PostgreSQL (native)
/usr/bin/psql -h localhost -U cphub -d cphub -c "VACUUM ANALYZE;" 2>&1
echo "$(date): VACUUM ANALYZE completed" >> /var/log/cphub/vacuum.log
