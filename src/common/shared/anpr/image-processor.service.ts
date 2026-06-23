import * as fs from "fs";
import sharp from "sharp";
import * as path from "path";
import { Injectable } from "@nestjs/common";
import { ProcessedAnprImagesDto } from "../../interfaces/anpr.interface";

@Injectable()
export class ImageProcessorService {
    async compressAnprImages(files: Record<string, Buffer>): Promise<ProcessedAnprImagesDto> {
        const plateInput =
            files["licensePlatePicture.jpg"] ?? files["licensePlatePicture"];
        const sceneInput = files["detectionPicture.jpg"] ?? files["detectionPicture"];
        const compositeInput =
            files["compositePicture.jpg"] ?? files["compositePicture"];

        const [plateImage, sceneImage, compositeImage] = await Promise.all([
            this.compressToJpeg50(plateInput),
            this.compressToJpeg50(sceneInput),
            this.compressToJpeg50(compositeInput),
        ]);

        return {
            plateImage,
            sceneImage,
            compositeImage,
        };
    }

    private async compressToJpeg50(input?: Buffer): Promise<Buffer | undefined> {
        if (!input) {
            return undefined;
        }
        return sharp(input).jpeg({ quality: 50 }).toBuffer();
    }

    async saveCompressedImages(
        files: Record<string, Buffer>,
        plateNumber: string,
    ): Promise<{ plateImagePath?: string; sceneImagePath?: string }> {
        const compressed = await this.compressAnprImages(files);
        const paths: { plateImagePath?: string; sceneImagePath?: string } = {};

        const uploadDir = path.join(process.cwd(), "uploads");
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        if (compressed.plateImage) {
            const filename = `${plateNumber}_${Date.now()}_plate.jpg`;
            fs.writeFileSync(path.join(uploadDir, filename), compressed.plateImage);
            paths.plateImagePath = `/uploads/${filename}`;
        }

        if (compressed.sceneImage) {
            const filename = `${plateNumber}_${Date.now()}_scene.jpg`;
            fs.writeFileSync(path.join(uploadDir, filename), compressed.sceneImage);
            paths.sceneImagePath = `/uploads/${filename}`;
        }

        return paths;
    }
}
