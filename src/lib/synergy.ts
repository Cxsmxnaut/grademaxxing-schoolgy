/**
 * Stable compatibility facade for the browser-side StudentVUE client.
 *
 * New implementation code lives in `$lib/studentvue`; keeping this module avoids
 * churn for existing application, test, and diagnostic imports.
 */
export { StudentAccount } from './studentvue/account';
export { StudentVueSessionExpiredError, apiRequest } from './studentvue/api';
export {
	Operation,
	parseGradebookXML,
	parseResult,
	unwrapEnvelope,
	wrapEnvelope
} from './studentvue/xml';
