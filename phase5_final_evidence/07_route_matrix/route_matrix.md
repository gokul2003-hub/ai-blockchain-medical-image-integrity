# MediSecure AI — Frontend / Backend Route Integration Matrix

| Role | Frontend Route | Page | Backend API | HTTP Method | Auth Required | Role Required | Consent Required | Time-Bound | Runtime Tested | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| Shared / Auth | `/login` | Login Screen | `/api/v1/auth/login` | `POST` | No | `None` | No | No | Yes | **OPERATIONAL** |
| Shared / Auth | `/register` | Registration Screen | `/api/v1/auth/register` | `POST` | No | `None` | No | No | Yes | **OPERATIONAL** |
| Shared / Auth | `/profile` | User Profile | `/api/v1/auth/me` | `GET` | Yes | `Authenticated` | No | No | Yes | **OPERATIONAL** |
| Patient | `/patient/dashboard` | Patient Dashboard | `/api/v1/auth/me` | `GET` | Yes | `patient` | No | No | Yes | **OPERATIONAL** |
| Patient | `/patient/images` | My Medical Images | `/api/v1/images/list` | `GET` | Yes | `patient` | No (Owner) | No | Yes | **OPERATIONAL** |
| Patient | `/patient/image-view/:id` | Image Viewer | `/api/v1/images/preview/{id}` | `GET` | Yes | `patient` | No (Owner) | No | Yes | **OPERATIONAL** |
| Patient | `/patient/consent` | Consent Management | `/api/v1/permissions/consents` | `GET` | Yes | `patient` | No | Yes | Yes | **OPERATIONAL** |
| Patient | `/patient/grant-consent` | Grant Access Modal | `/api/v1/permissions` | `POST` | Yes | `patient` | No | Yes | Yes | **OPERATIONAL** |
| Patient | `/patient/revoke-consent/:id` | Revoke Access Action | `/api/v1/permissions/consent/revoke/{id}` | `POST` | Yes | `patient` | No | No | Yes | **OPERATIONAL** |
| Doctor / Radiologist | `/doctor/dashboard` | Doctor Dashboard | `/api/v1/analytics/dashboard` | `GET` | Yes | `doctor, radiologist` | No | No | Yes | **OPERATIONAL** |
| Doctor / Radiologist | `/doctor/images` | Clinical Image Repository | `/api/v1/images/list` | `GET` | Yes | `doctor, radiologist` | Yes (or Same Hospital) | Yes | Yes | **OPERATIONAL** |
| Doctor / Radiologist | `/doctor/upload` | DICOM Upload Portal | `/api/v1/images/upload` | `POST` | Yes | `doctor, radiologist` | No (Uploader) | No | Yes | **OPERATIONAL** |
| Doctor / Radiologist | `/doctor/verify/:id` | Digital Twin & Integrity | `/api/v1/images/digital-twin/{id}` | `GET` | Yes | `doctor, radiologist` | Yes | Yes | Yes | **OPERATIONAL** |
| Doctor / Radiologist | `/doctor/evidence/:id` | Forensic Evidence Dossier | `/api/v1/images/{id}/integrity-evidence` | `GET` | Yes | `doctor, radiologist` | Yes | Yes | Yes | **OPERATIONAL** |
| Doctor / Radiologist | `/doctor/forensics/:id` | AI SRM / Swin-UNet Heatmap | `/api/v1/images/heatmap/by-image/{id}` | `GET` | Yes | `doctor, radiologist` | Yes | Yes | Yes | **OPERATIONAL** |
| Doctor / Radiologist | `/doctor/recover/:id` | Self-Recovery Action | `/api/v1/images/recover/{id}` | `POST` | Yes | `doctor, radiologist` | Yes | Yes | Yes | **OPERATIONAL** |
| Doctor / Radiologist | `/doctor/recovery-records` | Recovery Audit Log | `/api/v1/images/recovery-records` | `GET` | Yes | `doctor, radiologist` | No | No | Yes | **OPERATIONAL** |
| Doctor / Radiologist | `/doctor/download/:id` | Decrypted Image Download | `/api/v1/images/download/{id}` | `GET` | Yes | `doctor, radiologist` | Yes | Yes | Yes | **OPERATIONAL** |
| Doctor / Radiologist | `/doctor/report/:id` | Forensic PDF Report | `/api/v1/images/report/{id}/download` | `GET` | Yes | `doctor, radiologist` | Yes | Yes | Yes | **OPERATIONAL** |
| Hospital Admin | `/admin/dashboard` | Hospital Admin Dashboard | `/api/v1/analytics/dashboard` | `GET` | Yes | `hospital_admin, super_admin` | No | No | Yes | **OPERATIONAL** |
| Hospital Admin | `/admin/doctors` | Doctor Management | `/api/v1/users/doctors` | `GET` | Yes | `hospital_admin, super_admin` | No | No | Yes | **OPERATIONAL** |
| Hospital Admin | `/admin/patients` | Patient Registry | `/api/v1/users/patients` | `GET` | Yes | `hospital_admin, super_admin` | No | No | Yes | **OPERATIONAL** |
| Hospital Admin | `/admin/blockchain` | Blockchain Ledger Explorer | `/api/v1/blockchain/blocks` | `GET` | Yes | `hospital_admin, super_admin` | No | No | Yes | **OPERATIONAL** |
| Hospital Admin | `/admin/verify-ledger` | Cryptographic Ledger Audit | `/api/v1/blockchain/verify-chain` | `GET` | Yes | `hospital_admin, super_admin` | No | No | Yes | **OPERATIONAL** |
| Hospital Admin | `/admin/hospitals` | Hospital Node Management | `/api/v1/hospitals` | `GET, POST` | Yes | `hospital_admin, super_admin` | No | No | Yes | **OPERATIONAL** |
| Hospital Admin | `/admin/consents` | Global Consent Audit | `/api/v1/permissions/consents` | `GET` | Yes | `hospital_admin, super_admin` | No | No | Yes | **OPERATIONAL** |
| Researcher | `/researcher/dashboard` | Researcher Dashboard | `/api/v1/analytics/dashboard` | `GET` | Yes | `researcher, super_admin` | De-identified Only | No | Yes | **OPERATIONAL** |
| Researcher | `/researcher/fhe-benchmarks` | FHE Benchmark Explorer | `/api/v1/analytics/fhe-benchmark` | `GET` | Yes | `researcher, super_admin` | No (Synthetic) | No | Yes | **OPERATIONAL (Simulation)** |
| Researcher | `/researcher/federated-learning` | Federated Learning Simulation | `/api/v1/analytics/research-simulation` | `POST` | Yes | `researcher, super_admin` | No (Synthetic) | No | Yes | **OPERATIONAL (Simulation)** |