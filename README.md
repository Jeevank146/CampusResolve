# CampusResolve – AI Student Helpdesk and Grievance Resolution Agent

## 1. Project Overview

CampusResolve is an AI-powered student helpdesk and grievance management platform developed for Vignan University (VFSTR).

The platform provides a centralized system where students can ask university-related questions, submit grievances, track complaint status and provide feedback.

It uses AI agents to answer institutional queries, categorize complaints and automatically route grievances to the appropriate departments.

## 2. Problem Statement

Students often face difficulties finding information about institutional procedures, academic services, facilities and administrative processes.

Grievances and queries are submitted through different channels, making tracking and resolution difficult.

CampusResolve addresses these problems through a centralized AI-powered helpdesk and grievance resolution system.

## 3. Key Features

### Student Portal
- Student login and dashboard.
- AI-powered university helpdesk.
- Centralized grievance submission.
- Unique grievance ticket generation.
- Grievance status tracking.
- AI response feedback with star ratings.
- Grievance resolution feedback.
- Search and manage submitted grievances.

### AI Helpdesk
- Answers university-related questions.
- Uses official university information and uploaded documents.
- Retrieval-Augmented Generation (RAG).
- Semantic document search using vector embeddings.
- Provides student-friendly answers.
- Avoids presenting unavailable information as confirmed facts.

### AI Grievance Management
- Automatic grievance categorization.
- Priority and urgency identification.
- Automatic department assignment.
- Grievance status updates.
- Follow-up agent for ticket status enquiries.
- Automatic escalation of unresolved complaints.

### Staff Dashboard
- View department-related grievances.
- Review complaint information.
- Update grievance status.
- Track assigned complaints.

### Admin Dashboard
- Monitor all grievances.
- Category-wise grievance statistics.
- Department-wise grievance statistics.
- Critical priority monitoring.
- Escalated grievance review.
- Student feedback monitoring.
- Average feedback rating and helpful response percentage.

## 4. Technology Stack

| Component | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend | Python, FastAPI |
| Database | PostgreSQL |
| Vector Database | PGVector |
| AI Language Model | Groq |
| Embedding Model | Ollama BGE-M3 |
| AI Workflow Automation | n8n |
| Knowledge Retrieval | RAG |
| Authentication | JWT |
| API Testing | Swagger UI |

## 5. System Architecture

```text
                 STUDENT
                    |
                    v
             React Frontend
                    |
                    v
              FastAPI Backend
                    |
          +---------+---------+
          |                   |
          v                   v
   AI Helpdesk          Grievance Portal
          |                   |
          v                   v
    n8n Supervisor       AI Triage Agent
          |                   |
          v                   v
    Knowledge Agent     Routing Agent
          |                   |
          v                   v
     Groq + RAG          Department
          |              Assignment
          v                   |
      PGVector                v
          |              PostgreSQL
          |                   |
          v                   v
    AI Answer          Staff / Admin
                       Dashboards
```

## 6. AI Agents

CampusResolve uses the following AI workflows:

1. **Supervisor Agent:** Receives requests and dispatches them to the appropriate agent.
2. **Knowledge Agent:** Answers institutional queries using university documents and RAG.
3. **Triage Agent:** Identifies grievance category, priority and urgency.
4. **Routing Agent:** Assigns grievances to the appropriate department.
5. **Follow-up Agent:** Retrieves grievance information and explains its current status.
6. **Escalation Agent:** Checks unresolved complaints and moves eligible tickets to Admin Review.

## 7. Project Folder Structure

```text
CampusResolve/
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── LoginPage.tsx
│   │   ├── student/
│   │   │   └── HelpdeskChat.tsx
│   │   ├── staff/
│   │   │   └── StaffDashboard.tsx
│   │   ├── admin/
│   │   │   └── AdminDashboard.tsx
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── styles.css
│   └── package.json
│
├── backend/
│   └── app/
│       ├── routers/
│       │   ├── auth.py
│       │   ├── grievances.py
│       │   ├── feedback.py
│       │   └── supervisor.py
│       ├── config.py
│       ├── database.py
│       ├── models.py
│       └── main.py
│
├── n8n/
│   └── workflows/
│       ├── supervisor.json
│       ├── knowledge.json
│       ├── triage.json
│       ├── routing.json
│       ├── followup.json
│       ├── escalation.json
│       ├── website_knowledge_ingestion.json
│       └── knowledge_upload.json
│
├── database/
│   └── init.sql
│
├── ai/
│   ├── prompts/
│   ├── rag/
│   └── evaluation/
│
├── firebase/
├── tests/
├── .env.example
├── .gitignore
└── README.md
```

## 8. Installation and Setup

### Prerequisites

- Python
- Node.js and npm
- PostgreSQL
- n8n
- Ollama
- Groq API credentials

### Step 1: Database Setup

Create a PostgreSQL database named:

```sql
CREATE DATABASE campusresolve;
```

Enable the PGVector extension:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

The backend automatically creates SQLAlchemy application tables during startup.

### Step 2: Backend Setup

Navigate to the backend folder:

```powershell
cd backend
```

Install required dependencies:

```powershell
pip install fastapi uvicorn sqlalchemy "psycopg[binary]" pydantic-settings httpx "python-jose[cryptography]"
```

Configure the `.env` file with the database connection, JWT secret, Admin credentials, Staff credentials and n8n webhook URL.

Example configuration:

```env
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@localhost:5432/campusresolve

FRONTEND_ORIGIN=http://localhost:5173

N8N_SUPERVISOR_WEBHOOK_URL=http://localhost:5678/webhook/campusresolve/supervisor

JWT_SECRET_KEY=YOUR_SECRET_KEY
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=480
```

Run the backend:

```powershell
python -m uvicorn app.main:app --reload --port 8000
```

Backend API documentation:

http://localhost:8000/docs

### Step 3: Frontend Setup

Open a new terminal:

```powershell
cd frontend
```

Install dependencies:

```powershell
npm install
```

Start the frontend:

```powershell
npm run dev
```

Open:

http://localhost:5173

### Step 4: AI Services

Ensure the following services are configured and running:

- n8n workflows.
- Groq API credentials.
- Ollama service.
- BGE-M3 embedding model.
- PostgreSQL PGVector connection.

Import the exported workflow JSON files into n8n and configure the required credentials.

The Knowledge Agent retrieves relevant university information from the PGVector repository.

## 9. API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Backend health check |
| POST | `/api/auth/login` | User authentication |
| POST | `/api/grievances` | Submit grievance |
| GET | `/api/grievances` | Retrieve grievances |
| GET | `/api/grievances/{ticket_code}` | Retrieve ticket details |
| PATCH | `/api/grievances/{ticket_code}/status` | Update grievance status |
| POST | `/api/feedback` | Submit student feedback |
| GET | `/api/feedback` | Admin feedback overview |
| POST | `/api/automation/supervisor` | Trigger AI Supervisor |

Additional grievance classification, assignment and deletion endpoints are available in the backend routers.

## 10. Grievance Escalation

CampusResolve includes a scheduled escalation workflow.

- Checks unresolved grievances every hour.
- Identifies eligible tickets unresolved for 48 hours.
- Moves eligible complaints to the Admin Review queue.
- Records the escalation in grievance history.
- Prevents repeated escalation of the same ticket.

The escalation timing is configurable.

## 11. Feedback System

Students can provide feedback on:

**AI Responses**
- Five-star rating.
- Helpful or Not Helpful selection.
- Additional comments.

**Grievance Resolution**
- Resolution satisfaction rating.
- Helpful or Not Helpful selection.
- Optional comments.

Administrators can review feedback, average ratings and helpful response percentages.

## 12. Notifications

Email notifications for grievance submission, assignment, status updates and resolution are planned for integration.

Official university email sender credentials and IT approval are pending.

## 13. Security and Privacy

- Role-based access for Student, Staff and Admin.
- JWT-based authentication for protected APIs.
- Student grievance access restricted by registration number.
- Admin-only feedback overview.
- Database credentials and API secrets stored in environment variables.
- University information should