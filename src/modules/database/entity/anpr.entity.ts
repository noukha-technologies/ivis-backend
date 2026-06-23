import { CameraIntegrationMethod } from "../../../common/enums/camera.enums";
import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from "typeorm";

@Entity({ name: "anpr_events", schema: "opal_ivis" })
@Index(["plateNumber", "captureTime"], { unique: true })
export class AnprEventEntity {
    @PrimaryGeneratedColumn("increment")
    id!: number;

    @Column({ name: "plate_number", length: 50 })
    @Index("idx_plate_number")
    plateNumber!: string;

    @Column({ name: "capture_time", type: "timestamptz" })
    @Index("idx_capture_time")
    captureTime!: Date;

    @Column({ name: "confidence_score", type: "int" })
    confidenceScore!: number;

    @Column({
        name: "plate_char_confidence",
        type: "varchar",
        length: 255,
        nullable: true,
    })
    plateCharBelieve!: string | null;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // CAMERA IDENTIFICATION
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    @Column({ name: "camera_ip", type: "varchar", length: 45, nullable: true })
    @Index("idx_camera_ip")
    cameraIp!: string | null;

    @Column({ name: "camera_mac", type: "varchar", length: 17, nullable: true })
    @Index("idx_camera_mac")
    cameraMac!: string | null;

    @Column({ name: "camera_code", type: "varchar", length: 50, nullable: true })
    cameraCode!: string | null;

    @Column({ name: "centre_code", type: "varchar", length: 50, nullable: true })
    centreCode!: string | null;

    @Column({ name: "lane_number", type: "int", nullable: true })
    laneNumber!: number | null;


    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // VEHICLE DETAILS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    @Column({ name: "vehicle_type", type: "varchar", length: 50, nullable: true })
    vehicleType!: string | null;

    @Column({
        name: "vehicle_colour",
        type: "varchar",
        length: 50,
        nullable: true,
    })
    vehicleColour!: string | null;

    @Column({ name: "plate_colour", type: "varchar", length: 50, nullable: true })
    plateColour!: string | null;


    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // IMAGES (COMPRESSED TO 50% QUALITY)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    @Column({ name: "plate_image_path", type: "text", nullable: true })
    plateImagePath!: string | null;

    @Column({ name: "scene_image_path", type: "text", nullable: true })
    sceneImagePath!: string | null;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // RAW RESPONSE TRACKING (NEW)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    @Column({ name: "integration_method", type: "varchar", length: 20, nullable: true })
    integrationMethod!: CameraIntegrationMethod | null;

    @Column({ name: "source_method", type: "varchar", length: 10, nullable: true })
    sourceMethod!: string | null;

    @Column({ name: "raw_file_response", type: "jsonb", nullable: true })
    rawFileResponse!: Record<string, unknown> | null;

    @Column({ name: "raw_payload", type: "jsonb", nullable: true })
    rawPayload!: Record<string, unknown> | null;

    @CreateDateColumn({ name: "received_at" })
    receivedAt!: Date;

    @Column({ name: "created_at", type: "timestamptz", default: () => "NOW()" })
    createdAt!: Date;

    @UpdateDateColumn({ name: "updated_at", type: "timestamptz", nullable: true })
    updatedAt!: Date | null;
}