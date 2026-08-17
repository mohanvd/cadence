# Security

## Reporting a vulnerability

Report privately through
[GitHub security advisories](https://github.com/mohanvd/cadence/security/advisories/new),
not as a public issue.

Expect an acknowledgement within a few days.

## What is worth reporting

Cadence opens files that arrive from anywhere and parses them: containers,
codecs, subtitle tracks. A malformed file that causes anything beyond a clean
error message is a security issue, not a bug report.

The update channel is the other sensitive surface. Updates are signed, and the
installed application refuses any it cannot verify against the public key built
into it. A way around that check is worth reporting immediately.
