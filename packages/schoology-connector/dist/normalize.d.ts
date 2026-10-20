import type { CourseGradebook, RawRecord } from './types.js';
export declare function numeric(value: unknown): number | null;
/** Merges a section repeated across enrollment-paginated user-grade responses. */
export declare function normalizeCourse(section: RawRecord, gradePages: RawRecord[], metadata?: RawRecord[], categoryMetadata?: RawRecord[]): CourseGradebook;
