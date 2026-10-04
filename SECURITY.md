# Security Policy

## Supported versions

| Package | Version | Supported |
| --- | --- | --- |
| `@motifx/core` | 1.x | Yes |
| `@motifx/compiler` | 1.x | Yes |
| `movijs` | all | No |

Fixes are released as new 1.x versions. Please update to the latest 1.x release before reporting.

## Reporting a vulnerability

Please do not report security problems in public issues, discussions or pull requests.

Report them privately through GitHub instead: open the **Security** tab of this repository and choose **Report a vulnerability**, or go directly to <https://github.com/motifjsdev/motifjs/security/advisories/new>.

A useful report includes:

- the affected package and version,
- what an attacker can do and under which conditions,
- a minimal reproduction (a component, a snippet or a small repository),
- any fix or mitigation you have in mind.

We will confirm that we received the report, keep you updated while we work on it, and credit you in the release notes unless you prefer to stay anonymous.

## Scope notes

Some APIs write HTML or attributes without filtering, on purpose. These are not vulnerabilities on their own:

- `x-html` and `attr.add({ innerHTML })` write the HTML they are given. Use them only with HTML you trust.
- Attributes written directly on a tag (`<a href={url}>`) are not filtered. Validate user-supplied URLs before binding them.

An object spread onto a DOM tag (`<div {...props}>`) is treated as outside data: `innerHTML` and `srcdoc` in it are dropped, and so are `javascript:` URLs in `href`, `src`, `action`, `formaction` and `xlink:href`. A way around that filter is a vulnerability and should be reported.
