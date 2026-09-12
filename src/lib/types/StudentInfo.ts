export interface StudentInfoResult {
	StudentInfo: StudentInfo;
}

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
