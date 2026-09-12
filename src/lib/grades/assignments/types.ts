export interface Category {
	name: string;
	weightPercentage: number;
	pointsEarned: number;
	pointsPossible: number;
	weightedPercentage: number;
	gradeLetter: string;
}

export interface Assignment {
	name: string;
	id: string;
	pointsEarned: number | undefined;
	pointsPossible: number | undefined;
	unscaledPoints: { pointsEarned: number; pointsPossible: number } | undefined;
	extraCredit: boolean;
	gradePercentageChange: number | undefined;
	notForGrade: boolean;
	hidden: boolean;
	category: string | undefined;
	date: Date;
	newHypothetical: boolean;
	description?: string;
	comments?: string;
}

export interface RealAssignment extends Assignment {
	hidden: false;
	category: string;
	newHypothetical: false;
}

export interface HiddenAssignment extends Assignment {
	pointsEarned: number;
	pointsPossible: number;
	unscaledPoints: undefined;
	extraCredit: false;
	notForGrade: false;
	hidden: true;
	category: string;
	newHypothetical: false;
}

export interface ReactiveAssignment extends Assignment {
	reactive: true;
}

export interface NewHypotheticalAssignment extends ReactiveAssignment {
	newHypothetical: true;
	unscaledPoints: undefined;
	extraCredit: false;
	hidden: false;
}

export type Calculable<T extends Assignment> = T & {
	pointsEarned: number;
	pointsPossible: number;
	notForGrade: false;
};

export type CalculableWithCategory<T extends Assignment> = Calculable<T> & {
	category: string;
};

export type Flowed<T extends Assignment> = Calculable<T> & {
	gradePercentageChange: number;
};

export interface PointsByCategory {
	[categoryName: string]: {
		pointsEarned: number;
		pointsPossible: number;
	};
}
