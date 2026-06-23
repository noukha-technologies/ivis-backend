import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

type CameraFtpFields = {
    ftpDirectory?: string | null;
    centreCode?: string | null;
    ipAddress?: string | null;
};

/** Legacy Hikvision date folder: `2026_06_09-2026_06_09` */
export function formatHikvisionDateFolder(date: Date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const segment = `${y}_${m}_${d}`;
    return `${segment}-${segment}`;
}

/** Newer Hikvision date folder: `2026-06-12` */
export function formatIsoDateFolder(date: Date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Both date folder layouts; ISO format is checked first (newer cameras). */
export function getDateFolderNameCandidates(date: Date = new Date()): string[] {
    const iso = formatIsoDateFolder(date);
    const legacy = formatHikvisionDateFolder(date);
    return iso === legacy ? [iso] : [iso, legacy];
}

export function isKnownDateFolderName(name: string): boolean {
    return (
        /^\d{4}-\d{2}-\d{2}$/.test(name) ||
        /^\d{4}_\d{2}_\d{2}-\d{4}_\d{2}_\d{2}$/.test(name)
    );
}

export function pickDateFolderNameFromCandidates(
    availableNames: string[],
    date: Date = new Date(),
): string {
    const candidates = getDateFolderNameCandidates(date);
    for (const candidate of candidates) {
        if (availableNames.includes(candidate)) {
            return candidate;
        }
    }
    return candidates[0];
}

export function joinCameraAndDateFolder(
    cameraFolder: string,
    dateFolder: string,
): string {
    if (/^[A-Za-z]:/.test(cameraFolder)) {
        const sep = cameraFolder.includes('\\') ? '\\' : path.sep;
        return `${cameraFolder}${sep}${dateFolder}`;
    }
    return `${cameraFolder}/${dateFolder}`;
}

/** Pick today's date folder name, preferring whichever layout exists on disk. */
export function resolveDateFolderName(
    cameraFolder: string,
    date: Date = new Date(),
): string {
    const candidates = getDateFolderNameCandidates(date);
    if (isLocalMountPath(cameraFolder)) {
        for (const name of candidates) {
            const full = joinCameraAndDateFolder(cameraFolder, name);
            try {
                if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
                    return name;
                }
            } catch {
                /* ignore */
            }
        }
    }
    return candidates[0];
}

export function normalizeFtpRoot(ftpDirectory: string): string {
    return ftpDirectory.trim().replace(/[/\\]+$/, '');
}

function joinPathSegments(root: string, ...parts: Array<string | null | undefined>): string {
    const base = normalizeFtpRoot(root);
    const segments = parts
        .map((part) => (typeof part === 'string' ? part.trim() : ''))
        .filter(Boolean);
    if (segments.length === 0) {
        return base;
    }
    if (/^[A-Za-z]:/.test(base)) {
        const sep = base.includes('\\') ? '\\' : path.sep;
        return segments.reduce((acc, segment) => `${acc}${sep}${segment}`, base);
    }
    return segments.reduce((acc, segment) => `${acc}/${segment}`, base);
}

function pathExistsAsDirectory(target: string): boolean {
    try {
        return fs.existsSync(target) && fs.statSync(target).isDirectory();
    } catch {
        return false;
    }
}

export function stripCentreFromFtpRoot(
    ftpDirectory: string,
    centreCode: string,
): string {
    const root = normalizeFtpRoot(ftpDirectory);
    const centre = centreCode.trim();
    if (!centre) {
        return root;
    }
    const norm = root.replace(/\\/g, '/');
    const suffix = `/${centre}`;
    if (norm.endsWith(suffix) || norm.toLowerCase().endsWith(suffix.toLowerCase())) {
        return root.slice(0, root.length - centre.length).replace(/[/\\]+$/, '');
    }
    const winSuffix = `\\${centre}`;
    if (root.endsWith(winSuffix) || root.toLowerCase().endsWith(winSuffix.toLowerCase())) {
        return root.slice(0, root.length - centre.length).replace(/[/\\]+$/, '');
    }
    return root;
}

export function stripCameraPathFromFtpRoot(
    ftpDirectory: string,
    centreCode: string,
    ipAddress?: string | null,
): string {
    let root = stripCentreFromFtpRoot(ftpDirectory, centreCode);
    const ip = typeof ipAddress === 'string' ? ipAddress.trim() : '';
    if (!ip) {
        return root;
    }
    const norm = root.replace(/\\/g, '/');
    const suffix = `/${ip}`;
    if (norm.endsWith(suffix) || norm.toLowerCase().endsWith(suffix.toLowerCase())) {
        return root.slice(0, root.length - ip.length).replace(/[/\\]+$/, '');
    }
    const winSuffix = `\\${ip}`;
    if (root.endsWith(winSuffix) || root.toLowerCase().endsWith(winSuffix.toLowerCase())) {
        return root.slice(0, root.length - ip.length).replace(/[/\\]+$/, '');
    }
    return root;
}

export function resolveCameraFolderCandidates(
    ftpRoot: string,
    centreCode: string,
    ipAddress?: string | null,
): string[] {
    const centre = centreCode.trim();
    const ip = typeof ipAddress === 'string' ? ipAddress.trim() : '';
    const candidates: string[] = [];
    if (ip && centre) {
        candidates.push(joinPathSegments(ftpRoot, ip, centre));
    }
    if (centre) {
        candidates.push(joinPathSegments(ftpRoot, centre));
    }
    if (!centre) {
        candidates.push(normalizeFtpRoot(ftpRoot));
    }
    return candidates;
}

export function resolveCameraFolder(
    ftpRoot: string,
    centreCode: string,
    ipAddress?: string | null,
): string {
    const candidates = resolveCameraFolderCandidates(ftpRoot, centreCode, ipAddress);
    if (isLocalMountPath(ftpRoot)) {
        for (const candidate of candidates) {
            if (pathExistsAsDirectory(candidate)) {
                return candidate;
            }
        }
    }
    return candidates[0];
}

export function resolveDateFolderPath(
    ftpRoot: string,
    centreCode: string,
    date: Date = new Date(),
    ipAddress?: string | null,
): string {
    const cameraFolder = resolveCameraFolder(ftpRoot, centreCode, ipAddress);
    const dateFolder = resolveDateFolderName(cameraFolder, date);
    return joinCameraAndDateFolder(cameraFolder, dateFolder);
}

export function resolveActiveWatchPath(
    camera: CameraFtpFields,
    date: Date = new Date(),
): string | null {
    const root = camera.ftpDirectory?.trim();
    if (!root) {
        return null;
    }
    const centreCode = camera.centreCode ?? '';
    const normalizedRoot = stripCameraPathFromFtpRoot(root, centreCode, camera.ipAddress);
    return resolveDateFolderPath(normalizedRoot, centreCode, date, camera.ipAddress);
}

export function resolveCameraFolderPath(
    camera: CameraFtpFields,
): string | null {
    const root = camera.ftpDirectory?.trim();
    if (!root) {
        return null;
    }
    const centreCode = camera.centreCode ?? '';
    return resolveCameraFolder(
        stripCameraPathFromFtpRoot(root, centreCode, camera.ipAddress),
        centreCode,
        camera.ipAddress,
    );
}

export function resolveFtpWatchTargets(
    camera: CameraFtpFields,
    date: Date = new Date(),
): { ingestPath: string | null; listenPath: string | null; cameraFolder: string | null } {
    const ingestPath = resolveActiveWatchPath(camera, date);
    const cameraFolder = resolveCameraFolderPath(camera);
    let listenPath = ingestPath;

    const root = camera.ftpDirectory?.trim() ?? '';
    if (
        ingestPath &&
        isLocalMountPath(root) &&
        !pathExistsAsDirectory(ingestPath) &&
        cameraFolder &&
        pathExistsAsDirectory(cameraFolder)
    ) {
        listenPath = cameraFolder;
    }

    return { ingestPath, listenPath, cameraFolder };
}

export function isLocalMountPath(ftpDirectory: string): boolean {
    const trimmed = ftpDirectory.trim();
    if (os.platform() === 'win32' && /^[A-Za-z]:[/\\]/.test(trimmed)) {
        return true;
    }
    if (trimmed.startsWith('/')) {
        return true;
    }
    return false;
}

export function shouldUseMountMode(camera: { ftpDirectory?: string | null }): boolean {
    const envMode = process.env.ANPR_FTP_WATCH_MODE?.trim().toLowerCase();
    if (envMode === 'mount') {
        return true;
    }
    if (envMode === 'poll') {
        return false;
    }
    const localDemo = process.env.ANPR_FTP_LOCAL_DEMO?.trim().toLowerCase();
    if (localDemo === '1' || localDemo === 'true' || localDemo === 'yes') {
        return true;
    }
    const dir = camera.ftpDirectory?.trim() ?? '';
    return isLocalMountPath(dir);
}

export function getFtpIngestMode(): 'jpeg' | 'xml' | 'auto' {
    const mode = process.env.ANPR_FTP_INGEST_MODE?.trim().toLowerCase();
    if (mode === 'xml' || mode === 'auto') {
        return mode;
    }
    return 'jpeg';
}
