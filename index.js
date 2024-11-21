const qrcode = require("qrcode-terminal");

const { Client, LocalAuth } = require("whatsapp-web.js");
const client = new Client({
  authStrategy: new LocalAuth(),
  webVersionCache: { type: 'none', remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/601b90a9fffce8a19e08efba9bd804fdcb43f656/html/2.2412.54.html', }
});
const config = require("./config/config.json");

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("Client is ready!");
});

client.on("message", async (message) => {
  if ((message.type === "image", "video", "gif" && message.body === ".sticker" && message.hasQuotedMsg != true)) {
    try {
      await message.react("⏳");
      const media = await message.downloadMedia();
      await message
        .reply(media, message.from, {
          sendMediaAsSticker: true,
          stickerName: config.name, // Sticker Name = Edit in 'config/config.json'
          stickerAuthor: config.author, // Sticker Author = Edit in 'config/config.json'
        })
        .then(async () => {
          await message.react("✅");
          // client.sendMessage(message.from, "*[✅]* Successfully!");
        })
        .catch(async (err) => {
          await message.react("❌");
        });
    } catch (err) {
      console.log(err);
      client.sendMessage(message.from, "*[❎]* Failed!");
    }
  }
});

client.on("message", async(ms) => {
    if (ms.hasQuotedMsg && ms.type == "chat" && ms.body == ".sticker") {
      let mess = await ms.getQuotedMessage();
      let media = await mess.downloadMedia();
      console.log(media);
      //   client.sendMessage(message.from, "*[⏳]* Loading..");
      try {
        await ms.react("⏳");
        await ms
            .reply(media, ms.from, {
              sendMediaAsSticker: true,
              stickerName: config.name, // Sticker Name = Edit in 'config/config.json'
              stickerAuthor: config.author, // Sticker Author = Edit in 'config/config.json'
            })
            .then(async () => {
              await ms.react("✅");
              // client.sendMessage(message.from, "*[✅]* Successfully!");
            })
            .catch(async (err) => {
              console.log(err);
              await ms.react("❌");
            });
      } catch (err) {
        console.log(err);
        client.sendMessage(ms.from, "*[❎]* Failed!");
      }
    }
});

// Mention everyone
client.on("message", async (msg) => {
  if (msg.body === "!everyone") {
    const chat = await msg.getChat();

    let text = "";
    let mentions = [];
    try { 
      for (let participant of chat.participants) {
        const contact = await client.getContactById(participant.id._serialized);

        mentions.push(contact);
        text += `@${participant.id.user} `;
      }

      await chat.sendMessage(text, { mentions });
    } catch (err) {
      client.sendMessage(msg.from, "*[❎]* Failed!");
    }
  }
});

client.initialize();
