@echo off
set JWT_SECRET=ims-secret-key-2024-production-ready-secure-token-abc123xyz789
set PORT=3000
echo Starting IMS Server...
echo JWT_SECRET is set
echo PORT is set to %PORT%
node server.js
pause




