# Security reporting

The v0.1.0 preview is the current supported review target. It has unresolved runtime, bulk-processing, and complete-deletion concerns; do not assume a general-purpose production SLA.

Do not publish credentials, private user data, or exploit-ready details in issues. After staging, use GitHub's private vulnerability reporting if enabled on the repository Security tab. That channel is not yet verified during local preparation. If unavailable, open an issue asking for a private contact route without including sensitive details; do not disclose until a private route is established. There is no promised response time or bounty.

If you expose a credential, revoke it through its provider and privately notify the operator. Removing a file or rewriting history does not invalidate a credential. This project does not automatically rotate production secrets. [Privacy](docs/privacy.md) explains retained data and incomplete erasure. [Provider compliance](docs/provider-compliance.md) documents service-level concerns.
