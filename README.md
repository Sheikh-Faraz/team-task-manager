# Team Task Manager

A full-stack team task management application that allows users to create teams, manage team members, and organize tasks in one place.

## Live Demo

- **Frontend:** https://team-task-manager-ehq3.vercel.app/
- **Backend API:** https://team-task-manager-five-bice.vercel.app/
- **API Health Check:** https://team-task-manager-five-bice.vercel.app/api/health

## Features

- User registration, login, and logout
- Session-based authentication using Passport.js and Express Session
- Secure password hashing with bcrypt
- Team creation and team member management
- Task creation, viewing, updating, and deletion
- Task status and priority management
- Task assignment and due dates
- Task search and filtering
- PostgreSQL database integration
- Responsive user interface

## Technology Stack

**Frontend**
- React
- Vite
- TypeScript
- Tailwind CSS

**Backend**
- Node.js
- Express.js
- Passport.js
- Express Session
- Joi validation

**Database**
- PostgreSQL
- Neon PostgreSQL hosting
- PostgreSQL-backed session storage

**Deployment**
- Vercel

## Project Structure

```text
team-task-manager/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── routes/
│   │   ├── middleware/
│   │   └── server.js
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   └── lib/
│   ├── package.json
│   └── vercel.json
├── .gitignore
└── README.md
```

*Note: The directory listing illustrates the main project layout; individual files may differ.*

## Prerequisites

- Node.js and npm
- A PostgreSQL database, such as Neon
- Git

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/Sheikh-Faraz/team-task-manager.git
cd team-task-manager
```

### 2. Configure the backend

```bash
cd backend
npm install
```

Create a `.env` file in the `backend/` directory with these variables:

```env
PORT=5000
NODE_ENV=development
DATABASE_URL=your_postgresql_connection_string
SESSION_SECRET=your_long_random_session_secret
FRONTEND_URL=http://localhost:5173
```

Replace the example values with your own configuration. Do not commit `.env` or share database credentials.

### 3. Start the backend

From the `backend/` directory:

```bash
npm run dev
```

The backend should run at `http://localhost:5000`.

Check the API health endpoint at:

`http://localhost:5000/api/health`


### 4. Configure the frontend

Open a second terminal from the project root:

```bash
cd frontend
npm install
```

Create `frontend/.env.local` with:

```env
VITE_API_URL=http://localhost:5000
```

The API helper appends `/api` to this base URL, so do not add `/api` to the environment variable.

In production, the frontend uses relative API paths and the Vercel configuration routes requests to the backend.

### 5. Start the frontend

From the `frontend/` directory:

```bash
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

## Environment Variables

| Variable | Purpose |
|---|---|
| `PORT` | Backend port |
| `NODE_ENV` | Runtime environment |
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Secret used to sign session cookies |
| `FRONTEND_URL` | Frontend origin allowed by CORS |
| `VITE_API_URL` | Frontend API base URL |

Keep actual credentials in local environment files or deployment environment settings, never in source control.

## API Overview

| Endpoint | Purpose |
|---|---|
| `/api/health` | Check API availability |
| `/api/health/db` | Check database connectivity |
| `/api/auth` | Authentication endpoints |
| `/api/teams` | Team management endpoints |
| `/api/tasks` | Task management endpoints |

The authentication, teams, and tasks routes provide the relevant operations supported by the application.

## Deployment

The frontend and backend are deployed separately on Vercel. The application uses a PostgreSQL database hosted on Neon.

Configure the production environment variables in the corresponding Vercel projects. Ensure the frontend API configuration points to the deployed backend or configured frontend-domain proxy, as appropriate for the production setup.

## Security

- Passwords are hashed using bcrypt.
- Authentication uses server-side sessions.
- Session cookies are configured as HTTP-only.
- Production cookie settings support secure cross-origin requests.
- Environment files and secrets are excluded from version control.

## Author

Developed as a full-stack internship assessment project.
