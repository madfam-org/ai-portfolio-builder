# Job intake fixtures (W5-J)

Every file here is **synthetic**: invented companies («Ejemplo Software S.A. de C.V.», «Acme Ejemplo»), no real person,
no real posting. The ATS JSON files follow the field names each provider documents for its public job API
(`src/server/ingest/ats.ts` cites the pages); their values are invented. The HTML pages imitate common board layouts
(JSON-LD in a `<script>`, an `@graph`, microdata, Open Graph only, a page with no posting).
