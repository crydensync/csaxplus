# Security policy

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it through GitHub's private vulnerability reporting on this repository: open the **Security**
tab and choose **Report a vulnerability**. That channel is private to the maintainers, it keeps the
report attached to the code it is about, and it gives us a thread to work in while a fix is
prepared. No email address is published for this, deliberately: a mailing list is a single point of
failure and it goes stale the moment a maintainer moves on.

If you cannot use that channel, open a public issue that says only that you have a security report
and asks for a private channel, and disclose nothing in it.

### What to include

- What the problem is, and the impact you believe it has.
- The smallest set of steps that reproduces it.
- The version, commit, or tag you tested.
- Your configuration where it matters (`CRYDEN_MODE`, store engine, whether a reverse proxy is in
  front, whether the deployment is behind a VPN). Redact every secret.
- Anything you already tried.

### What to expect

| Stage | Target |
|---|---|
| We acknowledge the report | 3 working days |
| We give a first assessment, including whether we agree it is a vulnerability | 10 working days |
| We ship a fix, or explain why we are not going to | 90 days, or sooner for anything being exploited |

We will credit you in the release notes if you want to be credited, and we will not if you would
rather not. We will tell you before anything about the report is published.

Please give us a chance to ship a fix before disclosing publicly. If 90 days pass with no fix and
no explanation from us, publish; we would rather you did that than sit on it.

## Supported versions

csax+ is pre-1.0 and moves in tiers. Only the latest tagged release is supported: a fix lands on
`main` and, if it matters, in a new tag. There are no maintenance branches and no backports to
older tags, so pin to a tag and expect to move forward.

## Scope

**In scope.** Anything in this repository: the console's own authentication of its operators, its
session cookies and CSRF handling, its configuration loader and secret masking, its store and
migrations, its route handlers, and the read-only guarantee in its AI layer.

**Out of scope here.** The engine and the HTTP API, which are separate repositories with their own
policies:

- [github.com/crydensync/cryden](https://github.com/crydensync/cryden)
- [github.com/crydensync/api](https://github.com/crydensync/api)

If you are unsure which project a finding belongs to, report it here and we will route it.

**Not a vulnerability, by design.** Several of these look like findings and are not:

- **The console is not a security boundary against its own operator.** An operator with a valid
  session can read what the API lets their role read. That is the design. A finding that amounts to
  "an admin can see the data" is not a finding.
- **`CRYDEN_MODE=fixtures` shows sample data.** It is labelled on screen at all times and it is
  never a fallback for a failed live call.
- **The console holds no signing key.** It decodes the operator's token to decide which screens to
  draw; it never verifies one and never makes an authorisation decision. A finding about token
  verification is the API's.
- **The Secure cookie flag is off over plain-HTTP development origins.** A browser silently drops a
  `Secure` cookie received over `http`, which would sign a developer out on every request with no
  error to explain it. It is forced on in production, and the rule lives in
  `shouldUseSecureCookie()`.
- **The dev-only `/design` route exists.** It 404s in a production build.

## The read-only AI guarantee

If a report shows that any AI feature can write, or can act on a user other than the one the
caller's token identifies, that is a vulnerability of the highest severity regardless of what
else it needs. The guarantee is stated in full in
[README section 8.1](README.md#81-the-read-only-ai-guarantee) and it is meant to be checkable
rather than trusted: no AI code path holds a reference to anything that writes.

## What is never logged

Secrets, tokens, passwords, cookies, CSRF values, vault plaintext, and the value of any setting
marked secret in the [configuration reference](README.md#61-the-full-reference). A boot failure
names the key that is wrong and never its value, because a configuration error is exactly the
moment a secret is most likely to end up in an aggregator.
