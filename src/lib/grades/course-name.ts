/** Removes StudentVUE's parenthetical course-type suffix from a display name. */
export const removeCourseType = (name: string) => name.replace(/ \([A-Z]+\)$/, '');
