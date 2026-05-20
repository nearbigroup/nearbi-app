# Nearbi Staff Management System

A production-ready, beautiful, and secure staff management portal for the Nearbi supermarket chain. Built with Next.js 15 (App Router), Tailwind CSS, TypeScript, and Supabase.

Designed to operate flawlessly on both desktop browsers and Android Chrome (PWA-enabled).

## Domain & DNS
- Target Domain: `nearbicrew.online`

---

## Brand Guidelines
- **Background:** `#FFFFFF` (White)
- **Accent:** `#F5A800` (Amber)
- **Text:** `#111111` (Near Black)
- **Muted Text:** `#757575` (Gray)
- **Success:** `#2E7D32` (Green)
- **Danger:** `#D32F2F` (Red)
- **Warning:** `#E65100` (Orange)
- **Info:** `#185FA5` (Blue)
- **Cards:** White background, 1px `#E0E0E0` border, 12px corner radius
- **Bottom Navigation:** White background, 3px active amber border indicator at the top

---

## Role Permissions & Login Directory

Authentication is gated at both the frontend context and verified via PostgreSQL RLS rules.

| Email | Password | Role | Scope / Permissions |
| :--- | :--- | :--- | :--- |
| `adminnearbi@gmail.com` | `nearbi@123` | `admin` | Owner. Full database access, can view/edit salaries, delete staff, configure fine rates. |
| `ops@nearbi.com` | `ops@123` | `ops_manager` | Operations Manager. Full database access, can view/edit salaries, delete staff, configure fine rates. |
| `hr@nearbi.com` | `hr@123` | `staff_executive` | Head HR. Access to both branches, cannot see/modify salaries (locked screens), cannot delete staff, cannot edit settings. |
| `daily.hr@nearbi.com` | `daily@123` | `staff_executive` | Daily Branch HR. Same permissions as Head HR, but isolated *strictly* to the "Nearbi Daily" branch. |
| `hyper.hr@nearbi.com` | `hyper@123` | `staff_executive` | Hypermarket Branch HR. Same permissions as Head HR, but isolated *strictly* to the "Nearbi Hypermarket" branch. |
| `staffkiosk@gmail.com` | `staff@123` | `kiosk` | Kiosk Portal. Redirects to `/kiosk` immediately. Allows camera check-in/out via staff PIN keys. |

---

## Key Features

1. **Facial Check-In / Out (Kiosk):** Keypad PIN verification, automatic camera feed capture (facing-mode "user"), image blob uploads, auto late arrival pass checks, and transaction status toast feedbacks.
2. **Real-time Attendance Register:** Today's check-in/out timestamps, circular photo snapshots, adjustment labels, and branch-specific isolated filters.
3. **Overtime & Early-In Approvals:** Supervisors approve or reject early entry/overtime minute logs.
4. **Late Fines Waiver:** Automated late fine system (Yellow/Orange/Red tier fines) with single-click waiving or confirmation capabilities.
5. **Private Salary Ledgers:** Net salary calculations, extra leave day modifiers, print-ready PDF layouts, and direct-to-WhatsApp share links (restricted to Owner & Ops roles).
6. **Alert Notifications:** Real-time push alert toasts, scoped logs (read/unread statuses), and type-specific click redirection.
7. **System Configurations:** Customize fine tiers, free pass allowances, and add staff-specific exemption toggles.

---

## Setup Instructions

### 1. Database Setup
1. Create a project at [Supabase](https://supabase.com).
2. Open the **SQL Editor** in the Supabase Dashboard.
3. Run the complete contents of [supabase-schema.sql](file:///Users/abdulhadimehthash/Downloads/Works/nearbi-staff/supabase-schema.sql) to initialize tables, seeds, and disable active RLS.
4. Go to **Storage**, create a public bucket named `attendance-photos` and enable public read access.

### 2. Local Setup
1. Clone the project files to your workstation.
2. Create a `.env.local` file using the configuration schema in `.env.example`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ```
3. Install the dependencies and initiate the dev web server:
   ```bash
   npm install
   npm run dev
   ```
4. Access the web portal locally at `http://localhost:3000`.

---

## License
Private and Confidential. Developed for Nearbi.
