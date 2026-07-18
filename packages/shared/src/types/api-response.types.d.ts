export interface ApiResponse<T = unknown> {
    data: T;
    message?: string;
}
export interface PaginatedResponse<T = unknown> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
export interface ApiError {
    statusCode: number;
    message: string;
    error: string;
    timestamp: string;
    path: string;
}
//# sourceMappingURL=api-response.types.d.ts.map