# Security

## Reporting a vulnerability

Email **mohanadtsx@gmail.com**.

The repository this is built from is private, so there is no issue tracker or
advisory form to reach — which also means a report has nowhere public to leak
to before it is fixed. Please include the file that triggers it if there is
one.

Expect an acknowledgement within a few days.

## What is worth reporting

Cadence opens files that arrive from anywhere and parses them: containers,
codecs, subtitle tracks. A malformed file that causes anything beyond a clean
error message is a security issue, not a bug report.

The update channel is the other sensitive surface. Updates are signed, and the
installed application refuses any it cannot verify against the public key built
into it. A way around that check is worth reporting immediately.
