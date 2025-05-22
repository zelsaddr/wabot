import qrcode from "qrcode-terminal";
import {
  Client,
  LocalAuth,
  type Message,
  type Chat,
  type Contact,
} from "whatsapp-web.js";
import config from "./config/config.json";
import { processGifForSticker } from "./utils/mediaHelper";

// Define the client with proper types
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: "localSessionStorage",
  }),
  puppeteer: {
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
  webVersionCache: {
    type: "none",
    remotePath:
      "https://raw.githubusercontent.com/wppconnect-team/wa-version/601b90a9fffce8a19e08efba9bd804fdcb43f656/html/2.2412.54.html",
  },
});

client.on("qr", (qr: string) => {
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("Client is ready!");
});

client.on("message", async (message: Message) => {
  if (
    (message.type === "image" ||
      message.type === "video" ||
      message.type === "gif") &&
    message.body === ".sticker" &&
    !message.hasQuotedMsg
  ) {
    try {
      await message.react("⏳");
      const media = await message.downloadMedia();

      if (!media || !media.data) {
        await message.react("❌");
        return client.sendMessage(
          message.from,
          "*[❎]* Failed to download media!"
        );
      }

      console.log("Media type:", media.mimetype);

      const isGif =
        message.type === "gif" ||
        (media.mimetype &&
          (media.mimetype.includes("gif") ||
            media.mimetype.includes("image/gif")));

      const processedMedia = isGif ? await processGifForSticker(media) : media;

      const stickerOptions = {
        sendMediaAsSticker: true,
        stickerName: config.name,
        stickerAuthor: config.author,
        stickerCategories: isGif ? ["🎬", "🔄"] : ["🖼️"],
        quality: 100,
      };

      await message
        .reply(processedMedia, message.from, stickerOptions)
        .then(async () => {
          await message.react("✅");
        })
        .catch(async (err) => {
          console.error("Sticker creation error:", err);
          await message.react("❌");
          await message.reply(
            `*[❎]* Failed to create sticker. Error: ${err.message}`
          );
        });
    } catch (err) {
      console.error("Error in sticker creation:", err);
      client.sendMessage(message.from, "*[❎]* Failed to process media!");
    }
  }
});

client.on("message", async (ms: Message) => {
  if (ms.hasQuotedMsg && ms.type === "chat" && ms.body === ".sticker") {
    try {
      await ms.react("⏳");
      const quotedMessage = await ms.getQuotedMessage();
      const media = await quotedMessage.downloadMedia();

      if (!media || !media.data) {
        await ms.react("❌");
        return client.sendMessage(ms.from, "*[❎]* Failed to download media!");
      }

      console.log("Quoted media type:", quotedMessage.type);
      console.log("Media mimetype:", media.mimetype);

      const isGif =
        quotedMessage.type === "gif" ||
        (media.mimetype &&
          (media.mimetype.includes("gif") ||
            media.mimetype.includes("image/gif")));

      const processedMedia = isGif ? await processGifForSticker(media) : media;

      const stickerOptions = {
        sendMediaAsSticker: true,
        stickerName: config.name,
        stickerAuthor: config.author,
        stickerCategories: isGif ? ["🎬", "🔄"] : ["🖼️"],
        quality: 100,
      };

      await ms
        .reply(processedMedia, ms.from, stickerOptions)
        .then(async () => {
          await ms.react("✅");
        })
        .catch(async (err) => {
          console.error("Sticker creation error:", err);
          await ms.react("❌");
          await ms.reply(
            `*[❎]* Failed to create sticker. Error: ${err.message}`
          );
        });
    } catch (err) {
      console.error("Error in sticker creation from quoted message:", err);
      client.sendMessage(ms.from, "*[❎]* Failed to process media!");
    }
  }
});

client.on("message", async (msg: Message) => {
  if (msg.body === "!everyone") {
    try {
      const chat: Chat = await msg.getChat();

      if (!chat.isGroup) {
        return msg.reply(
          "*[❌]* This command can only be executed in a group chat."
        );
      }

      const senderId: string = msg.author || msg.from;

      let isAdmin = false;
      for (const participant of chat.participants) {
        if (participant.id._serialized === senderId && participant.isAdmin) {
          isAdmin = true;
          break;
        }
      }

      if (!isAdmin) {
        return msg.reply("*[❌]* Only group admins can use this command.");
      }

      //   let text: string = "Hey everyone! 👋\n"; #won't use it
      let text = "";
      const mentions: Contact[] = [];

      for (const participant of chat.participants) {
        try {
          const contact = await client.getContactById(
            participant.id._serialized
          );
          mentions.push(contact);
          text += `@${participant.id.user} `;
        } catch (err) {
          console.error(
            `Error getting contact for ${participant.id.user}:`,
            err
          );
        }
      }

      await chat.sendMessage(text, { mentions });
    } catch (err) {
      console.error("Error in !everyone command:", err);
      await msg.reply(
        "*[❎]* Failed to mention everyone. Please try again later."
      );
    }
  }
});

client.initialize();
