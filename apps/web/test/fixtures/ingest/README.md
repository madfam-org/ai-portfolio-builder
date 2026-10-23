# Job intake fixtures (W5-J)

Every file here is **synthetic**: invented companies («Ejemplo Software S.A. de C.V.», «Acme Ejemplo»), no real person,
no real posting. The ATS JSON files follow the field names each provider documents for its public job API
(`src/server/ingest/ats.ts` cites the pages); their values are invented. The HTML pages imitate common board layouts
(JSON-LD in a `<script>`, an `@graph`, microdata, Open Graph only, a page with no posting).

`luxury/` (W7, B3): synthetic pages modeled on the markup of the career systems the luxury houses use (a SAP
SuccessFactors Career Site Builder job page with `http://schema.org/JobPosting` microdata and a Java-style
`datePosted`; a Workday job page with entity-escaped JSON-LD and an empty `hiringOrganization`; a closed Workday page
with `postingAvailable: false`; a filled SuccessFactors page; an Oracle Recruiting Cloud shell with Open Graph only).
The houses («Maison Ejemplo», «Casa Ficticia», «Grupo Ejemplo») and their hosts (`*.example`) are invented.
