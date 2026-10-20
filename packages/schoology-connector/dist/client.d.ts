import type { ConnectorOptions, GradebookSnapshot, Query, RawRecord } from './types.js';
/** Import only in server code. OAuth consumers are never safe to bundle in a browser. */
export declare class SchoologyClient {
    #private;
    constructor(options: ConnectorOptions);
    getMe(): Promise<RawRecord>;
    getSections(userId: string, query?: Query): Promise<RawRecord[]>;
    getSection(sectionId: string): Promise<RawRecord>;
    getAssignments(sectionId: string, query?: Query): Promise<RawRecord[]>;
    getCategories(sectionId: string): Promise<RawRecord[]>;
    getGradingScales(sectionId: string): Promise<RawRecord[]>;
    getUserGrades(userId: string, query?: Query): Promise<RawRecord[]>;
    /** Read-only Schoology calendar events for the authenticated user. */
    getEvents(userId: string, query?: Query): Promise<RawRecord[]>;
    /** Course materials metadata; file download URLs are not fetched by this connector. */
    getDocuments(sectionId: string, query?: Query): Promise<RawRecord[]>;
    /** Read-only inbox listing. */
    getInbox(query?: Query): Promise<RawRecord[]>;
    /** Read a single inbox message body. */
    getInboxMessage(messageId: string): Promise<RawRecord>;
    /** Full snapshot: do not pass timestamp filters (those return deltas, not full records). */
    getGradebook(options?: {
        includeMetadata?: boolean;
        includePast?: boolean;
    }): Promise<GradebookSnapshot>;
}
