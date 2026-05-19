# Nearbi Staff Management

A production-ready staff management system for the Nearbi supermarket chain, built with Next.js 15, Tailwind CSS v4, and Supabase. 

## Features

- **Role-based Access Control**: Hardcoded roles (`admin`, `ops_manager`, `staff_executive`, `kiosk`) with strict routing and visibility permissions.
- **Kiosk Mode**: Fullscreen, dark-themed interface for staff to check in/out using a 4-digit PIN and live camera photo capture.
- **Attendance Tracking**: Real-time tracking of staff check-ins, check-outs, lateness, and overtime (OT).
- **Staff Management**: Add and manage staff members with real-time syncing across all active clients.
- **Leave Requests**: Approve or reject leave requests with optimistic UI updates.
- **Salary Calculation engine**: Automated engine calculating base salary, leave deductions, and overtime pay with strict privacy guards.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **Backend & Database**: Supabase (PostgreSQL, Storage, Auth)

## Setup Instructions

### 1. Supabase Setup

1. Create a new project on [Supabase](https://supabase.com).
2. Go to the **SQL Editor** and run the exact contents of `supabase-schema.sql` to initialize the database tables and seed data.
3. Go to **Storage** and create a new bucket named `attendance-photos` and ensure it is set to **Public**.
4. Go to **Project Settings -> API** to get your Project URL and Anon Key.

### 2. Environment Variables

Create a `.env.local` file in the root directory (use `.env.example` as a template):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
DATABASE_URL=postgresql://postgres:your-db-password@db.your-project-id.supabase.co:5432/postgres
```

### 3. Local Development

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

### 4. Test Logins

The application uses hardcoded frontend login validation for simplicity. Valid accounts are:

| Email | Password | Role | Description |
|-------|----------|------|-------------|
| adminnearbi@gmail.com | nearbi@123 | admin | Full access |
| ops@nearbi.com | ops@123 | ops_manager | Full access |
| hr@nearbi.com | hr@123 | staff_executive | Cannot see salary |
| staffkiosk@gmail.com | staff@123 | kiosk | Kiosk mode only |

## Deployment

This app is optimized for Vercel. 

1. Push your code to a GitHub repository.
2. Go to [Vercel](https://vercel.com) and create a new project.
3. Import your repository.
4. In the Environment Variables section, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. Click **Deploy**.

## License
Private and Confidential. Developed for Nearbi.
