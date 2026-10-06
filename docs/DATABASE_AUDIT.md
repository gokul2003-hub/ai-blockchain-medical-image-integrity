# Database Architecture Audit — Pre-PostgreSQL Migration

> **AUDIT ONLY** — no code, schema, packages, or configuration were modified.
> Read-only inspection performed against source tree and a read-only SQLite open (`mode=ro`).
> Date: 2026-10-05 · Start 22:53:03 · Backend: FastAPI (`backend/app`)

---

## A. Current Database Technology

| Item | Value |
|---|---|
| RDBMS | **SQLite 3** (file-based) |
| File | `backend/medical_sharing.db` |
| URL default | `sqlite:///{BASE_DIR}/medical_sharing.db` (`app/config.py:200`) |
| Override | `DATABASE_URL` env var (`app/config.py:257`, exported at `:292`) |
| Live size facts | **28 tables, 123 indexes** |
| PostgreSQL driver | `psycopg2-binary==2.9.9` already pinned in `requirements.txt` (unused) |

## B. Current Connection/Configuration

- `app/config.py` → `Settings.database_url` (pydantic-free loader), `DATABASE_URL` compat export.
- `app/database.py`:
  - `create_engine(DATABASE_URL, connect_args=..., pool_pre_ping=True)`
  - `connect_args = {"check_same_thread": False}` **only when URL startswith `sqlite`** → PostgreSQL path is already clean here.
  - SQLite-only `event.listens_for(engine, "connect")` enabling `PRAGMA foreign_keys=ON`.
  - `SessionLocal = sessionmaker(autocommit=False, autoflush=False)`, `Base = declarative_base()`, `get_db()` dependency.
- `AUTO_CREATE_SCHEMA` (`config.py:265`): defaults **on** outside production, off in production.
- Consumers of the session: all route modules (`auth, images, audit, blockchain, analytics, users, permissions, hospitals, forensic_demo`) via `get_db`, plus `app/auth.py`, `app/blockchain.py`, `app/event_listener.py`, `app/celery_worker.py`, `app/main.py`, `scripts/backfill_dids.py`, `scripts/repair_ledger.py`.

## C. Existing Models/Tables (28 — all in `app/models.py`, SQLAlchemy 2.0 style)

| # | Table | Rows (live) |
|---|---|---|
| 1 | `hospitals` | 3 |
| 2 | `users` | 55 |
| 3 | `patient_profiles` | 30 |
| 4 | `doctor_profiles` | 2 |
| 5 | `medical_images` | 23 |
| 6 | `permissions` | 1 |
| 7 | `blockchain_transactions` | 676 |
| 8 | `audit_logs` | 265 |
| 9 | `reports` | 1 |
| 10 | `dicom_metadata_records` | 0 |
| 11 | `revocation_registry_logs` | 0 |
| 12 | `device_fingerprints` | 0 (write path: `routes/images.py:659`) |
| 13 | `phi_access_logs` | 0 |
| 14 | `dicom_slices` | 0 (write path: `routes/images.py:334`) |
| 15 | `digital_integrity_twins` | 13 |
| 16 | `tamper_risk_logs` | 0 |
| 17 | `recovery_records` | 21 |
| 18 | `user_security_states` | 33 |
| 19 | `mfa_credentials` | 1 |
| 20 | `auth_sessions` | 119 |
| 21 | `consent_grants` | 4 |
| 22 | `image_versions` | 0 |
| 23 | `ai_inferences` | 0 |
| 24 | `integrity_events` | 0 |
| 25 | `doctor_identities` | 0 |
| 26 | `patient_identities` | 0 |
| 27 | `researcher_identities` | 0 |
| 28 | `admin_identities` | 0 |

**ORM:** SQLAlchemy 2.0.31 (`declarative_base`, `Mapped`-era classes in one `models.py`). No Prisma/Mongo/Tortoise.

## D. Existing Persistent Data (DB-backed today)

1. **Auth/user persistence** ✅ — `users` (55), password hashes via `app/auth.py` (`get_password_hash`), `auth_sessions` (119, written `auth.py:98`), `user_security_states` (33, `auth.py:65`), `mfa_credentials` (1, TOTP secret + recovery hashes as JSON strings, `auth.py:181-208`).
2. **RBAC/role persistence** ✅ — role column on `users`; `permissions` table (grants written by `event_listener.py:99`, `main.py:332`, `routes/permissions.py:55`); `consent_grants` with `actions_json` (read by `app/authorization.py:127`).
3. **Medical-image metadata** ✅ — `medical_images` (23: hash, quarantine_status, uploader/patient/hospital FKs, entropy, quality).
4. **DICOM metadata** ✅ (schema + write path `routes/images.py:326/334`) — no rows yet (no DICOM uploads).
5. **Encryption metadata** ✅ (partial) — ciphertext lives on disk (`*.enc`, storage provider/IPFS); hashes + status in `medical_images`; MFA secrets encrypted-at-rest via master key.
6. **SHA-3/hash persistence** ✅ — `medical_images.original_hash`, `blockchain_transactions.hash/previous_hash` (676 rows).
7. **Digital Integrity Twin** ✅ — `digital_integrity_twins` (13, written `app/digital_twin.py:37`).
8. **Recovery history** ✅ — `recovery_records` (21, written `app/recovery.py:179`).
9. **Consent/access control** ✅ — `consent_grants` (4), `permissions` (1), routes/permissions.py CRUD.
10. **Audit/security events** ✅ — `audit_logs` (265), `phi_access_logs` (schema ready, no rows), `revocation_registry_logs` (schema ready).
11. **Blockchain/CID metadata** ✅ — `blockchain_transactions` (676: block numbers, payload JSON incl. IPFS CIDs, written `app/blockchain.py`).
12. **Reports** ✅ — `reports` table (1 row, write `routes/images.py:703`) + generated report files on disk.
13. **Device fingerprints** ✅ (write path found; 0 rows).

## E. Missing Persistence

| Area | Status |
|---|---|
| **Risk/trust results** | ❌ **NOT persisted.** `TamperRiskLog` is queried (`routes/images.py:1811`) but **no constructor/write exists** → table empty, endpoint always reads `None`. Frontend risk card uses a **static `is_tampered ? 88 : 12`** value (`DoctorWorkspace.tsx`). |
| **AI forensic inferences** | ❌ `ai_inferences` has **no write path found**; forensic pipeline output persists only indirectly (twin record + files on disk). |
| **Tamper localization masks** | ⚠️ saved as **files** (storage) — path/metadata not in a dedicated table. |
| **Notifications** | ❌ **In-memory only** — `app/notifications.py` keeps `active_connections: List[WebSocket]`; no model, no rows. Lost on restart. |
| **Integrity events / image versions** | ⚠️ tables exist, **no write path located** in scan. |
| **PHI access log / revocation log** | ⚠️ tables exist, no rows (write path not located for `phi_access_logs`; revocation writes not located). |
| **Identity tables (4)** | ⚠️ all 0 rows; no constructor calls found outside models (optional-identity feature may write elsewhere — verify before migration). |
| **Frontend-only state** | JWT + `med_role` in `localStorage`; theme state; some view values derived client-side (static risk score noted above). |
| **Demo dataset metadata** | JSON/CSV manifests written to disk by `forensic_dataset.py` (not DB). |

## F. Existing Migration System

- **Alembic 1.13.2 installed** (`requirements.txt`), `alembic.ini` + `alembic/env.py` present and **wired to `app.config.DATABASE_URL`** (`env.py:14,27`) and `app.database.Base` metadata.
- **`alembic/versions/` is EMPTY — zero revisions.** No migration has ever been generated.
- Schema is created by **`Base.metadata.create_all`** at module import (`main.py:21`) and startup (`main.py:138`), gated by `AUTO_CREATE_SCHEMA`.
- Known drift hazard (documented in `app/identity.py:54`): `create_all` never adds columns to existing tables → live DB may lag models; Alembic baseline must diff against the live file.

## G. Existing Database Tests

- `tests/conftest.py` sets `DATABASE_URL` to a **separate SQLite test DB** (`conftest.py:31`), `create_all` per session (`:47`), teardown at `:59` — tests do **not** run against the dev DB.
- DB-touching suites: `test_authorization_consent`, `test_storage_blockchain`, `test_security_auth`, `test_optional_identity_registration`, `test_recovery_api_and_reports`, `test_phase3_production_boundaries`, `test_registration_security`, `test_end_to_end_framework`, `test_integrity_evidence`, `test_recovery_api_and_reports` (of ~25 total).
- No PostgreSQL-specific tests exist.

## H. PostgreSQL Migration Requirements

**Already compatible:**
1. SQLAlchemy 2.0 + Alembic wiring; `psycopg2-binary` pinned.
2. `connect_args` branch isolates SQLite-only options; PRAGMA listener is URL-guarded.
3. `get_db()`/session patterns are engine-agnostic.
4. Tests already redirect `DATABASE_URL` — same mechanism can point at PG (e.g. testcontainers/CI PG).

**Required work:**
1. **Generate an Alembic baseline** from the *live* SQLite schema (not from models, to capture drift), then a PG revision.
2. Replace production reliance on `create_all` (already disabled in prod) with Alembic migrations.
3. **Type mapping audit**: JSON-in-TEXT columns (`actions_json`, `payload`, `encrypted_totp_secret`, …) → decide `JSONB` vs keep TEXT; `String` case sensitivity (`ilike`/`LIKE` behavior differs — SQLite `NOCASE` vs PG case-sensitive); `DateTime` storage/timezone; booleans (SQLite 0/1 → PG `BOOLEAN`, SQLAlchemy usually handles).
4. **Data migration**: export 28 tables from `medical_sharing.db` (read-only copy) → `pgloader` or Alembic data migration; preserve row counts (see §C totals: ~1,251 rows — tiny).
5. **Connection pooling**: set `pool_size/max_overflow`, keep `pool_pre_ping`; remove nothing SQLite-specific until cutover.
6. **Env/prod**: `DATABASE_URL=postgresql+psycopg2://...`, ensure `AUTO_CREATE_SCHEMA=false` + migration run in deploy pipeline.
7. **Collation/UNIQUE indexes** (123 indexes): verify unique constraints (e.g. usernames, hashes) survive case-sensitive PG comparison.
8. Keep blob/enc files on filesystem/IPFS — no BLOB migration needed.

## I. Risks/Issues

| Severity | Risk |
|---|---|
| 🔴 High | **No migrations exist**; `create_all` drift means models ≠ live schema possible → must diff before baseline. |
| 🔴 High | **Risk/AI results silently not persisted** (`tamper_risk_logs`, `ai_inferences` never written) — migrating preserves the gap; dashboards reading them stay empty. |
| 🟡 Medium | JSON-as-TEXT columns may need `JSONB`; app code uses `json.loads` on them (keep TEXT to avoid code change, or migrate both). |
| 🟡 Medium | SQLite case-insensitive comparisons (`LIKE`/collation) → PG case-sensitive could change auth/lookup behavior — audit queries (`auth.py`, `authorization.py`, `users.py`). |
| 🟡 Medium | Notifications in-memory → lost across workers (Celery already separate process); PG won't fix; needs its own table/Redis later. |
| 🟢 Low | SQLite `check_same_thread` and PRAGMA listeners are properly guarded. |
| 🟢 Low | Single-file DB easy to copy for cutover; small row counts → low migration risk. |
| 🟢 Low | `medical_sharing.db` sitting in repo dir — ensure it is not committed/treated as source of truth. |

## J. Recommended Migration Plan (PostgreSQL)

1. **Freeze & snapshot** — copy `medical_sharing.db` read-only; run `PRAGMA integrity_check` + row-count baseline (§C).
2. **Alembic baseline from live SQLite** (`alembic revision --autogenerate` against the file DB with `target_metadata=Base`) → commit as revision 0001; reconcile any model/schema drift manually.
3. **Stand up PostgreSQL** (dev first) — set `DATABASE_URL=postgresql+psycopg2://...`; run `alembic upgrade head`.
4. **Load data** — `pgloader` (sqlite → pg) or per-table export/import; verify all 28 tables' counts match; spot-check `users`, `medical_images`, `blockchain_transactions` hashes byte-for-byte.
5. **Type & query pass** — decide TEXT vs JSONB; grep for `LIKE`/`ilike`/collation-sensitive queries; run the full pytest suite with `DATABASE_URL` pointed at PG.
6. **Dual-run validation** — point a staging backend at PG, replay demo logins + upload + audit flows; compare API responses vs SQLite instance.
7. **Cutover** — production: `AUTO_CREATE_SCHEMA=false`, deploy runs `alembic upgrade head`; switch `DATABASE_URL`; keep SQLite file as rollback for one release.
8. **Fix persistence gaps post-migration** (separate task): write `tamper_risk_logs`/`ai_inferences`, move notifications out of memory.

---

## TERMINAL SUMMARY

```
DATABASE:              SQLite 3 (backend/medical_sharing.db, DATABASE_URL overridable)
ORM:                   SQLAlchemy 2.0.31 (declarative, app/models.py)
MIGRATION TOOL:        Alembic 1.13.2 configured — 0 revisions (versions/ empty)
EXISTING TABLES:       28 (hospitals, users, patient_profiles, doctor_profiles,
                       medical_images, permissions, blockchain_transactions,
                       audit_logs, reports, dicom_metadata_records, dicom_slices,
                       revocation_registry_logs, device_fingerprints, phi_access_logs,
                       digital_integrity_twins, tamper_risk_logs, recovery_records,
                       user_security_states, mfa_credentials, auth_sessions,
                       consent_grants, image_versions, ai_inferences, integrity_events,
                       doctor/patient/researcher/admin_identities)
PERSISTENT MODULES:    auth (users/sessions/MFA/security state), RBAC (permissions),
                       consent, medical-image metadata + SHA-3 hashes, DICOM metadata,
                       integrity twins, recovery records, audit logs, blockchain tx/CID,
                       reports, device fingerprints
MISSING MODULES:       risk/trust results (tamper_risk_logs never written; static 88/12
                       in frontend), AI inference rows (ai_inferences unwritten),
                       notifications (in-memory WebSocket list), integrity_events,
                       image_versions, phi_access_logs (no rows/write path located),
                       localization masks (files only, no table)
POSTGRESQL READY:      YES (driver pinned, engine/session URL-guarded, tests redirect URL;
                       needs Alembic baseline + type/collation audit + data load)
MAJOR CHANGES REQUIRED: NO (configuration-level migration; no rewrite needed)
```

*Audit performed read-only; no files in the application were modified by this audit except this document.*
