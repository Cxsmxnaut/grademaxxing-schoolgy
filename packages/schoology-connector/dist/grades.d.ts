import type { GradebookAssignment, GradebookPeriod, GradingCategory } from './types.js';
export type { GradebookAssignment, GradebookPeriod, GradingCategory } from './types.js';
export interface CalculationOptions {
    /** Choose explicitly; hidden Schoology settings cannot reliably determine this. */
    mode: 'points' | 'weighted' | 'equal-categories';
    missing?: 'exclude' | 'zero';
    unknownRules?: 'reject' | 'assume-points';
    /** Only when the caller knows finals belong in ordinary category totals. */
    includeFinalAsRegular?: boolean;
}
export interface CategoryEstimate {
    id: string;
    earned: number;
    possible: number;
    percentage: number | null;
    dropped: string[];
}
export interface GradeEstimate {
    estimated: true;
    percentage: number | null;
    categories: CategoryEstimate[];
    warnings: string[];
}
export declare function calculateGrade(items: readonly GradebookAssignment[], rules: readonly GradingCategory[], options: CalculationOptions): GradeEstimate;
export type WhatIfEdit = {
    kind: 'add';
    assignment: GradebookAssignment;
} | {
    kind: 'change';
    id: string;
    type?: string;
    score: number | null;
    status?: GradebookAssignment['status'];
} | {
    kind: 'drop';
    id: string;
    type?: string;
};
export declare function simulateGrade(period: GradebookPeriod, rules: readonly GradingCategory[], options: CalculationOptions, edits: readonly WhatIfEdit[]): {
    officialGrade: string | number | null;
    assignments: {
        id: string;
        type: string;
        title: string | null;
        categoryId: string | null;
        score: number | null;
        rawGrade: number | string | null;
        maxPoints: number | null;
        factor: number;
        status: import("./types.js").AssignmentStatus;
        exception: number | null;
        dueAt: string | null;
        updatedAt: string | null;
        isFinal: boolean;
        hypothetical?: boolean;
    }[];
    baseline: GradeEstimate;
    projected: GradeEstimate;
};
export type TargetScoreResult = {
    status: 'reachable';
    requiredPoints: number;
    requiredPercent: number;
    estimated: true;
} | {
    status: 'unreachable';
    maximumPercent: number;
    estimated: true;
} | {
    status: 'unavailable';
    reason: string;
    estimated: true;
};
/** Adds one upcoming item; maximum possible score is its maxPoints (no assumed extra credit). */
export declare function requiredScore(period: GradebookPeriod, rules: readonly GradingCategory[], options: CalculationOptions, upcoming: GradebookAssignment, targetPercent: number): TargetScoreResult;
