@echo off

echo Starting DemandPlanner Frontend...
start cmd /k "cd frontend && npm run dev -- -H 0.0.0.0 -p 3000"

echo Frontend services are starting up!
