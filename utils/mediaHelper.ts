import { MessageMedia } from "whatsapp-web.js";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { exec as execCallback } from "child_process";
import ffmpeg from "fluent-ffmpeg";
import * as mime from "mime-types";
import sharp from "sharp";

const exec = promisify(execCallback);
const writeFileAsync = promisify(fs.writeFile);
const readFileAsync = promisify(fs.readFile);
const unlinkAsync = promisify(fs.unlink);

// Create media folder if it doesn't exist
const mediaFolder = path.join(process.cwd(), "media");
if (!fs.existsSync(mediaFolder)) {
  fs.mkdirSync(mediaFolder, { recursive: true });
}

// Set FFmpeg path for Linux
const ffmpegPath = "/usr/bin/ffmpeg";
const ffprobePath = "/usr/bin/ffprobe";

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// Log paths for debugging
console.log("FFmpeg path:", ffmpegPath);
console.log("FFprobe path:", ffprobePath);

/**
 * Downloads and processes media from a message
 * @param message The message containing the media
 * @returns Processed media ready for use
 */
export async function downloadMedia(message: any): Promise<MessageMedia> {
  try {
    // Download file using message.downloadMedia()
    const media = await message.downloadMedia();
    if (!media) throw new Error("Failed to download via WhatsApp API");

    // Get metadata from MessageMedia
    let mimetype = media.mimetype || "application/octet-stream";
    let fileExtension = mime.extension(mimetype) || "bin";
    let fileName = media.filename ? media.filename.replace(/\s+/g, "_") : `media_${Date.now()}.${fileExtension}`;

    // Fix name and extension
    let originalExt = path.extname(fileName);
    if (!originalExt || originalExt === ".bin") {
      fileName = `${fileName.replace(originalExt, "")}.${fileExtension}`;
    }

    // Use temp directory for media files
    const tempDir = path.join(process.cwd(), "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    let filePath = path.join(tempDir, fileName);

    // Save file in Base64
    await writeFileAsync(filePath, Buffer.from(media.data, "base64"));

    // For video files, try to convert to a supported format first
    if (mimetype.includes("video")) {
      try {
        const tempPath = path.join(tempDir, `temp_${Date.now()}.mp4`);
        await new Promise((resolve, reject) => {
          ffmpeg(filePath)
            .outputOptions("-c:v libx264") // Use H.264 codec
            .outputOptions("-c:a aac") // Use AAC audio codec
            .outputOptions("-preset ultrafast")
            .outputOptions("-movflags +faststart")
            .outputOptions("-vf scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000")
            .outputOptions("-b:v 1M") // Set video bitrate to 1Mbps
            .outputOptions("-maxrate 1M") // Maximum bitrate
            .outputOptions("-bufsize 2M") // Buffer size
            .output(tempPath)
            .on("end", resolve)
            .on("error", reject)
            .run();
        });

        // Replace original file with converted one
        await unlinkAsync(filePath);
        await fs.promises.rename(tempPath, filePath);

        // Update media data with converted file
        const convertedBuffer = await readFileAsync(filePath);
        media.data = convertedBuffer.toString("base64");
        media.mimetype = "video/mp4";
      } catch (conversionError) {
        console.warn("Video conversion failed:", conversionError);
        // Continue with original file if conversion fails
      }
    }

    // Add cleanup function to media object
    (media as any).cleanup = async () => {
      try {
        if (fs.existsSync(filePath)) {
          await unlinkAsync(filePath);
        }
      } catch (error) {
        console.warn("Failed to cleanup media file:", error);
      }
    };

    return media;
  } catch (error) {
    console.error("Error downloading media:", error);
    throw error;
  }
}

/**
 * Helper function to process media (video/GIF) for sticker creation
 * @param media The message media to process
 * @returns Processed media ready for sticker creation
 */
export async function processMediaForSticker(media: MessageMedia): Promise<MessageMedia> {
  try {
    const tempDir = path.join(process.cwd(), "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }

    const timestamp = Date.now();
    // Determine correct file extension based on MIME type
    const isVideo = media.mimetype.includes("video");
    const isGif = media.mimetype.includes("gif");
    const fileExt = isVideo ? "mp4" : isGif ? "gif" : "mp4";

    const inputFile = path.join(tempDir, `input_${timestamp}.${fileExt}`);
    const framesDir = path.join(tempDir, `frames_${timestamp}`);
    const outputFile = path.join(tempDir, `output_${timestamp}.webp`);

    // Create frames directory
    if (!fs.existsSync(framesDir)) {
      fs.mkdirSync(framesDir);
    }

    const buffer = Buffer.from(media.data, "base64");
    await writeFileAsync(inputFile, buffer);

    try {
      // Get media information
      const mediaInfo = await new Promise<any>((resolve, reject) => {
        ffmpeg.ffprobe(inputFile, (err, metadata) => {
          if (err) reject(err);
          else resolve(metadata);
        });
      });

      // Calculate frame rate and duration
      let fps = 30; // Default FPS
      let duration = 0;

      if (mediaInfo.streams && mediaInfo.streams[0]) {
        const stream = mediaInfo.streams[0];
        if (stream.r_frame_rate) {
          const [num, den] = stream.r_frame_rate.split("/").map(Number);
          fps = num / den;
        }
        duration = mediaInfo.format.duration || 0;
      }

      console.log(`Original media: ${duration.toFixed(2)}s at ${fps.toFixed(2)} FPS`);

      // Calculate total frames based on original duration and FPS
      const totalFrames = Math.ceil(duration * fps);
      // Limit frames based on WhatsApp's limits (30 frames)
      const frameCount = Math.min(totalFrames, 30);

      // Calculate new FPS to maintain duration with limited frames
      const newFps = frameCount / duration;
      console.log(`Processing ${frameCount} frames at ${newFps.toFixed(2)} FPS to maintain ${duration.toFixed(2)}s duration`);

      // Extract frames from media
      await new Promise((resolve, reject) => {
        ffmpeg(inputFile)
          .outputOptions(`-vf fps=${newFps},scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000`)
          .outputOptions(`-frames:v ${frameCount}`)
          .output(path.join(framesDir, "frame_%d.png"))
          .on("end", resolve)
          .on("error", reject)
          .run();
      });

      // Get all frame files
      const frameFiles = fs
        .readdirSync(framesDir)
        .filter((file) => file.startsWith("frame_") && file.endsWith(".png"))
        .sort((a, b) => {
          const numA = parseInt(a.replace("frame_", "").replace(".png", ""));
          const numB = parseInt(b.replace("frame_", "").replace(".png", ""));
          return numA - numB;
        });

      console.log(`Found ${frameFiles.length} frames to process`);

      // Create animated WebP using FFmpeg
      console.log("Creating animated WebP...");
      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(path.join(framesDir, "frame_%d.png"))
          .inputOptions("-framerate " + newFps)
          .outputOptions("-vcodec libwebp")
          .outputOptions("-lossless 0")
          .outputOptions("-compression_level 6")
          .outputOptions("-q:v 50")
          .outputOptions("-loop 0")
          .outputOptions("-preset picture")
          .outputOptions("-an")
          .outputOptions("-vsync 0")
          .outputOptions("-s 512:512")
          .outputOptions("-frame_duration " + 1000 / newFps) // Set frame duration in milliseconds
          .outputOptions("-filter_complex setpts=PTS-STARTPTS") // Reset timestamps
          .output(outputFile)
          .on("end", resolve)
          .on("error", reject)
          .run();
      });

      // Check if output file exists and has content
      if (!fs.existsSync(outputFile)) {
        throw new Error("WebP output file was not created");
      }

      const fileStats = fs.statSync(outputFile);
      if (fileStats.size === 0) {
        throw new Error("WebP output file is empty");
      }

      console.log(`Created WebP sticker: ${fileStats.size} bytes`);

      const processedBuffer = await readFileAsync(outputFile);
      const processedMedia = new MessageMedia("image/webp", processedBuffer.toString("base64"), "sticker.webp");

      // Add cleanup function to processed media
      (processedMedia as any).cleanup = async () => {
        try {
          // Cleanup all temporary files
          if (fs.existsSync(inputFile)) await unlinkAsync(inputFile);
          if (fs.existsSync(outputFile)) await unlinkAsync(outputFile);
          if (fs.existsSync(framesDir)) {
            const files = fs.readdirSync(framesDir);
            await Promise.all(files.map((file) => unlinkAsync(path.join(framesDir, file))));
            fs.rmdirSync(framesDir);
          }
        } catch (error) {
          console.warn("Failed to cleanup sticker files:", error);
        }
      };

      return processedMedia;
    } catch (error) {
      console.log("Media processing failed:", error);

      // Cleanup on error
      try {
        if (fs.existsSync(inputFile)) await unlinkAsync(inputFile);
        if (fs.existsSync(outputFile)) await unlinkAsync(outputFile);
        if (fs.existsSync(framesDir)) {
          const files = fs.readdirSync(framesDir);
          await Promise.all(files.map((file) => unlinkAsync(path.join(framesDir, file))));
          fs.rmdirSync(framesDir);
        }
      } catch (cleanupError) {
        console.warn("Failed to cleanup files:", cleanupError);
      }
      return media;
    }
  } catch (error) {
    console.error("Error processing media:", error);
    return media;
  }
}
