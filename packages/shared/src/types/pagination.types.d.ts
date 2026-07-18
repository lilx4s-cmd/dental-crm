export interface PageMeta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
export interface Paginated<T> {
    data: T[];
    meta: PageMeta;
}
export interface QueryParams {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    order?: 'asc' | 'desc';
}
//# sourceMappingURL=pagination.types.d.ts.map