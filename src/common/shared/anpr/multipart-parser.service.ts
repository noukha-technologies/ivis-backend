import { BadRequestException, Injectable } from "@nestjs/common";
import Busboy from "busboy";
import type { Request } from "express";
import { Readable } from "stream";
import { AnprRawMultipartInterface } from "../../interfaces/anpr.interface";

@Injectable()
export class MultipartParserService {
    parse(req: Request): Promise<AnprRawMultipartInterface> {
        return this.parseFromHeaders(req.headers, req);
    }

    /** Parse multipart from a buffer captured before the HTTP response was sent. */
    parseBuffer(
        body: Buffer,
        headers: Request["headers"],
    ): Promise<AnprRawMultipartInterface> {
        const stream = Readable.from(body);
        return this.parseFromHeaders(headers, stream);
    }

    private parseFromHeaders(
        headers: Request["headers"],
        source: Request | Readable,
    ): Promise<AnprRawMultipartInterface> {
        return new Promise((resolve, reject) => {
            const contentType = headers["content-type"];
            if (!contentType || !contentType.includes("multipart/form-data")) {
                reject(
                    new BadRequestException("Expected multipart/form-data request body"),
                );
                return;
            }

            const busboy = Busboy({ headers });
            const files: Record<string, Buffer> = {};
            const chunkMap: Record<string, Buffer[]> = {};
            let xmlBuffer: Buffer | undefined;

            busboy.on("file", (fieldName, stream, fileInfo) => {
                const key = fileInfo.filename || fieldName;
                chunkMap[key] = [];

                stream.on("data", (chunk: Buffer) => {
                    chunkMap[key].push(chunk);
                });

                stream.on("end", () => {
                    const fileBuffer = Buffer.concat(chunkMap[key]);
                    files[key] = fileBuffer;

                    if (
                        fieldName === "anpr.xml" ||
                        fileInfo.filename?.toLowerCase() === "anpr.xml"
                    ) {
                        xmlBuffer = fileBuffer;
                    }
                });
            });

            busboy.on("finish", () => {
                if (!xmlBuffer) {
                    reject(new BadRequestException("Missing anpr.xml in multipart data"));
                    return;
                }

                resolve({
                    xmlBuffer,
                    files,
                    meta: {
                        contentType,
                        receivedAt: new Date(),
                    },
                });
            });

            busboy.on("error", (error) => reject(error));
            source.pipe(busboy);
        });
    }
}
