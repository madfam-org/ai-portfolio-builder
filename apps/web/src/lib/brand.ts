/**
 * The product's working label. The brand is NOT ruled (owner decision D2 in the 2026-10-22 audit):
 * every surface renders the name from this one constant, so a ruled brand is a one-line change.
 * Customer-facing copy leads with this label; Innovaciones MADFAM endorses in the footer only.
 */
export const PRODUCT_LABEL = 'MADFAM CV';

/** The Enclii project and service name (also the Kubernetes namespace and Service). */
export const SERVICE_NAME = 'cv';

/** Kept in step with apps/web/package.json `version` (a unit test enforces it). */
export const APP_VERSION = '0.1.0';

export const SOURCE_URL = 'https://github.com/madfam-org/ai-portfolio-builder';

/** Canon mailbox for general enquiries (R61). The waitlist CTA is a plain mailto: no form, no storage. */
export const CONTACT_MAILBOX = 'hola@madfam.io';

/** madfam.io legal pages (one URL scheme per the messaging house; product notices come with counsel, R71). */
export const MADFAM_SITE = 'https://madfam.io';

/** Legal entity line (R37, R47). */
export const LEGAL_ENTITY = 'Innovaciones MADFAM S.A.S. de C.V.';
