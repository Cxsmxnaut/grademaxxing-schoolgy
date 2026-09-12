# Security policy

## Reporting a vulnerability

Do not open a public issue for a vulnerability, exposed credential, session artifact, or student-data incident. Use the repository's private GitHub security-advisory reporting flow so maintainers can investigate before details are disclosed.

Never include a real StudentVUE password, cookie, token, student identifier, grade, attendance record, message, document, attachment, portal response, or student screenshot in a report. Use synthetic examples and describe the minimum reproduction steps needed to establish impact.

## Supported version

Grademaxxing is a beta. Only the version deployed from the current default branch receives security fixes.

## Security boundaries

- The product is read-only with respect to StudentVUE.
- Credentials are used only to establish or reconnect a session and are not stored server-side.
- Portal session state is encrypted and carried in an HttpOnly application cookie.
- StudentVUE requests that can mutate upstream focus remain serialized per session.
- Production observability is disabled to keep student records out of provider logs.

Operational response and verification procedures are documented in [docs/operations-runbook.md](docs/operations-runbook.md) and [docs/production-hardening.md](docs/production-hardening.md).
