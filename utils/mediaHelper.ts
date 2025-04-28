import { MessageMedia } from "whatsapp-web.js";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { exec as execCallback } from "child_process";

const exec = promisify(execCallback);
const writeFileAsync = promisify(fs.writeFile);
const readFileAsync = promisify(fs.readFile);
const unlinkAsync = promisify(fs.unlink);

/**
 * Helper function to process GIFs for better sticker compatibility
 * @param media The message media to process
 * @returns Processed media ready for sticker creation
 */
export async function processGifForSticker(
  media: MessageMedia
): Promise<MessageMedia> {
  try {
    const tempDir = path.join(process.cwd(), "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }

    const timestamp = Date.now();
    const inputFile = path.join(tempDir, `input_${timestamp}.gif`);
    const outputFile = path.join(tempDir, `output_${timestamp}.webp`);

    const buffer = Buffer.from(media.data, "base64");
    await writeFileAsync(inputFile, buffer);

    try {
      await exec(
        `ffmpeg -i ${inputFile} -vf "scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000" -lossless 1 -loop 0 -preset default -an -vsync 0 ${outputFile}`
      );

      const processedBuffer = await readFileAsync(outputFile);
      const processedMedia = new MessageMedia(
        "image/webp",
        processedBuffer.toString("base64"),
        "sticker.webp"
      );

      await unlinkAsync(inputFile);
      await unlinkAsync(outputFile);

      return processedMedia;
    } catch (error) {
      console.log(
        "FFmpeg processing failed, falling back to original media:",
        error
      );

      await unlinkAsync(inputFile);
      return media;
    }
  } catch (error) {
    console.error("Error processing GIF:", error);
    return media;
  }
}
