# Clear Data Process Implementation

## Overview
A comprehensive data clearing process with multi-step confirmation, manager approval, and automatic PDF/backup generation.

## Process Flow

### 1. Admin Initiation
- Admin clicks "Initiate Clear Data Process" button on dashboard
- System automatically:
  - Creates a database backup
  - Generates a complete system PDF report
  - Creates a clear data request record

### 2. Admin Confirmation (5 Steps)
- Admin must confirm 5 times
- Confirmations 1-4: Simple confirmation dialogs
- Confirmation 5: Requires admin password
- After 5th confirmation, request is sent to manager

### 3. Manager Notification & Approval
- Manager dashboard automatically shows pending request
- Manager can:
  - View request details
  - Download PDF and backup files
  - Approve or reject the request
- If rejected: Admin is notified, data remains intact
- If approved: Manager proceeds to confirmation steps

### 4. Manager Confirmation (5 Steps)
- Manager must confirm 5 times
- Confirmations 1-4: Simple confirmation dialogs
- Confirmation 5: Requires manager password + final warning
- After 5th confirmation: All data is permanently cleared

### 5. PDF Distribution
- Admin and Manager: Full system PDF (all data)
- Other users: Role-based PDFs (limited to their sections)
- All PDFs available for download before and after clearing

## Technical Implementation

### Database
- New table: `clear_data_requests`
  - Tracks request status, confirmations, file paths
  - Statuses: pending, approved, rejected, completed

### API Endpoints
- `POST /api/clear-data/initiate` - Admin initiates process
- `POST /api/clear-data/confirm` - Admin confirms (1-5)
- `GET /api/clear-data/pending` - Manager gets pending requests
- `POST /api/clear-data/manager-action` - Manager approves/rejects
- `GET /api/clear-data/requests` - Admin views all requests
- `GET /api/clear-data/pdf/:requestId` - Download PDF
- `GET /api/clear-data/backup/:requestId` - Download backup
- `POST /api/clear-data/generate-user-pdfs` - Generate role-based PDFs

### PDF Generation
- Uses PDFKit library
- Full system PDF includes:
  - All items inventory
  - Categories
  - Suppliers
  - Purchase history
  - Sales history
  - Stock adjustments
  - Users
- Role-based PDFs include relevant sections only

### Security Features
- Password verification for final confirmations
- Audit logging for all actions
- Role-based access control
- Request tracking and status management

### UI Components
- Admin Dashboard: Clear data section with status and file downloads
- Manager Dashboard: Approval section with request details
- Real-time status updates
- Automatic refresh for manager notifications

## Files Modified/Created
- `server.js` - API endpoints, PDF generation, data clearing logic
- `public/dashboard.html` - UI components for admin and manager
- `public/dashboard.js` - Dashboard loading with clear data checks
- `public/clear-data.js` - Client-side clear data functions
- `package.json` - Added PDFKit dependency

## Usage
1. Admin logs in and clicks "Initiate Clear Data Process"
2. System generates backup and PDF automatically
3. Admin confirms 5 times (password on 5th)
4. Manager sees notification and can approve/reject
5. If approved, manager confirms 5 times (password on 5th)
6. Data is cleared after all confirmations complete
7. PDFs and backups remain available for download

