export interface ScheduleClass {
	period: string;
	courseTitle: string;
	teacher: string;
	teacherEmail: string;
	room: string;
	startTime: string;
	endTime: string;
	schoolName: string;
	date: string;
}

export interface Schedule {
	date: string;
	classes: ScheduleClass[];
}
