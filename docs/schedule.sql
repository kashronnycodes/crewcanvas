-- Setup: npm run setup:reconcile (isolated CrewCanvas owner login).
-- Migration 20261031164710 owns setup and refuses conflicting jobs/Vault values.
-- Do not paste a service key into SQL files or create a second schedule here.
-- Safe metadata-only inspection; never select Vault decrypted_secret or job commands.
select jobid, jobname, schedule, active
from cron.job where jobname = 'crewcanvas-reconcile';
