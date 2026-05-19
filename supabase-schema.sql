create table branches (
  id text primary key,
  name text not null
);
insert into branches values 
  ('daily', 'Nearbi Daily'),
  ('hypermarket', 'Nearbi Hypermarket');

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
  ('s5','5:30 PM – 11:30 PM','17:30','23:30',6);

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
  ot_minutes integer default 0,
  check_in_photo text,
  check_out_photo text,
  minutes_late integer default 0,
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
  requested_at timestamptz default now()
);

create table salary_summaries (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff(id),
  month text not null,
  base_salary numeric not null,
  leave_deduction numeric default 0,
  ot_pay numeric default 0,
  net_salary numeric not null,
  ot_minutes integer default 0,
  extra_leave_days integer default 0,
  generated_at timestamptz default now(),
  unique(staff_id, month)
);

create table salary_payments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff(id),
  month text not null,
  amount_paid numeric not null,
  payment_mode text not null 
    check (payment_mode in ('cash', 'upi')),
  paid_at timestamptz default now(),
  paid_by text not null,
  branch_id text references branches(id),
  notes text
);

create table salary_confirmations (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references staff(id),
  month text not null,
  net_salary numeric not null,
  base_salary numeric not null,
  leave_deduction numeric default 0,
  ot_pay numeric default 0,
  extra_leave_days integer default 0,
  ot_minutes integer default 0,
  confirmed_at timestamptz default now(),
  confirmed_by text not null,
  unique(staff_id, month)
);

alter table salary_payments 
  disable row level security;
alter table salary_confirmations 
  disable row level security;
