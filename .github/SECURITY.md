# Security

For a potential vulnerability, use GitHub's **Report a vulnerability** feature
if the repository has private vulnerability reporting enabled. Otherwise open
an issue asking for a private contact, without posting exploit details, notes,
credentials, or index contents. There is no guaranteed response-time SLA.

The local engine runs in a Worker. Model ZIP imports accept only data files
whose names, sizes, and SHA-256 digests match the bundled catalog. They do not
load scripts or replace plugin code. Plugin code is updated through Obsidian.
The published plugin searches locally and has no remote search endpoint.
