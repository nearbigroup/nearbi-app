create table branches (
  id text primary key,
  name text not null
);
insert into branches values
  ('daily','Nearbi Daily'),
  ('hypermarket','Nearbi Hypermarket')
on conflict (id) do update set name = excluded.name;

create table shifts (
  id text primary key,
  label text not null,
  start_time text not null,
  end_time text not null,
  hours numeric not null
);
insert into shifts values
  ('s1','9:00 AM – 6:00 PM','09:00','18:00',9),
  ('s2','9:00 AM – 6:30 PM','09:00','18:30',9.5),
  ('s3','11:30 AM – 11:30 PM','11:30','23:30',12),
  ('s4','3:00 PM – 10:00 PM','15:00','22:00',7),
  ('s5','5:30 PM – 11:30 PM','17:30','23:30',6)
on conflict (id) do update set
  label = excluded.label,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  hours = excluded.hours;

create table staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pin char(4) not null unique,
  branch_id text references branches(id),
  department text not null,
  shift_id text references shifts(id),
  off_days_per_month integer default 4
    check (off_days_per_month in (0,2,4)),
  monthly_salary numeric not null,
  join_date date not null default current_date,
  active boolean default true,
  created_at timestamptz default now()
);

create table attendance (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff(id),
  date date not null default current_date,
  check_in_time text,
  check_out_time text,
  status text not null
    check (status in ('present','late','absent')),
  color_code text default 'green'
    check (color_code in ('green','yellow','orange','red')),
  minutes_late integer default 0,
  ot_minutes integer default 0,
  ot_approved boolean default false,
  early_in_minutes integer default 0,
  early_in_approved boolean default false,
  actual_hours_worked numeric default 0,
  check_in_photo text,
  check_out_photo text,
  marked_by text default 'kiosk',
  created_at timestamptz default now(),
  unique(staff_id, date)
);

create table leave_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff(id),
  date date not null,
  reason text,
  status text default 'pending'
    check (status in ('pending','approved','rejected')),
  approved_by text,
  is_quota_leave boolean default false,
  requested_at timestamptz default now()
);

create table late_fines (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff(id),
  date date not null,
  late_minutes integer not null,
  color_code text not null
    check (color_code in ('yellow','orange','red')),
  fine_amount numeric not null default 0,
  waived boolean default false,
  waived_by text,
  confirmed boolean default false,
  confirmed_by text,
  month text not null,
  created_at timestamptz default now(),
  unique(staff_id, date)
);

create table fine_settings (
  id uuid primary key default gen_random_uuid(),
  yellow_fine numeric default 50,
  orange_fine numeric default 100,
  red_fine numeric default 200,
  yellow_free_passes integer default 4,
  updated_by text,
  updated_at timestamptz default now()
);
insert into fine_settings
  (yellow_fine, orange_fine, red_fine, yellow_free_passes)
values (50, 100, 200, 4);

create table staff_fine_exemptions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff(id) unique,
  exempted_by text,
  exempted_at timestamptz default now(),
  reason text
);

create table attendance_adjustments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff(id),
  date date not null,
  type text not null
    check (type in ('ot','early_in')),
  minutes integer not null default 0,
  status text default 'pending'
    check (status in ('pending','approved','rejected')),
  requested_note text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz default now()
);

create table salary_confirmations (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff(id),
  month text not null,
  net_salary numeric not null,
  base_salary numeric not null,
  paid_days integer not null,
  leave_deduction numeric default 0,
  ot_pay numeric default 0,
  early_in_pay numeric default 0,
  early_leave_deduction numeric default 0,
  confirmed_fines numeric default 0,
  confirmed_at timestamptz default now(),
  confirmed_by text not null,
  unique(staff_id, month)
);

create table salary_payments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff(id),
  month text not null,
  amount_paid numeric not null,
  payment_mode text not null
    check (payment_mode in ('cash','upi')),
  paid_at timestamptz default now(),
  paid_by text not null,
  branch_id text references branches(id),
  notes text
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in (
    'late_fine','ot_pending','early_in_pending',
    'leave_request','fine_confirmed','ot_approved',
    'ot_rejected','salary_confirmed','absent_alert'
  )),
  title text not null,
  message text not null,
  branch_id text references branches(id),
  staff_id uuid references staff(id),
  related_id text,
  is_read boolean default false,
  target_role text not null check (target_role in (
    'admin','ops_manager','staff_executive','all'
  )),
  created_at timestamptz default now()
);

-- Disable RLS on all tables
alter table branches disable row level security;
alter table shifts disable row level security;
alter table staff disable row level security;
alter table attendance disable row level security;
alter table leave_requests disable row level security;
alter table late_fines disable row level security;
alter table fine_settings disable row level security;
alter table staff_fine_exemptions disable row level security;
alter table attendance_adjustments disable row level security;
alter table salary_confirmations disable row level security;
alter table salary_payments disable row level security;
alter table notifications disable row level security;
