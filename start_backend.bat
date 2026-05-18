@echo off
echo Starting DemandPlanner Backend...
start cmd /k "cd backend && .\.venv\Scripts\activate && uvicorn app.main:app --reload --port 8000"

echo Backend services are starting up!
