@echo off
echo Starting DemandPlanner Backend...
start cmd /k "cd backend && .\.venv\Scripts\activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

echo Starting DemandPlanner Frontend...
start cmd /k "cd frontend && npm run dev -- -p 3000"

echo Both services are starting up!
