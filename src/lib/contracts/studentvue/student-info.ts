export interface StudentInfoResult {
	StudentInfo: StudentInfo;
}

/**
 * Extra StudentVUE profile fields exposed by a district's PXP2_Student.aspx
 * beyond the universal name/ID/grade/gender set. Field availability varies by
 * district configuration, so every value is optional.
 */
export type StudentProfileFields = Record<string, string>;

export interface StudentInfo {
	FormattedName: string;
	PermID: number | null;
	Gender: string;
	Grade: number | null;
	Photo: string;
	PhotoMimeType?: string;
	'_xmlns:xsd': string;
	'_xmlns:xsi': string;
	_Type: string;
	_ShowPhysicianAndDentistInfo: string;
}

/**
 * Full PXP2_Student.aspx payload. Extra profile fields beyond the universal
 * set above are district-specific and optional.
 */
export interface StudentProfileResult extends StudentInfo {
	fields?: StudentProfileFields;
}
