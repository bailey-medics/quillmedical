# Features — Teaching

## Router

::: app.features.teaching.router

## Models

::: app.features.teaching.models

## Schemas

::: app.features.teaching.schemas

## Scoring

::: app.features.teaching.scoring

## Certificate

::: app.features.teaching.certificate

## Email Templates

::: app.features.teaching.email_templates

## MDX Parser

::: app.features.teaching.mdx_parser

## Storage

::: app.features.teaching.storage

## Sync

::: app.features.teaching.sync

## Feature gating

::: app.features.gating

## Content validation tooling

The `tooling` package validates question bank content. The same code runs at
both gates: the merge gate in a content repository's CI, and the backend at
sync. It imports nothing from FastAPI, SQLAlchemy or `app.config`, so it can
be installed on its own with only Pydantic and PyYAML.

### Validator

::: app.features.teaching.tooling.validate

### Module schema

::: app.features.teaching.tooling.module_schema

### Certificate schema

::: app.features.teaching.tooling.certificate_schema

### Annotations

::: app.features.teaching.tooling.annotations

### Version lock check

::: app.features.teaching.tooling.check_version_lock

### Command line interface

::: app.features.teaching.tooling.cli
