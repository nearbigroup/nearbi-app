# Mandatory Agent Rules for Nearbi Staff App

These standing rules apply to any coding agent or developer working on this codebase. You must follow them strictly without exception:

1. **Keep the Staff App Simple**: Put complexity on the administrative and management side. The employee-facing interface must remain lightweight, fast, and frictionless.
2. **Strict Salary Privacy**: Staff must NEVER see salary figures or breakdowns. `partner_viewer` is view-only with employee photos hidden (full salary view is permitted for partners).
3. **Never Silently Change Confirmed or Locked Months**: Operate on pending data only. Any data correction or historical adjustment must be fully audited and owner-approved.
4. **Fines Protection Rules**:
   - Confirmed fines never change.
   - Waived fines are NEVER reset to pending or re-priced.
   - Never run Recalculate for past months.
5. **Hourly & Shift Exemptions**: Hourly staff (`pay_type = 'hourly'`) and staff without an assigned shift get NO late fines.
6. **Fine Structure**:
   - Yellow fine: Rs 20 (first 4 yellow lates in a calendar month are free).
   - Orange fine: Rs 30 (no free passes).
   - Red fine: Rs 50 (no free passes).
   - Late minutes and early leave minutes are also deducted from salary prorated by minute rate.
7. **Rigorous Verification & Proven Output**: Always perform a dry run first, add a "stop and report if different" guard, and prove results with live queries. Never write a report table from memory.
8. **Paginated Reads**: Supabase reads exceeding 1,000 rows must be paginated using `fetchAllPages` or explicit `.range()` offsets. Never rely on unpaginated `.select()` that truncates at 1,000 rows.
9. **Zero-Secret Policy**:
   - Never print, log, or commit secrets (API keys, service role keys, passwords, database URLs, or access tokens).
   - Never change the git remote URL or try alternate tokens if a push fails: report the failure reason immediately.
10. **Data Protection in Git**:
    - Do not commit exports, CSVs, PDFs, backups, or any files containing personal or staff data.
    - Ensure `.gitignore` continuously excludes `.env*`, `exports*`, `test-output*`, `perf_*`, and temporary data dumps.
