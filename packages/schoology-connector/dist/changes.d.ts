import type { GradebookSnapshot } from './types.js';
export interface GradebookChange {
    kind: 'assignment-added' | 'assignment-changed' | 'assignment-removed' | 'official-grade-changed';
    courseId: string;
    periodId: string;
    assignmentId?: string;
    assignmentType?: string;
}
/** Compare full snapshots of the same account. Persist snapshots only in the host application's chosen store. */
export declare function diffGradebooks(before: GradebookSnapshot, after: GradebookSnapshot): GradebookChange[];
