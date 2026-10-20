// Endpoint coverage adapted from ErikBoesen/schoolopy; native TypeScript implementation.
import { SchoologyError } from './errors.js';
import { normalizeCourse } from './normalize.js';
import { secureUrl, Transport } from './transport.js';
const idPath = (id) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(id))
        throw new SchoologyError('URL', 'Invalid Schoology resource ID.');
    return id;
};
/** Import only in server code. OAuth consumers are never safe to bundle in a browser. */
export class SchoologyClient {
    #transport;
    constructor(options) {
        const school = secureUrl(options.schoolUrl);
        if (school.pathname !== '/' || school.search)
            throw new SchoologyError('URL', 'schoolUrl must be a district origin.');
        this.#transport = new Transport(options);
    }
    getMe() {
        return this.#transport.json('users/me');
    }
    getSections(userId, query = {}) {
        return this.#transport.list(`users/${idPath(userId)}/sections`, 'section', query);
    }
    getSection(sectionId) {
        return this.#transport.json(`sections/${idPath(sectionId)}`);
    }
    getAssignments(sectionId, query = {}) {
        return this.#transport.list(`sections/${idPath(sectionId)}/assignments`, 'assignment', query);
    }
    getCategories(sectionId) {
        return this.#transport.list(`sections/${idPath(sectionId)}/grading_categories`, 'grading_category');
    }
    getGradingScales(sectionId) {
        return this.#transport.list(`sections/${idPath(sectionId)}/grading_scales`, 'grading_scale');
    }
    getUserGrades(userId, query = {}) {
        return this.#transport.list(`users/${idPath(userId)}/grades`, 'section', query);
    }
    /** Read-only Schoology calendar events for the authenticated user. */
    getEvents(userId, query = {}) {
        return this.#transport.list(`users/${idPath(userId)}/events`, 'event', query);
    }
    /** Course materials metadata; file download URLs are not fetched by this connector. */
    getDocuments(sectionId, query = {}) {
        return this.#transport.list(`sections/${idPath(sectionId)}/documents`, 'document', query);
    }
    /** Read-only inbox listing. */
    getInbox(query = {}) {
        return this.#transport.list('messages/inbox', 'message', query);
    }
    /** Read a single inbox message body. */
    getInboxMessage(messageId) {
        // Schoology documents that opening this endpoint marks a message as read by
        // default. Keep the read-only connector from changing that status.
        return this.#transport.json(`messages/inbox/${idPath(messageId)}`, { keep_unread: 'TRUE' });
    }
    /** Full snapshot: do not pass timestamp filters (those return deltas, not full records). */
    async getGradebook(options = {}) {
        const me = await this.getMe();
        const userId = String(me.uid ?? me.id ?? '');
        if (!userId)
            throw new SchoologyError('RESPONSE', 'Schoology profile is missing the user ID.');
        const [sections, grades] = await Promise.all([
            this.getSections(userId, { include_past: options.includePast ? 1 : 0 }),
            this.getUserGrades(userId, { include_all_enrollments: options.includePast ? 1 : 0 })
        ]);
        const warnings = [];
        const courses = [];
        const allSections = new Map();
        for (const section of sections) {
            if (section.id == null)
                throw new SchoologyError('RESPONSE', 'Course section is missing its ID.');
            allSections.set(String(section.id), section);
        }
        for (const page of grades) {
            if (page.section_id == null)
                throw new SchoologyError('RESPONSE', 'User grades are missing the section ID.');
            const id = String(page.section_id);
            if (!allSections.has(id))
                allSections.set(id, { id });
        }
        const optional = async (action, fallback, label, id) => {
            try {
                return await action();
            }
            catch (error) {
                // Permissions vary by role. Transport, rate limits, and auth failures must remain visible.
                if (!(error instanceof SchoologyError) || ![403, 404].includes(error.status ?? 0))
                    throw error;
                warnings.push(`${label} unavailable for section ${id} (HTTP ${error.status}); official grades are preserved.`);
                return fallback;
            }
        };
        // Bounded sequential sections; parallelize only the three reads within each section.
        for (const [id, summary] of allSections) {
            let detail = summary;
            let assignments = [];
            let categories = [];
            if (options.includeMetadata !== false) {
                [detail, assignments, categories] = await Promise.all([
                    optional(() => this.getSection(id), summary, 'Section details', id),
                    optional(() => this.getAssignments(id), [], 'Assignment metadata', id),
                    optional(() => this.getCategories(id), [], 'Grading rules', id)
                ]);
            }
            const course = normalizeCourse({ ...summary, ...detail }, grades.filter((page) => String(page.section_id) === id), assignments, categories);
            const categoryIds = new Set(course.categories.map((category) => category.id));
            if (course.weightedCategories === null ||
                course.categories.some((category) => category.calculation === null || category.dropLowest === null) ||
                course.periods.some((period) => period.assignments.some((item) => item.categoryId === null || !categoryIds.has(item.categoryId))))
                warnings.push(`Some grading rules are hidden or unavailable for section ${id}; simulations require explicit assumptions.`);
            courses.push(course);
        }
        return {
            source: 'schoology',
            user: {
                id: userId,
                displayName: String(me.name_display ?? me.name ?? [me.name_first, me.name_last].filter(Boolean).join(' '))
            },
            fetchedAt: new Date().toISOString(),
            courses,
            warnings
        };
    }
}
//# sourceMappingURL=client.js.map