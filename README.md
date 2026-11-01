# Campus ERP

College Event Management Platform built with React, Vite, Express, and PostgreSQL.

## Requirements
- Node.js 22 (recommended for this project)
- PostgreSQL 17 (or a compatible PostgreSQL version)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start PostgreSQL and create the database:

   ```bash
   brew services start postgresql@17
   createdb Campus ERP
   ```

   If the database already exists, do not create it again.

3. Start the application:

   ```bash
   npm run dev
   ```

   The API runs at `http://localhost:4000` and Vite at `http://localhost:5173`.

   By default, the backend connects to `postgresql://<your-mac-username>@localhost:5432/Campus ERP`.
   You can override this with `DATABASE_URL`, for example:

   ```bash
   DATABASE_URL='postgresql://localhost:5432/Campus ERP' npm run dev
   ```

## Demo accounts

- Student: `student@campuserp.dev` / `demo1234`
- Organizer: `organizer.org@campuserp.dev` / `demo1234`

The backend creates the PostgreSQL tables and demo data on first startup when the users table is empty. This package does not automatically migrate data from an earlier SQLite database.
