# Stripe Sandbox Consumer

A realistic consumer test repository to test and demonstrate the **ApiPatch** autonomous API remediation and verification engine.

## Overview

This repository demonstrates breaking change detection, AST automated remediation, and sandbox verification on Stripe's legacy Charges API (`stripe.charges.create` using the deprecated `source` parameter).

## Requirements

- [Bun](https://bun.sh/) (or Node.js >= 20)
- TypeScript 5.x

## Project Structure

```
stripe-sandbox-consumer/
├── apipatch.yml          # ApiPatch configuration
├── package.json          # Dependencies & scripts
├── tsconfig.json         # Strict TypeScript configuration
├── src/
│   ├── billing.ts        # Legacy Stripe charge logic (source param)
│   └── index.ts          # Public module exports
└── test/
    └── billing.test.ts   # Offline mock test suite
```

## Setup & Local Testing

Install dependencies:
```bash
bun install
```

Run TypeScript checks:
```bash
bun run typecheck
```

Run tests:
```bash
bun test
```

## ApiPatch CLI Testing Instructions

Run the following commands using the ApiPatch CLI:

### 1. Validate Config
Validate `apipatch.yml` against the canonical schema:
```bash
bun run apipatch validate-config apipatch.yml
```

### 2. Scan for Breaking Changes
Scan the codebase for deprecated API symbols and matching migration recipes without modifying files:
```bash
bun run apipatch scan .
```

### 3. Preview AST Remediation Diff
Dry-run the deterministic AST remediation engine to preview code changes:
```bash
bun run apipatch run . --dry-run
```

### 4. Run Sandbox Verification Gate
Execute the containerized sandbox verification gate (install, typecheck, test):
```bash
bun run apipatch verify .
```

### 5. Preview Full GitHub PR Creation
Simulate end-to-end remediation, verification, branch creation, and PR publishing:
```bash
bun run apipatch publish . --dry-run --repo org/stripe-sandbox-consumer
```
