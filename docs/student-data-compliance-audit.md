# Grademaxxing student-data compliance audit

**Audit date:** 2026-09-02
**Scope:** the local `codex/session-persistence` worktree, source configuration, and the described California high-school beta. This is an engineering/privacy audit, not legal advice or a determination of legal compliance.

## Release decision

**Do not describe the current service as district-approved, FERPA-compliant, or ready for a school-directed rollout.** It can remain a tightly controlled personal beta only if the two critical exposure paths below are addressed and every tester is told that StudentVUE remains the official record. A principal's positive review is an important product signal, but is not district authorization, a data-processing agreement, a FERPA school-official designation, or authorization from Edupoint.

Before the district directs students to use it, shares records with it, or integrates it, obtain written district privacy/security approval, an agreement that satisfies the California education-record contract requirements, and a review by district counsel/technology leadership. Do not add Google SSO, portal-cookie transfer, tracking, advertising, AI training, or another data processor before that review.

## Data map observed in code

| Data                                                                                                                        | Collection/use                                                | Storage/destination                                                                                                                                                                                                                                                                           | Retention/deletion                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| StudentVUE username, password, district URL                                                                                 | `POST /api/session` signs into the selected StudentVUE portal | Password is passed to the server process and discarded there; when persistent sign-in is selected, the browser stores an AES-GCM-encrypted credential envelope with a non-exportable IndexedDB key. No database is present in this worktree. Username/district are retained in session state. | Server password lifetime ends after sign-in; the optional device vault remains until logout, site-data clearing, or replacement. Production session TTL is 12 hours. |
| StudentVUE session cookies and messaging access state                                                                       | Needed for subsequent read-only portal requests               | AES-256-GCM authenticated app cookie, HTTP-only, `Secure` in production, `SameSite=Lax`; the cookie includes resumable upstream session state.                                                                                                                                                | Rolled on requests; expires after 12 hours; logout deletes it.                                                                                                       |
| Grades, assignments, attendance, student profile/photo/identifier, document lists, mail listings, and seen-assignment state | Rendered in the app and used for calculations                 | Browser `localStorage` caches: `gradebook5`, `attendance5`, `documents`, `mailData`, `studentInfo2`, and related identity/session metadata.                                                                                                                                                   | Logout sends `Clear-Site-Data` and client code clears local storage. There is no separately exposed retention setting or clear-local-data control in the audited UI. |
| Document/report-card files and mail attachments                                                                             | Requested on demand from StudentVUE                           | Returned through the app to the browser; displayed/downloaded as a browser Blob.                                                                                                                                                                                                              | No persistent server file store was found. Browser download/Blob retention is device/browser controlled.                                                             |
| Feedback text, beta version, and current route                                                                              | User enters it on `/feedback`                                 | A prefilled GitHub issue URL is opened. The destination is `github.com/Cxsmxnaut/grademaxxing/issues/new`.                                                                                                                                                                                    | Governed by GitHub and repository issue visibility/retention, not this app.                                                                                          |
| Operational metadata                                                                                                        | Server request handling                                       | Server logs include request ID, method, path, status, and duration for errors/slow requests. Vercel/adaptor log retention and access were not inspectable from the repository.                                                                                                                | Unknown; must be documented in deployment controls.                                                                                                                  |

No database, analytics SDK, advertising SDK, telemetry SDK, or error-reporting SDK was found in the audited package manifest/source. That is a good minimization property, not proof of production-hosting behavior.

## Legal and policy frame

- **FERPA:** the district, not the app, decides whether it may disclose education-record PII to a vendor. The school-official path requires an institutional service/function, direct district control over use and maintenance, use consistent with the district's FERPA notice, and no unauthorized redisclosure. The Department of Education tells teachers to confirm district approval before using an online tool that processes student PII. [Department of Education FAQ](https://studentprivacy.ed.gov/faq/i-want-use-online-tool-or-application-part-my-course-however-i-am-worried-it-violation-ferpa)
- **California SOPIPA:** this product is designed/marketed for K–12 grade and record use and handles the exact categories the law calls covered information, including grades, email, identifiers, documents, messages, photos, and potentially health/disability information. SOPIPA prohibits targeted advertising, sale, and impermissible pupil profiling/disclosure and requires reasonable security and deletion on a school/district request. [Cal. Bus. & Prof. Code § 22584](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=22584.&lawCode=BPC)
- **California Education Code § 49073.1:** when a California local educational agency contracts for digital pupil-record or educational-software services, the contract needs specified record-control, purpose limitation, access/correction, security/confidentiality, breach-notice, and return/deletion terms. [Cal. Educ. Code § 49073.1](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=49073.1.&lawCode=EDC)
- **COPPA:** it is conditional on under-13 users and the product's status as a covered commercial online service. If that group can use the beta, parental consent or a valid school-authorized educational arrangement is needed; the operator remains responsible for minimization, security, and purpose-limited retention. [FTC COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)
- **CalOPPA / FTC claims:** a commercial service collecting Californians' personal information needs an accessible, accurate privacy policy; privacy/security claims must match actual practice. The CCPA is conditional on threshold/for-profit status and should be assessed by counsel as the service grows. [California DOJ CalOPPA guidance](https://oag.ca.gov/news/press-releases/attorney-general-kamala-d-harris-launches-new-tool-help-consumers-report), [California DOJ CCPA overview](https://oag.ca.gov/privacy/ccpa), [FTC privacy and security guidance](https://www.ftc.gov/business-guidance/privacy-security).
- **California breach response:** prepare for the state's notification rules before operating at scale; a breach affecting more than 500 California residents also has a state submission requirement. [California DOJ breach guidance](https://oag.ca.gov/privacy/databreach/reporting)

## Findings

### Critical — no district/vendor authorization package

**Evidence:** `src/routes/api/session/+server.ts` accepts StudentVUE credentials and `src/lib/server/pxp2.ts` logs in to Edupoint/StudentVUE, then the app proxies grades, attendance, documents, mail, profile, schedule, and attachments. No contract, data-processing agreement, approved-vendor record, Edupoint authorization, or district security review is present in the repo.

**Risk:** a school-directed beta would process protected pupil records without the direct-control and contract posture required for a district vendor arrangement. Directly collecting portal credentials also creates an additional credential and session-handling surface.

**Release gate:** obtain written PUSD/district technology and student-privacy review; a district-approved agreement covering the § 49073.1 elements; a FERPA basis confirmed by district counsel; and written authorization for the StudentVUE/Edupoint integration. Do not infer any of these from an individual student's credentials or a principal's informal approval.

### Critical — feedback can disclose student records to a public third party

**Evidence:** `src/routes/(authed)/feedback/+page.svelte` turns tester input into a GitHub issue URL. It warns users not to enter PII, but it does not prevent it. The feature has access to a context where students are viewing grades, documents, mail, attendance, and profile data.

**Risk:** an issue can expose a student record to GitHub and, if the repository/issues are public, to the public. A warning does not create a technical prevention or a data-processing agreement.

**Release gate:** disable this external issue submission for the beta, or replace it with a district-approved private support channel. Do not prefill student/contextual data; add client-side detection only as a secondary safeguard, not the primary control. Define support access, retention, deletion, and incident escalation.

### High — privacy notice materially understates stored records and omits required operational disclosures

**Evidence:** `src/routes/privacy/+page.svelte` says “Grade data ... may be cached” and that data can be cleared “from Student Info.” The code caches not only grades but attendance, documents, mail, student information, assignment state, username/domain/session metadata, and an encrypted session cookie. The page has no effective date, contact, detailed categories, processor/sharing list, retention schedule, access/deletion/correction request process, tracking disclosure, or explanation of GitHub feedback/Vercel hosting.

**Risk:** inaccurate or incomplete notices undermine student trust and may create CalOPPA/FTC risk. The current wording also over-simplifies where session data resides.

**Remediation:** replace it with a reviewed, plain-language privacy notice that matches the data map, names categories and processors, explains local browser storage and logout/clear steps, states retention, has a privacy contact and effective date, and clearly says the product is a beta and StudentVUE is the official record. Publish Terms of Use and an acceptable-use statement. Counsel should determine the exact CalOPPA/CCPA language.

### High — broad on-device caching of highly sensitive records on shared devices

**Evidence:** `src/lib/storage/record-state.ts`, `src/lib/storage/keys.ts`, and `src/lib/grades/catalog.ts` manage student records in `localStorage`; the cache can include full gradebook XML, attendance, mail listings, documents, and profile data. Local storage persists across browser restarts until logout, a storage clear, or replacement by another account.

**Risk:** anyone who uses an unlocked/shared device or browser profile can read cached records. Browser extensions or XSS would also have access to local storage.

**Remediation:** minimize the cache to the smallest required fields and TTL; consider session-only storage for mail/documents/profile, an explicit “clear this device” action, a visible shared-device warning, and a documented data-retention policy. Keep the current logout clear behavior, but test it on every supported browser. Do not claim data is only transient while this cache exists.

### High — third-party hosting, log retention, and support processor controls are not established

**Evidence:** `svelte.config.js` selects Vercel when `VERCEL=1`; `vercel.json` exists; server code emits structured request logs. The repo does not contain a deployment data-processing inventory, Vercel log-retention/access settings, a support processor review, or an incident runbook.

**Risk:** deployment staff and vendor logs can become a recipient of sensitive student data or security metadata. A district review will ask where data is hosted, who can access it, what is retained, and how a breach is handled.

**Remediation:** create a processor/subprocessor inventory (hosting, source control, support, analytics, email), configure least-privilege production access, document retention/deletion/backups and log redaction, and execute the appropriate agreements before school direction. Add an incident-response plan with the California breach-notice workflow.

### High — Google sign-in or portal-session transfer must remain out of scope without approval

**Evidence:** the app currently uses StudentVUE credentials and session cookies; no approved Google/OAuth integration is present.

**Risk:** adding Google sign-in could introduce another identity provider, scopes, tokens, and data processor. It cannot legitimately transfer a Google or StudentVUE browser session token into this app merely because the user signed in at the portal.

**Remediation:** keep Google sign-in disabled. Pursue only a district-approved SAML/OIDC/API integration with the required scopes, redirect URIs, contracts, and security review.

### Medium — under-13 / parent path is not defined

**Evidence:** the app has no age gate, parental-consent flow, or school-consent verification. The current known user is high-school age, but a future school-wide product could include younger students.

**Risk:** if the service is made available to children under 13, COPPA duties may attach.

**Remediation:** explicitly restrict the current personal beta to students 13+ pending counsel confirmation, or implement the appropriate consent/authorization flow before opening it to younger students. Do not let individual teachers self-authorize the service.

### Medium — data subject rights, corrections, and retention operations are not assigned

**Evidence:** there is no in-app privacy contact, request workflow, support ownership, or documented retention schedule. The product correctly treats StudentVUE as the source of truth, but the app still stores displayed records locally and receives a request stream.

**Remediation:** name a responsible adult/organization contact; publish a request and escalation path; route record corrections to the district/StudentVUE; provide an on-device deletion instruction; and define how school/district deletion or access requests are received, verified, completed, and recorded.

### Medium — assurance is strong in places but needs an external release evidence package

**Evidence:** current code applies HTTP-only secure production cookies, same-origin/CSRF checks, CSP-adjacent headers, rate limits, bounded upstream requests, encrypted session state, and clears browser storage on logout. The test suite covers many functional/security paths. However, there is no independent security assessment, deployed configuration review, load test evidence, dependency/SBOM process, or incident drill in the repo.

**Remediation:** before a school-directed pilot, perform an external security review/pentest authorized by the district, validate the deployed Vercel configuration, run a data-deletion test, record dependency vulnerability scanning/SBOM, and conduct a tabletop incident exercise. Keep test accounts and real records out of source control, screenshots, traces, and issue trackers.

## Ordered next steps

1. **Immediately:** turn off public GitHub feedback from the authenticated app; notify beta testers not to submit student data to GitHub.
2. **Before any wider beta:** replace the privacy notice and add Terms/acceptable-use plus a real privacy contact and on-device deletion control.
3. **Before district direction or promotion:** request PUSD technology/privacy review and provide this data map, architecture, vendor list, security controls, retention/deletion plan, and a proposed data-processing agreement.
4. **Before adding Google or any third party:** obtain written district/vendor approval for the exact authentication/data-flow design.
5. **Before a school rollout:** complete security testing, deployment review, incident response, support process, and a counsel-approved launch decision.

## Audit limitations

This audit did not inspect the live Vercel project, GitHub repository visibility/settings, Edupoint/PUSD contractual terms, district policies, or production logs. Those must be checked by the responsible adult/organization, PUSD technology/privacy team, and qualified counsel before release.
