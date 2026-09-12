import type { GradebookResult } from '$lib/contracts/studentvue/gradebook';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';

export const Operation = {
	Request: 'ProcessWebServiceRequest',
	RequestMultiWeb: 'ProcessWebServiceRequestMultiWeb'
} as const;

export type Operation = (typeof Operation)[keyof typeof Operation];

const alwaysArray = [
	'Gradebook.Courses.Course',
	'Gradebook.Courses.Course.Marks.Mark',
	'Gradebook.Courses.Course.Marks.Mark.Assignments.Assignment',
	'Gradebook.Courses.Course.Marks.Mark.Assignments.Assignment.Resources.Resource',
	'Gradebook.Courses.Course.Marks.Mark.GradeCalculationSummary.AssignmentGradeCalc',
	'Gradebook.ReportingPeriods.ReportPeriod',
	'Attendance.Absences.Absence'
];

const envelopeParser = new XMLParser({ ignoreDeclaration: true });

const resultParser = new XMLParser({
	ignoreAttributes: false,
	ignoreDeclaration: true,
	attributeNamePrefix: '_',
	isArray: (_name, jpath) => alwaysArray.includes(String(jpath)),
	attributeValueProcessor: (_name, value) =>
		value === 'true' ? true : value === 'false' ? false : value
});

/** For use only with output of xml parser; applies only to non-attributes */
function convertEmptyElementToNull<T>(obj: T): T {
	if (typeof obj !== 'object' || obj === null) return obj;

	if (Array.isArray(obj)) return obj.map(convertEmptyElementToNull) as T;

	const newObj: Record<string, unknown> = {};
	for (const [key, val] of Object.entries(obj)) {
		if (val === '' && !key.startsWith('_')) {
			newObj[key] = null;
		} else {
			newObj[key] = convertEmptyElementToNull(val);
		}
	}
	return newObj as T;
}

const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '_' });

export const unwrapEnvelope = (envelopeStr: string, operation: Operation): string =>
	envelopeParser.parse(envelopeStr)['soap:Envelope']['soap:Body'][`${operation}Response`][
		`${operation}Result`
	];

export const wrapEnvelope = (body: string, operation: Operation): string =>
	builder.build({
		'?xml': { _version: '1.0', _encoding: 'utf-8' },
		'soap:Envelope': {
			'_xmlns:soap': 'http://www.w3.org/2003/05/soap-envelope',
			'_xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
			'_xmlns:xsd': 'http://www.w3.org/2001/XMLSchema',
			'soap:Body': {
				[`${operation}Response`]: {
					_xmlns: 'http://edupoint.com/webservices/',
					[`${operation}Result`]: body
				}
			}
		}
	});

export function parseResult<T>(resultStr: string): T {
	const result = resultParser.parse(resultStr);

	if (result.RT_ERROR) throw new Error(result.RT_ERROR._ERROR_MESSAGE);

	return result;
}

export const parseGradebookXML = (resultStr: string) =>
	convertEmptyElementToNull(parseResult<GradebookResult>(resultStr).Gradebook);
