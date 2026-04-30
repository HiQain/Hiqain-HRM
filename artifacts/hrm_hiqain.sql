--
-- PostgreSQL database dump
--

\restrict 30kyKOj3Lpu5EVACcaLBQLJslU5PNHcIsTbOMLpbtZqYadoffsbsTgXHHqHR2uk

-- Dumped from database version 14.20 (Homebrew)
-- Dumped by pg_dump version 14.20 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.salary_events DROP CONSTRAINT IF EXISTS salary_events_employee_id_employees_id_fk;
ALTER TABLE IF EXISTS ONLY public.salary_components DROP CONSTRAINT IF EXISTS salary_components_employee_id_employees_id_fk;
ALTER TABLE IF EXISTS ONLY public.remote_work_requests DROP CONSTRAINT IF EXISTS remote_work_requests_employee_id_employees_id_fk;
ALTER TABLE IF EXISTS ONLY public.payslips DROP CONSTRAINT IF EXISTS payslips_employee_id_employees_id_fk;
ALTER TABLE IF EXISTS ONLY public.news_posts DROP CONSTRAINT IF EXISTS news_posts_author_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.loans DROP CONSTRAINT IF EXISTS loans_employee_id_employees_id_fk;
ALTER TABLE IF EXISTS ONLY public.loan_installments DROP CONSTRAINT IF EXISTS loan_installments_loan_id_loans_id_fk;
ALTER TABLE IF EXISTS ONLY public.loan_installments DROP CONSTRAINT IF EXISTS loan_installments_employee_id_employees_id_fk;
ALTER TABLE IF EXISTS ONLY public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_employee_id_employees_id_fk;
ALTER TABLE IF EXISTS ONLY public.general_requests DROP CONSTRAINT IF EXISTS general_requests_employee_id_employees_id_fk;
ALTER TABLE IF EXISTS ONLY public.employees DROP CONSTRAINT IF EXISTS employees_user_id_users_id_fk;
ALTER TABLE IF EXISTS ONLY public.designation_changes DROP CONSTRAINT IF EXISTS designation_changes_employee_id_employees_id_fk;
ALTER TABLE IF EXISTS ONLY public.attendance DROP CONSTRAINT IF EXISTS attendance_employee_id_employees_id_fk;
DROP INDEX IF EXISTS public.payslip_emp_month_unique;
DROP INDEX IF EXISTS public.attendance_emp_date_unique;
DROP INDEX IF EXISTS public."IDX_user_sessions_expire";
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_email_unique;
ALTER TABLE IF EXISTS ONLY public.user_sessions DROP CONSTRAINT IF EXISTS user_sessions_pkey;
ALTER TABLE IF EXISTS ONLY public.salary_events DROP CONSTRAINT IF EXISTS salary_events_pkey;
ALTER TABLE IF EXISTS ONLY public.salary_components DROP CONSTRAINT IF EXISTS salary_components_pkey;
ALTER TABLE IF EXISTS ONLY public.remote_work_requests DROP CONSTRAINT IF EXISTS remote_work_requests_pkey;
ALTER TABLE IF EXISTS ONLY public.payslips DROP CONSTRAINT IF EXISTS payslips_pkey;
ALTER TABLE IF EXISTS ONLY public.news_posts DROP CONSTRAINT IF EXISTS news_posts_pkey;
ALTER TABLE IF EXISTS ONLY public.loans DROP CONSTRAINT IF EXISTS loans_pkey;
ALTER TABLE IF EXISTS ONLY public.loan_installments DROP CONSTRAINT IF EXISTS loan_installments_pkey;
ALTER TABLE IF EXISTS ONLY public.leave_requests DROP CONSTRAINT IF EXISTS leave_requests_pkey;
ALTER TABLE IF EXISTS ONLY public.general_requests DROP CONSTRAINT IF EXISTS general_requests_pkey;
ALTER TABLE IF EXISTS ONLY public.employees DROP CONSTRAINT IF EXISTS employees_user_id_unique;
ALTER TABLE IF EXISTS ONLY public.employees DROP CONSTRAINT IF EXISTS employees_pkey;
ALTER TABLE IF EXISTS ONLY public.designation_changes DROP CONSTRAINT IF EXISTS designation_changes_pkey;
ALTER TABLE IF EXISTS ONLY public.attendance DROP CONSTRAINT IF EXISTS attendance_pkey;
ALTER TABLE IF EXISTS ONLY public.app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey;
ALTER TABLE IF EXISTS public.users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.salary_events ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.salary_components ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.remote_work_requests ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.payslips ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.news_posts ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.loans ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.loan_installments ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.leave_requests ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.general_requests ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.employees ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.designation_changes ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.attendance ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.app_settings ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.users_id_seq;
DROP TABLE IF EXISTS public.users;
DROP TABLE IF EXISTS public.user_sessions;
DROP SEQUENCE IF EXISTS public.salary_events_id_seq;
DROP TABLE IF EXISTS public.salary_events;
DROP SEQUENCE IF EXISTS public.salary_components_id_seq;
DROP TABLE IF EXISTS public.salary_components;
DROP SEQUENCE IF EXISTS public.remote_work_requests_id_seq;
DROP TABLE IF EXISTS public.remote_work_requests;
DROP SEQUENCE IF EXISTS public.payslips_id_seq;
DROP TABLE IF EXISTS public.payslips;
DROP SEQUENCE IF EXISTS public.news_posts_id_seq;
DROP TABLE IF EXISTS public.news_posts;
DROP SEQUENCE IF EXISTS public.loans_id_seq;
DROP TABLE IF EXISTS public.loans;
DROP SEQUENCE IF EXISTS public.loan_installments_id_seq;
DROP TABLE IF EXISTS public.loan_installments;
DROP SEQUENCE IF EXISTS public.leave_requests_id_seq;
DROP TABLE IF EXISTS public.leave_requests;
DROP SEQUENCE IF EXISTS public.general_requests_id_seq;
DROP TABLE IF EXISTS public.general_requests;
DROP SEQUENCE IF EXISTS public.employees_id_seq;
DROP TABLE IF EXISTS public.employees;
DROP SEQUENCE IF EXISTS public.designation_changes_id_seq;
DROP TABLE IF EXISTS public.designation_changes;
DROP SEQUENCE IF EXISTS public.attendance_id_seq;
DROP TABLE IF EXISTS public.attendance;
DROP SEQUENCE IF EXISTS public.app_settings_id_seq;
DROP TABLE IF EXISTS public.app_settings;
SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    id integer NOT NULL,
    company_name text DEFAULT 'HiQain'::text NOT NULL,
    default_casual_leave_quota integer DEFAULT 6 NOT NULL,
    default_sick_leave_quota integer DEFAULT 6 NOT NULL,
    default_annual_leave_quota integer DEFAULT 12 NOT NULL,
    default_grace_period_minutes integer DEFAULT 15 NOT NULL,
    default_probation_months integer DEFAULT 3 NOT NULL,
    default_office_start_time text DEFAULT '09:00'::text NOT NULL,
    default_office_end_time text DEFAULT '18:00'::text NOT NULL,
    weekly_off_days jsonb DEFAULT '[0, 6]'::jsonb NOT NULL,
    public_holidays jsonb DEFAULT '[]'::jsonb NOT NULL,
    pro_rated_quotas boolean DEFAULT true NOT NULL,
    weekly_hours integer DEFAULT 40 NOT NULL,
    monthly_hours integer DEFAULT 176 NOT NULL,
    attendance_policy text DEFAULT ''::text NOT NULL,
    attendance_policy_file_url text DEFAULT ''::text NOT NULL,
    attendance_policy_file_name text DEFAULT ''::text NOT NULL,
    basic_salary_percent numeric(5,2) DEFAULT '50'::numeric NOT NULL,
    allowance_percent numeric(5,2) DEFAULT '50'::numeric NOT NULL,
    provident_fund_enabled boolean DEFAULT false NOT NULL,
    default_provident_fund_percent numeric(5,2) DEFAULT '5'::numeric NOT NULL,
    company_policy text DEFAULT ''::text NOT NULL,
    company_policy_file_url text DEFAULT ''::text NOT NULL,
    company_policy_file_name text DEFAULT ''::text NOT NULL,
    loan_min_tenure_months integer DEFAULT 12 NOT NULL,
    loan_max_salary_multiplier numeric(5,2) DEFAULT '1'::numeric NOT NULL,
    loan_default_months integer DEFAULT 6 NOT NULL,
    late_grace_count integer DEFAULT 2 NOT NULL,
    late_deduction_fraction numeric(4,2) DEFAULT 0.5 NOT NULL,
    late_absence_every integer DEFAULT 3 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: app_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.app_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: app_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.app_settings_id_seq OWNED BY public.app_settings.id;


--
-- Name: attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    date date NOT NULL,
    check_in_time timestamp with time zone,
    check_out_time timestamp with time zone,
    worked_minutes integer,
    status text DEFAULT 'present'::text NOT NULL,
    is_late boolean DEFAULT false NOT NULL,
    excused boolean DEFAULT false NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: attendance_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.attendance_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: attendance_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.attendance_id_seq OWNED BY public.attendance.id;


--
-- Name: designation_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.designation_changes (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    from_title text,
    to_title text NOT NULL,
    effective_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: designation_changes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.designation_changes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: designation_changes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.designation_changes_id_seq OWNED BY public.designation_changes.id;


--
-- Name: employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employees (
    id integer NOT NULL,
    user_id integer NOT NULL,
    name text NOT NULL,
    phone text,
    "position" text,
    department text,
    position_type text DEFAULT 'onsite'::text NOT NULL,
    joining_date date NOT NULL,
    probation_months integer DEFAULT 3 NOT NULL,
    office_start_time text DEFAULT '09:00'::text NOT NULL,
    office_end_time text DEFAULT '18:00'::text NOT NULL,
    grace_period_minutes integer DEFAULT 15 NOT NULL,
    basic_salary numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    allowances numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    casual_leave_quota integer DEFAULT 10 NOT NULL,
    sick_leave_quota integer DEFAULT 10 NOT NULL,
    annual_leave_quota integer DEFAULT 14 NOT NULL,
    date_of_birth date,
    education text,
    address text,
    avatar_url text,
    employee_code text,
    left_date date,
    emergency_contact text,
    cnic text,
    last_qualification text,
    previous_company text,
    last_pay numeric(12,2),
    benefits text,
    notes text,
    immediate_family text,
    employment_contract_url text,
    employment_contract_name text,
    provident_fund_percent numeric(5,2) DEFAULT '0'::numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: employees_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.employees_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: employees_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.employees_id_seq OWNED BY public.employees.id;


--
-- Name: general_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.general_requests (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    type text NOT NULL,
    date date NOT NULL,
    date_to date,
    amount numeric(12,2),
    reason text NOT NULL,
    attachment_url text,
    attachment_name text,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    mentioned_employee_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    installment_months integer,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone
);


--
-- Name: general_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.general_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: general_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.general_requests_id_seq OWNED BY public.general_requests.id;


--
-- Name: leave_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leave_requests (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    type text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    days integer NOT NULL,
    reason text NOT NULL,
    attachment_url text,
    attachment_name text,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    mentioned_employee_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone
);


--
-- Name: leave_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.leave_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: leave_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.leave_requests_id_seq OWNED BY public.leave_requests.id;


--
-- Name: loan_installments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loan_installments (
    id integer NOT NULL,
    loan_id integer NOT NULL,
    employee_id integer NOT NULL,
    month integer NOT NULL,
    year integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    payslip_id integer,
    paid_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: loan_installments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.loan_installments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: loan_installments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.loan_installments_id_seq OWNED BY public.loan_installments.id;


--
-- Name: loans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.loans (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    request_id integer,
    principal_amount numeric(12,2) NOT NULL,
    months_to_repay integer NOT NULL,
    start_month integer NOT NULL,
    start_year integer NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone
);


--
-- Name: loans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.loans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: loans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.loans_id_seq OWNED BY public.loans.id;


--
-- Name: news_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.news_posts (
    id integer NOT NULL,
    author_id integer NOT NULL,
    title text NOT NULL,
    body text DEFAULT ''::text NOT NULL,
    attachment_url text,
    attachment_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: news_posts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.news_posts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: news_posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.news_posts_id_seq OWNED BY public.news_posts.id;


--
-- Name: payslips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payslips (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    month integer NOT NULL,
    year integer NOT NULL,
    total_working_days integer NOT NULL,
    present_days integer NOT NULL,
    absent_days integer NOT NULL,
    paid_leave_days integer DEFAULT 0 NOT NULL,
    unpaid_leave_days integer DEFAULT 0 NOT NULL,
    late_count integer DEFAULT 0 NOT NULL,
    late_absence_days numeric(5,2) DEFAULT '0'::numeric NOT NULL,
    basic_salary numeric(12,2) NOT NULL,
    allowances numeric(12,2) NOT NULL,
    bonus numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    loan_deduction numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    other_deductions numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    net_salary numeric(12,2) NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payslips_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payslips_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payslips_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payslips_id_seq OWNED BY public.payslips.id;


--
-- Name: remote_work_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.remote_work_requests (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    date date NOT NULL,
    reason text NOT NULL,
    attachment_url text,
    attachment_name text,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    mentioned_employee_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone
);


--
-- Name: remote_work_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.remote_work_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: remote_work_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.remote_work_requests_id_seq OWNED BY public.remote_work_requests.id;


--
-- Name: salary_components; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salary_components (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    label text NOT NULL,
    kind text DEFAULT 'allowance'::text NOT NULL,
    value_type text DEFAULT 'fixed'::text NOT NULL,
    value numeric(12,2) DEFAULT '0'::numeric NOT NULL,
    is_deduction integer DEFAULT 0 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: salary_components_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.salary_components_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: salary_components_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.salary_components_id_seq OWNED BY public.salary_components.id;


--
-- Name: salary_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salary_events (
    id integer NOT NULL,
    employee_id integer NOT NULL,
    type text NOT NULL,
    amount numeric(12,2) NOT NULL,
    amount_mode text DEFAULT 'fixed'::text NOT NULL,
    percent_value numeric(6,2),
    date date NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: salary_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.salary_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: salary_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.salary_events_id_seq OWNED BY public.salary_events.id;


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_sessions (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    role text DEFAULT 'employee'::text NOT NULL,
    must_change_password boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: app_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings ALTER COLUMN id SET DEFAULT nextval('public.app_settings_id_seq'::regclass);


--
-- Name: attendance id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance ALTER COLUMN id SET DEFAULT nextval('public.attendance_id_seq'::regclass);


--
-- Name: designation_changes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designation_changes ALTER COLUMN id SET DEFAULT nextval('public.designation_changes_id_seq'::regclass);


--
-- Name: employees id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees ALTER COLUMN id SET DEFAULT nextval('public.employees_id_seq'::regclass);


--
-- Name: general_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.general_requests ALTER COLUMN id SET DEFAULT nextval('public.general_requests_id_seq'::regclass);


--
-- Name: leave_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests ALTER COLUMN id SET DEFAULT nextval('public.leave_requests_id_seq'::regclass);


--
-- Name: loan_installments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_installments ALTER COLUMN id SET DEFAULT nextval('public.loan_installments_id_seq'::regclass);


--
-- Name: loans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans ALTER COLUMN id SET DEFAULT nextval('public.loans_id_seq'::regclass);


--
-- Name: news_posts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_posts ALTER COLUMN id SET DEFAULT nextval('public.news_posts_id_seq'::regclass);


--
-- Name: payslips id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslips ALTER COLUMN id SET DEFAULT nextval('public.payslips_id_seq'::regclass);


--
-- Name: remote_work_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remote_work_requests ALTER COLUMN id SET DEFAULT nextval('public.remote_work_requests_id_seq'::regclass);


--
-- Name: salary_components id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_components ALTER COLUMN id SET DEFAULT nextval('public.salary_components_id_seq'::regclass);


--
-- Name: salary_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_events ALTER COLUMN id SET DEFAULT nextval('public.salary_events_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: app_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.app_settings (id, company_name, default_casual_leave_quota, default_sick_leave_quota, default_annual_leave_quota, default_grace_period_minutes, default_probation_months, default_office_start_time, default_office_end_time, weekly_off_days, public_holidays, pro_rated_quotas, weekly_hours, monthly_hours, attendance_policy, attendance_policy_file_url, attendance_policy_file_name, basic_salary_percent, allowance_percent, provident_fund_enabled, default_provident_fund_percent, company_policy, company_policy_file_url, company_policy_file_name, loan_min_tenure_months, loan_max_salary_multiplier, loan_default_months, late_grace_count, late_deduction_fraction, late_absence_every, updated_at) FROM stdin;
\.


--
-- Data for Name: attendance; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.attendance (id, employee_id, date, check_in_time, check_out_time, worked_minutes, status, is_late, excused, notes, created_at) FROM stdin;
1	1	2026-04-30	2026-04-30 09:20:00+05	\N	\N	present	f	f	\N	2026-05-01 02:10:15.166701+05
2	2	2026-04-30	2026-04-30 09:50:00+05	\N	\N	late	t	f	\N	2026-05-01 02:10:15.166701+05
3	1	2026-04-29	2026-04-30 10:10:15.166+05	2026-04-30 19:10:15.166+05	540	present	f	f	\N	2026-05-01 02:10:15.166701+05
4	2	2026-04-29	2026-04-30 11:10:15.166+05	2026-04-30 20:10:15.166+05	540	late	t	f	\N	2026-05-01 02:10:15.166701+05
5	3	2026-04-29	2026-04-30 10:22:15.166+05	2026-04-30 19:40:15.166+05	558	present	f	f	\N	2026-05-01 02:10:15.166701+05
\.


--
-- Data for Name: designation_changes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.designation_changes (id, employee_id, from_title, to_title, effective_date, created_at) FROM stdin;
\.


--
-- Data for Name: employees; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.employees (id, user_id, name, phone, "position", department, position_type, joining_date, probation_months, office_start_time, office_end_time, grace_period_minutes, basic_salary, allowances, casual_leave_quota, sick_leave_quota, annual_leave_quota, date_of_birth, education, address, avatar_url, employee_code, left_date, emergency_contact, cnic, last_qualification, previous_company, last_pay, benefits, notes, immediate_family, employment_contract_url, employment_contract_name, provident_fund_percent, created_at) FROM stdin;
1	2	Ayesha Khan	+92 300 1234567	Senior Product Designer	Design	onsite	2022-03-15	3	09:30	18:30	15	180000.00	25000.00	10	10	14	1993-07-22	BFA, National College of Arts	Lahore, Pakistan	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	2026-05-01 02:10:14.940297+05
2	3	Bilal Ahmed	+92 333 2223344	Lead Frontend Engineer	Engineering	remote	2021-09-01	3	10:00	19:00	10	240000.00	30000.00	12	10	18	1991-11-04	BSc Computer Science, FAST NUCES	Karachi, Pakistan	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	2026-05-01 02:10:15.019234+05
3	4	Hira Saleem	+92 321 9988776	HR Coordinator	People Ops	onsite	2024-01-10	6	09:00	18:00	15	110000.00	15000.00	10	10	14	1996-05-18	MBA, IBA Karachi	Islamabad, Pakistan	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	2026-05-01 02:10:15.088879+05
4	5	Omar Siddiqui	+92 345 1112233	Backend Engineer	Engineering	onsite	2025-08-04	3	10:00	19:00	15	165000.00	18000.00	8	8	12	1998-02-09	BS Software Engineering, NUST	Rawalpindi, Pakistan	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	0.00	2026-05-01 02:10:15.156129+05
\.


--
-- Data for Name: general_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.general_requests (id, employee_id, type, date, date_to, amount, reason, attachment_url, attachment_name, attachments, mentioned_employee_ids, status, installment_months, applied_at, reviewed_at) FROM stdin;
\.


--
-- Data for Name: leave_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.leave_requests (id, employee_id, type, start_date, end_date, days, reason, attachment_url, attachment_name, attachments, mentioned_employee_ids, status, applied_at, reviewed_at) FROM stdin;
1	3	casual	2026-05-03	2026-05-04	2	Family event	\N	\N	[]	[]	pending	2026-05-01 02:10:15.16404+05	\N
2	4	sick	2026-04-23	2026-04-23	1	Flu	\N	\N	[]	[]	approved	2026-05-01 02:10:15.16404+05	2026-04-24 02:10:15.16+05
3	1	annual	2026-05-14	2026-05-18	5	Vacation	\N	\N	[]	[]	pending	2026-05-01 02:10:15.16404+05	\N
\.


--
-- Data for Name: loan_installments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.loan_installments (id, loan_id, employee_id, month, year, amount, payslip_id, paid_at) FROM stdin;
\.


--
-- Data for Name: loans; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.loans (id, employee_id, request_id, principal_amount, months_to_repay, start_month, start_year, status, notes, created_at, closed_at) FROM stdin;
\.


--
-- Data for Name: news_posts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.news_posts (id, author_id, title, body, attachment_url, attachment_name, created_at) FROM stdin;
\.


--
-- Data for Name: payslips; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.payslips (id, employee_id, month, year, total_working_days, present_days, absent_days, paid_leave_days, unpaid_leave_days, late_count, late_absence_days, basic_salary, allowances, bonus, loan_deduction, other_deductions, net_salary, generated_at) FROM stdin;
\.


--
-- Data for Name: remote_work_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.remote_work_requests (id, employee_id, date, reason, attachment_url, attachment_name, attachments, mentioned_employee_ids, status, applied_at, reviewed_at) FROM stdin;
\.


--
-- Data for Name: salary_components; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.salary_components (id, employee_id, label, kind, value_type, value, is_deduction, sort_order, created_at) FROM stdin;
\.


--
-- Data for Name: salary_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.salary_events (id, employee_id, type, amount, amount_mode, percent_value, date, reason, created_at) FROM stdin;
1	1	increment	20000.00	fixed	\N	2024-01-15	Annual increment	2026-05-01 02:10:15.157077+05
2	1	bonus	50000.00	fixed	\N	2025-12-20	Year-end bonus	2026-05-01 02:10:15.157077+05
3	2	increment	30000.00	fixed	\N	2024-09-01	Promotion to Lead	2026-05-01 02:10:15.157077+05
4	2	loan	150000.00	fixed	\N	2025-06-10	Personal loan	2026-05-01 02:10:15.157077+05
5	3	bonus	20000.00	fixed	\N	2025-07-01	Onboarding bonus	2026-05-01 02:10:15.157077+05
\.


--
-- Data for Name: user_sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_sessions (sid, sess, expire) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, email, password_hash, role, must_change_password, created_at) FROM stdin;
1	admin@hiqain.com	$2b$10$sk.luSaEWkp0JnibBmuf1./.p0ClUakq6iI99dJfHaQMoANtufrNO	admin	f	2026-05-01 02:10:14.86067+05
2	ayesha@hiqain.com	$2b$10$tJw40K0rS5JSZNr5sD.Ep.orG/kHz9c4TJhnp.lyPuZVLcDfJ87VG	employee	t	2026-05-01 02:10:14.936851+05
3	bilal@hiqain.com	$2b$10$ztTA.bDhdrKts1gg2sZGlOIphPSKTIG2pJfJOW4zSUexTAW2crX3m	employee	t	2026-05-01 02:10:15.017999+05
4	hira@hiqain.com	$2b$10$j7qniiHsnLJDVtRYjjeQtOU5cCfMRDG/ZFjAAydbpkGOSJu1y9Zbq	employee	t	2026-05-01 02:10:15.08772+05
5	omar@hiqain.com	$2b$10$QWF5Rt/LRwSI7Og6nH3plewjsavWchHxQy5SZlceL04ej3JgWNqdW	employee	t	2026-05-01 02:10:15.154931+05
\.


--
-- Name: app_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.app_settings_id_seq', 1, false);


--
-- Name: attendance_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.attendance_id_seq', 5, true);


--
-- Name: designation_changes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.designation_changes_id_seq', 1, false);


--
-- Name: employees_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.employees_id_seq', 4, true);


--
-- Name: general_requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.general_requests_id_seq', 1, false);


--
-- Name: leave_requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.leave_requests_id_seq', 3, true);


--
-- Name: loan_installments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.loan_installments_id_seq', 1, false);


--
-- Name: loans_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.loans_id_seq', 1, false);


--
-- Name: news_posts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.news_posts_id_seq', 1, false);


--
-- Name: payslips_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.payslips_id_seq', 1, false);


--
-- Name: remote_work_requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.remote_work_requests_id_seq', 1, false);


--
-- Name: salary_components_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.salary_components_id_seq', 1, false);


--
-- Name: salary_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.salary_events_id_seq', 5, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 5, true);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--
-- Name: designation_changes designation_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designation_changes
    ADD CONSTRAINT designation_changes_pkey PRIMARY KEY (id);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: employees employees_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_user_id_unique UNIQUE (user_id);


--
-- Name: general_requests general_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.general_requests
    ADD CONSTRAINT general_requests_pkey PRIMARY KEY (id);


--
-- Name: leave_requests leave_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_pkey PRIMARY KEY (id);


--
-- Name: loan_installments loan_installments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_installments
    ADD CONSTRAINT loan_installments_pkey PRIMARY KEY (id);


--
-- Name: loans loans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_pkey PRIMARY KEY (id);


--
-- Name: news_posts news_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_posts
    ADD CONSTRAINT news_posts_pkey PRIMARY KEY (id);


--
-- Name: payslips payslips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_pkey PRIMARY KEY (id);


--
-- Name: remote_work_requests remote_work_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remote_work_requests
    ADD CONSTRAINT remote_work_requests_pkey PRIMARY KEY (id);


--
-- Name: salary_components salary_components_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_components
    ADD CONSTRAINT salary_components_pkey PRIMARY KEY (id);


--
-- Name: salary_events salary_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_events
    ADD CONSTRAINT salary_events_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (sid);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: IDX_user_sessions_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_user_sessions_expire" ON public.user_sessions USING btree (expire);


--
-- Name: attendance_emp_date_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX attendance_emp_date_unique ON public.attendance USING btree (employee_id, date);


--
-- Name: payslip_emp_month_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payslip_emp_month_unique ON public.payslips USING btree (employee_id, month, year);


--
-- Name: attendance attendance_employee_id_employees_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: designation_changes designation_changes_employee_id_employees_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.designation_changes
    ADD CONSTRAINT designation_changes_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: employees employees_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: general_requests general_requests_employee_id_employees_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.general_requests
    ADD CONSTRAINT general_requests_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: leave_requests leave_requests_employee_id_employees_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: loan_installments loan_installments_employee_id_employees_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_installments
    ADD CONSTRAINT loan_installments_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: loan_installments loan_installments_loan_id_loans_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loan_installments
    ADD CONSTRAINT loan_installments_loan_id_loans_id_fk FOREIGN KEY (loan_id) REFERENCES public.loans(id) ON DELETE CASCADE;


--
-- Name: loans loans_employee_id_employees_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.loans
    ADD CONSTRAINT loans_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: news_posts news_posts_author_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_posts
    ADD CONSTRAINT news_posts_author_id_users_id_fk FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payslips payslips_employee_id_employees_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payslips
    ADD CONSTRAINT payslips_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: remote_work_requests remote_work_requests_employee_id_employees_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.remote_work_requests
    ADD CONSTRAINT remote_work_requests_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: salary_components salary_components_employee_id_employees_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_components
    ADD CONSTRAINT salary_components_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: salary_events salary_events_employee_id_employees_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salary_events
    ADD CONSTRAINT salary_events_employee_id_employees_id_fk FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 30kyKOj3Lpu5EVACcaLBQLJslU5PNHcIsTbOMLpbtZqYadoffsbsTgXHHqHR2uk

