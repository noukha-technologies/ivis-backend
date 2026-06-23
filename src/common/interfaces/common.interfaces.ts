export const whiteListingDomains = ["http://localhost:3000"]

export interface ErrorDetails {
    code: string;
    statusCode: number;
    message: string;
}

export interface FtpProcessResult {
    filesFound: number;
    parsed: number;
    saved: number;
};

export interface FtpCursor {
    dateFolder: string;
    timestampKey: string;
};