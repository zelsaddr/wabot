import qrcode from "qrcode-terminal";
import { Client, LocalAuth, type Message, type Chat, type Contact, MessageTypes } from "whatsapp-web.js";
import config from "./config/config.json";
import { processMediaForSticker, downloadMedia } from "./utils/mediaHelper";
import chalk from "chalk";
import * as roleManager from "./utils/roleManager";

// Debug logging function with colors and variable names
const debugLog = (message: string, data?: any, type: "info" | "success" | "error" | "warning" | "media" = "info", varName?: string) => {
  const timestamp = chalk.gray(`[${new Date().toISOString()}]`);
  let coloredMessage = message;

  switch (type) {
    case "success":
      coloredMessage = chalk.green(message);
      break;
    case "error":
      coloredMessage = chalk.red(message);
      break;
    case "warning":
      coloredMessage = chalk.yellow(message);
      break;
    case "media":
      coloredMessage = chalk.cyan(message);
      break;
    default:
      coloredMessage = chalk.blue(message);
  }

  const varContext = varName ? chalk.magenta(`[${varName}]`) : "";
  console.log(`${timestamp} ${varContext} ${coloredMessage}`, data ? JSON.stringify(data, null, 2) : "");
};

// Media debugging helper
const debugMedia = (media: any, context: string, varName: string) => {
  debugLog(
    `Media Debug - ${context}`,
    {
      mimeType: media.mimetype,
      dataSize: media.data ? `${(media.data.length / 1024).toFixed(2)} KB` : "N/A",
      dimensions: media.width && media.height ? `${media.width}x${media.height}` : "N/A",
      duration: media.duration ? `${media.duration}s` : "N/A",
      isAnimated: media.isAnimated || false,
      isGif: media.mimetype?.includes("gif") || false,
      isVideo: media.mimetype?.includes("video") || false,
      isImage: media.mimetype?.includes("image") || false,
    },
    "media",
    varName
  );
};

// Define the client with proper types
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: "localSessionStorage",
  }),
  puppeteer: {
    headless: true,
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: {
      width: 1280,
      height: 720,
    },
  },
  webVersionCache: {
    type: "none",
  },
});

// Log WhatsApp version information
client.on("loading_screen", (percent, message) => {
  debugLog(
    "Loading WhatsApp Web",
    {
      percent,
      message,
    },
    "info",
    "loading"
  );
});

client.on("qr", (qr: string) => {
  debugLog("QR Code received", null, "warning", "qr");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  debugLog(
    "Client is ready and authenticated",
    {
      whatsappVersion: client.info?.phone?.wa_version,
      platform: client.info?.platform,
      pushname: client.info?.pushname,
      wid: client.info?.wid?._serialized,
    },
    "success",
    "client"
  );
});

client.on("message", async (message: Message) => {
  // Debug log for all incoming messages
  debugLog(
    "New message received",
    {
      from: message.from,
      type: message.type,
      body: message.body,
      hasQuotedMsg: message.hasQuotedMsg,
      author: message.author,
      timestamp: message.timestamp,
    },
    "info",
    "message"
  );

  // Handle !everyone command
  if (message.body.startsWith("!everyone")) {
    try {
      // Check if the message is from a group
      const chat = await message.getChat();
      if (!chat.isGroup) {
        await message.reply("*[❌]* Perintah ini hanya bisa digunakan di grup!");
        return;
      }

      // Check if sender is admin
      const senderId = message.author || message.from;
      let isAdmin = false;
      for (const participant of (chat as any).participants) {
        if (participant.id._serialized === senderId && participant.isAdmin) {
          isAdmin = true;
          break;
        }
      }

      if (!isAdmin) {
        await message.reply("*[❌]* Hanya admin grup yang bisa menggunakan perintah ini!");
        return;
      }

      // Get custom message if provided
      const customMessage = message.body.slice("!everyone".length).trim();
      const templates = {
        default: "📢 *Perhatian semua!*",
        rapat: "📅 *Pengingat Rapat*\nMohon untuk bergabung dalam rapat!",
        pengumuman: "📢 *Pengumuman Penting*\nMohon dibaca dengan seksama!",
        acara: "🎉 *Acara Mendatang*\nJangan lupa untuk bergabung!",
        pengingat: "⏰ *Pengingat*\nMohon untuk diperhatikan!",
        darurat: "🚨 *Pesan Penting*\nMembutuhkan perhatian segera!",
        tugas: "📝 *Pembagian Tugas*\nMohon untuk menyelesaikan tugas masing-masing!",
        libur: "🏖️ *Pengumuman Libur*\nInformasi jadwal libur!",
        meeting: "👥 *Meeting Online*\nJadwal meeting online!",
        deadline: "⏳ *Deadline Tugas*\nBatas waktu pengumpulan tugas!",
      };

      // Get all participants and create mentions
      const participantData: { id: string; name: string; mention: string }[] = [];

      for (const participant of (chat as any).participants) {
        try {
          const contact = await client.getContactById(participant.id._serialized);
          participantData.push({
            id: participant.id._serialized,
            name: contact.name || contact.pushname || participant.id.user,
            mention: `@${participant.id.user}`,
          });
        } catch (err) {
          debugLog(`Error getting contact for ${participant.id.user}`, { error: err }, "error", "contact");
        }
      }

      // Sort participants by name
      participantData.sort((a, b) => a.name.localeCompare(b.name));

      // Create final text and mentions array
      const mentions = participantData.map((p) => p.id);
      const mentionText = participantData.map((p) => p.mention).join(" ");

      // Prepare the message
      let messageText = "";
      if (customMessage) {
        // Check if it's a template
        const templateKey = customMessage.toLowerCase();
        if (templates[templateKey as keyof typeof templates]) {
          messageText = `${templates[templateKey as keyof typeof templates]}\n\n${mentionText}`;
        } else {
          // If it's a custom message, add a nice header
          messageText = `📢 *Pengumuman*\n${customMessage}\n\n${mentionText}`;
        }
      } else {
        messageText = `${templates.default}\n\n${mentionText}`;
      }

      // Send message with mentions
      await chat.sendMessage(messageText, { mentions });
    } catch (error) {
      debugLog(
        "Error in !everyone command",
        {
          error: error.message,
          stack: error.stack,
        },
        "error",
        "everyone"
      );
      await message.reply("*[❎]* Gagal untuk mention semua orang. Silakan coba lagi nanti.");
    }
  }

  // Role Management Commands
  if (message.body.startsWith("!role")) {
    try {
      const chat = await message.getChat();
      if (!chat.isGroup) {
        await message.reply("*[❌]* Perintah ini hanya bisa digunakan di grup!");
        return;
      }

      const senderId = message.author || message.from;
      let isAdmin = false;
      for (const participant of (chat as any).participants) {
        if (participant.id._serialized === senderId && participant.isAdmin) {
          isAdmin = true;
          break;
        }
      }

      if (!isAdmin) {
        await message.reply("*[❌]* Hanya admin grup yang bisa menggunakan perintah ini!");
        return;
      }

      const groupId = chat.id._serialized.toString();
      const args = message.body.slice("!role".length).trim().split(" ");
      const command = args[0]?.toLowerCase();

      switch (command) {
        case "create":
          if (args.length < 2) {
            await message.reply("*[❌]* Format: !role create <nama_role>");
            return;
          }
          const roleName = args[1];
          if (roleManager.createRole(groupId, roleName)) {
            await message.reply(`*[✅]* Role "${roleName}" berhasil dibuat!`);
          } else {
            await message.reply(`*[❌]* Role "${roleName}" sudah ada!`);
          }
          break;

        case "delete":
          if (args.length < 2) {
            await message.reply("*[❌]* Format: !role delete <nama_role>");
            return;
          }
          if (roleManager.deleteRole(groupId, args[1])) {
            await message.reply(`*[✅]* Role "${args[1]}" berhasil dihapus!`);
          } else {
            await message.reply(`*[❌]* Role "${args[1]}" tidak ditemukan!`);
          }
          break;

        case "add":
          if (args.length < 3) {
            await message.reply("*[❌]* Format: !role add <nama_role> @user");
            return;
          }
          const mentionedUsers = message.mentionedIds.map((id) => id.toString());
          if (mentionedUsers.length === 0) {
            await message.reply("*[❌]* Tag user yang ingin ditambahkan ke role!");
            return;
          }
          for (const userId of mentionedUsers) {
            try {
              const contact = await client.getContactById(userId);
              if (roleManager.addMemberToRole(groupId, args[1], userId, contact.name || "", contact.pushname || "")) {
                await message.reply(`*[✅]* User berhasil ditambahkan ke role "${args[1]}"!`);
              } else {
                await message.reply(`*[❌]* Role "${args[1]}" tidak ditemukan!`);
              }
            } catch (err) {
              await message.reply(`*[❌]* Gagal mendapatkan informasi user!`);
            }
          }
          break;

        case "remove":
          if (args.length < 3) {
            await message.reply("*[❌]* Format: !role remove <nama_role> @user");
            return;
          }
          const mentionedUsers2 = message.mentionedIds.map((id) => id.toString());
          if (mentionedUsers2.length === 0) {
            await message.reply("*[❌]* Tag user yang ingin dihapus dari role!");
            return;
          }
          for (const userId of mentionedUsers2) {
            if (roleManager.removeMemberFromRole(groupId, args[1], userId)) {
              await message.reply(`*[✅]* User berhasil dihapus dari role "${args[1]}"!`);
            } else {
              await message.reply(`*[❌]* Role "${args[1]}" tidak ditemukan!`);
            }
          }
          break;

        case "list":
          const roles = roleManager.getGroupRoles(groupId);
          if (roles.length === 0) {
            await message.reply("*[ℹ️]* Belum ada role yang dibuat di grup ini!");
            return;
          }
          let roleList = "*[📋]* Daftar Role:\n\n";
          for (const role of roles) {
            const memberCount = role.members.length;
            roleList += `*${role.name}* (${memberCount} member)\n`;
          }
          await message.reply(roleList);
          break;

        case "members":
          if (args.length < 2) {
            await message.reply("*[❌]* Format: !role members <nama_role>");
            return;
          }
          const members = roleManager.getRoleMembers(groupId, args[1]);
          if (members.length === 0) {
            await message.reply(`*[ℹ️]* Tidak ada member dalam role "${args[1]}"!`);
            return;
          }
          let memberList = `*[👥]* Members dengan role "${args[1]}":\n\n`;
          for (const member of members) {
            memberList += `• @${member.name || member.pushname || member.id}\n`;
          }
          await message.reply(memberList);
          break;

        default:
          await message.reply(
            "*[ℹ️]* Perintah Role Management:\n\n" +
              "• !role create <nama_role> - Buat role baru\n" +
              "• !role delete <nama_role> - Hapus role\n" +
              "• !role add <nama_role> @user - Tambah user ke role\n" +
              "• !role remove <nama_role> @user - Hapus user dari role\n" +
              "• !role list - Lihat daftar role\n" +
              "• !role members <nama_role> - Lihat member dalam role"
          );
      }
    } catch (error) {
      debugLog(
        "Error in role management",
        {
          error: error.message,
          stack: error.stack,
        },
        "error",
        "role"
      );
      await message.reply("*[❎]* Terjadi kesalahan. Silakan coba lagi nanti.");
    }
  }

  // Role Mention
  if (message.body.includes("@")) {
    try {
      const chat = await message.getChat();
      if (!chat.isGroup) return;

      const groupId = chat.id._serialized.toString();
      const roles = roleManager.getGroupRoles(groupId);
      if (roles.length === 0) return;

      let messageText = message.body;
      const mentionedRoles: { name: string; members: { id: string; name: string; pushname: string }[] }[] = [];

      // Check for role mentions
      for (const role of roles) {
        const roleMention = `@${role.name}`;
        if (messageText.includes(roleMention)) {
          const roleMembers = roleManager.getRoleMembers(groupId, role.name);
          if (roleMembers.length > 0) {
            mentionedRoles.push({ name: role.name, members: roleMembers });
          }
        }
      }

      if (mentionedRoles.length > 0) {
        // Check for custom message pattern: @role message
        let customPatternMatch: RegExpMatchArray | null = null;
        if (mentionedRoles.length === 1) {
          const role = mentionedRoles[0];
          const regex = new RegExp(`^@${role.name}\\s+(.+)`, "i");
          customPatternMatch = message.body.match(regex);
        }

        let formattedMessage = messageText;
        const mentions: string[] = [];
        const memberData: { id: string; name: string; mention: string }[] = [];

        for (const role of mentionedRoles) {
          formattedMessage = formattedMessage.replace(`@${role.name}`, `*[${role.name.toUpperCase()}]*`);
          for (const member of role.members) {
            try {
              const contact = await client.getContactById(member.id);
              const memberName = contact.name || contact.pushname || member.name || member.pushname || member.id;
              memberData.push({
                id: member.id,
                name: memberName,
                mention: `@${member.id.split("@")[0]}`,
              });
            } catch (err) {
              debugLog(`Error getting contact for ${member.id}`, { error: err }, "error", "contact");
              memberData.push({
                id: member.id,
                name: member.name || member.pushname || member.id,
                mention: `@${member.id.split("@")[0]}`,
              });
            }
          }
        }

        memberData.sort((a, b) => a.name.localeCompare(b.name));
        mentions.push(...memberData.map((m) => m.id));
        const mentionText = memberData.map((m) => m.mention).join(" ");

        // If matches custom pattern, use that format
        if (customPatternMatch) {
          formattedMessage = `*[${mentionedRoles[0].name.toUpperCase()}]* ${customPatternMatch[1]}`;
        }

        await chat.sendMessage(formattedMessage + (mentionText ? "\n" + mentionText : ""), { mentions });
      }
    } catch (error) {
      debugLog(
        "Error in role mention",
        {
          error: error.message,
          stack: error.stack,
        },
        "error",
        "roleMention"
      );
    }
  }

  if ((message.type === MessageTypes.IMAGE || message.type === MessageTypes.VIDEO) && message.body === ".sticker" && !message.hasQuotedMsg) {
    try {
      debugLog(
        "Processing sticker from direct media",
        {
          mediaType: message.type,
          from: message.from,
          recipient: message.from,
          chatId: message.from,
          isGroup: message.from.includes("g.us"),
          timestamp: new Date().toISOString(),
        },
        "media",
        "message"
      );

      await message.react("⏳");
      const media = await downloadMedia(message);

      debugMedia(media, "Direct Media Download", "media");

      const isGif = media.mimetype && (media.mimetype.includes("gif") || media.mimetype.includes("image/gif"));
      const isVideo = media.mimetype && media.mimetype.includes("video");

      debugLog(
        "Processing media",
        {
          isGif,
          isVideo,
          originalType: message.type,
          mimeType: media.mimetype,
        },
        "media",
        "mediaType"
      );

      const processedMedia = isGif || isVideo ? await processMediaForSticker(media) : media;

      if (processedMedia !== media) {
        debugMedia(processedMedia, "Processed Media", "processedMedia");
      }

      const stickerOptions = {
        sendMediaAsSticker: true,
        stickerName: config.name,
        stickerAuthor: config.author,
        stickerCategories: isGif || isVideo ? ["🎬", "🔄"] : ["🖼️"],
        quality: 100,
      };

      await message
        .reply(processedMedia, message.from, stickerOptions)
        .then(async () => {
          debugLog(
            "Sticker created and sent successfully",
            {
              recipient: message.from,
              chatId: message.from,
              isGroup: message.from.includes("g.us"),
              timestamp: new Date().toISOString(),
            },
            "success",
            "sticker"
          );
          await message.react("✅");

          // Cleanup all temporary files
          try {
            if ((processedMedia as any).cleanup) {
              await (processedMedia as any).cleanup();
            }
            if ((media as any).cleanup) {
              await (media as any).cleanup();
            }
            debugLog("Temporary files cleaned up successfully", null, "success", "cleanup");
          } catch (cleanupError) {
            debugLog("Failed to cleanup temporary files", { error: cleanupError }, "error", "cleanup");
          }
        })
        .catch(async (err) => {
          debugLog(
            "Sticker creation error",
            {
              error: err.message,
              stack: err.stack,
            },
            "error",
            "sticker"
          );
          await message.react("❌");
          await message.reply(`*[❎]* Failed to create sticker. Error: ${err.message}`);

          // Cleanup temporary files even on error
          try {
            if ((processedMedia as any).cleanup) {
              await (processedMedia as any).cleanup();
            }
            if ((media as any).cleanup) {
              await (media as any).cleanup();
            }
            debugLog("Temporary files cleaned up after error", null, "success", "cleanup");
          } catch (cleanupError) {
            debugLog("Failed to cleanup temporary files after error", { error: cleanupError }, "error", "cleanup");
          }
        });
    } catch (err) {
      debugLog(
        "Error in sticker creation",
        {
          error: err.message,
          stack: err.stack,
        },
        "error",
        "sticker"
      );
      client.sendMessage(message.from, "*[❎]* Failed to process media!");
    }
  }
});

client.on("message", async (ms: Message) => {
  if (ms.hasQuotedMsg && ms.type === MessageTypes.TEXT && ms.body === ".sticker") {
    try {
      debugLog(
        "Processing sticker from quoted message",
        {
          from: ms.from,
          recipient: ms.from,
          chatId: ms.from,
          isGroup: ms.from.includes("g.us"),
          quotedMsgId: ms.id,
          messageType: ms.type,
          hasQuotedMsg: ms.hasQuotedMsg,
          timestamp: new Date().toISOString(),
        },
        "media",
        "quotedMessage"
      );

      await ms.react("⏳");
      const quotedMessage = await ms.getQuotedMessage();

      debugLog(
        "Quoted message details",
        {
          quotedId: quotedMessage.id,
          quotedType: quotedMessage.type,
          quotedBody: quotedMessage.body,
          hasMedia: quotedMessage.hasMedia,
          mediaType: quotedMessage.type,
        },
        "info",
        "quotedMessage"
      );

      if (!quotedMessage.hasMedia) {
        debugLog(
          "Quoted message has no media",
          {
            quotedId: quotedMessage.id,
            quotedType: quotedMessage.type,
          },
          "error",
          "quotedMessage"
        );
        await ms.react("❌");
        return client.sendMessage(ms.from, "*[❎]* The quoted message doesn't contain any media!");
      }

      const media = await downloadMedia(quotedMessage);

      debugMedia(media, "Quoted Media Download", "quotedMedia");

      const isGif = media.mimetype && (media.mimetype.includes("gif") || media.mimetype.includes("image/gif"));
      const isVideo = media.mimetype && media.mimetype.includes("video");

      debugLog(
        "Processing quoted media",
        {
          isGif,
          isVideo,
          originalType: quotedMessage.type,
          mimeType: media.mimetype,
          dataSize: media.data.length,
        },
        "media",
        "mediaType"
      );

      const processedMedia = isGif || isVideo ? await processMediaForSticker(media) : media;

      if (processedMedia !== media) {
        debugMedia(processedMedia, "Processed Quoted Media", "processedQuotedMedia");
      }

      const stickerOptions = {
        sendMediaAsSticker: true,
        stickerName: config.name,
        stickerAuthor: config.author,
        stickerCategories: isGif || isVideo ? ["🎬", "🔄"] : ["🖼️"],
        quality: 100,
      };

      await ms
        .reply(processedMedia, ms.from, stickerOptions)
        .then(async () => {
          debugLog(
            "Quoted sticker created and sent successfully",
            {
              recipient: ms.from,
              chatId: ms.from,
              isGroup: ms.from.includes("g.us"),
              timestamp: new Date().toISOString(),
            },
            "success",
            "quotedSticker"
          );
          await ms.react("✅");

          // Cleanup all temporary files
          try {
            if ((processedMedia as any).cleanup) {
              await (processedMedia as any).cleanup();
            }
            if ((media as any).cleanup) {
              await (media as any).cleanup();
            }
            debugLog("Temporary files cleaned up successfully", null, "success", "cleanup");
          } catch (cleanupError) {
            debugLog("Failed to cleanup temporary files", { error: cleanupError }, "error", "cleanup");
          }
        })
        .catch(async (err) => {
          debugLog(
            "Quoted sticker creation error",
            {
              error: err.message,
              stack: err.stack,
              mediaInfo: {
                mimetype: media.mimetype,
                dataSize: media.data.length,
              },
            },
            "error",
            "quotedSticker"
          );
          await ms.react("❌");
          await ms.reply(`*[❎]* Failed to create sticker. Error: ${err.message}`);

          // Cleanup temporary files even on error
          try {
            if ((processedMedia as any).cleanup) {
              await (processedMedia as any).cleanup();
            }
            if ((media as any).cleanup) {
              await (media as any).cleanup();
            }
            debugLog("Temporary files cleaned up after error", null, "success", "cleanup");
          } catch (cleanupError) {
            debugLog("Failed to cleanup temporary files after error", { error: cleanupError }, "error", "cleanup");
          }
        });
    } catch (err) {
      debugLog(
        "Error in quoted sticker creation",
        {
          error: err.message,
          stack: err.stack,
          messageInfo: {
            id: ms.id,
            type: ms.type,
            hasQuotedMsg: ms.hasQuotedMsg,
          },
        },
        "error",
        "quotedSticker"
      );
      client.sendMessage(ms.from, "*[❎]* Failed to process media!");
    }
  }
});

// Add error event handler
client.on("auth_failure", (error) => {
  debugLog("Authentication failed", { error }, "error", "auth");
});

client.on("disconnected", (reason) => {
  debugLog("Client disconnected", { reason }, "warning", "connection");
});

client.initialize();
