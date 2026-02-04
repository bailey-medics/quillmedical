# File Storage Architecture

## Overview

Quill Medical uses a three-layer storage architecture for clinical documents:

```text
┌─────────────────────────────────────────────────────────────┐
│                      Quill Backend (FastAPI)                 │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│    MinIO     │    │ PostgreSQL   │    │  EHRbase     │
│   (Binary    │    │  (Metadata)  │    │(DocumentRef) │
│   Storage)   │    │  & Audit)    │    │              │
└──────────────┘    └──────────────┘    └──────────────┘
```

## Storage Layers

### 1. Binary Storage (MinIO)

- Stores actual file bytes (PDFs, images, clinical letters)
- S3-compatible object storage
- Server-side encryption enabled
- Supports versioning and presigned URLs

### 2. Metadata & Audit (PostgreSQL)

- Stores file metadata (size, type, hash, ownership)
- Maintains complete audit trail of all access
- Links files to patients and users
- SHA-256 checksums for integrity verification

### 3. Clinical Index (FHIR)

- FHIR DocumentReference resources link documents to patients
- Enables standards-compliant document management
- Supports interoperability with other healthcare systems

## How It Works

### File Upload

1. User uploads file via API
2. Backend validates and calculates SHA-256 hash
3. Binary stored in MinIO
4. Metadata saved to PostgreSQL
5. EHRbase DocumentReference created

### File Download

1. Client requests document by ID
2. Backend checks permissions and logs access
3. Generates time-limited presigned URL (1 hour expiry)
4. Client downloads directly from MinIO

## Security

- **Encryption:** TLS in transit, server-side encryption at rest
- **Access Control:** JWT authentication + role-based permissions
- **Audit Trail:** All access logged (who, what, when)
- **Presigned URLs:** Temporary access only (default 1 hour)
- **Data Integrity:** SHA-256 checksums verified on upload and download

## Backup Strategy

- **MinIO:** Continuous replication + versioning
- **PostgreSQL:** Hourly incremental, daily full backups
- **Retention:** 30 days point-in-time recovery
- **Long-term:** Clinical records retained per NHS requirements (8+ years)

## Scaling

- **Current:** Single MinIO server (suitable for initial deployment and growth)
- **Distributed Cluster:** Upgrade when you need high availability, erasure coding, or exceed single-server hardware limits
- **Enterprise:** Migrate to Azure Blob Storage (UK region) when needed
- **Migration:** S3-compatible API enables seamless transition
