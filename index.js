require("dotenv").config();
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");

// Universal fetch handler (Node 18+ native or node-fetch dynamic fallback)
const webFetch = typeof fetch === "function" 
    ? fetch 
    : (...args) => import('node-fetch').then(({default: f}) => f(...args));

// --- CONFIGURATION ---
const MAIN_TOKEN = process.env.TOKEN; 

// RB2 Configuration (Token 1)
const RB2_TOKEN = process.env.DISCORD_TOKEN; 
const parseChannels = (envVar) => envVar ? envVar.split(",").map(id => id.trim()).filter(Boolean) : [];

const rb2Group1 = parseChannels(process.env.CHANNEL_ID);
const rb2Group2 = parseChannels(process.env.CHANNEL_ID2);

// RB1 Configuration (Token 2)
const RB1_TOKEN = process.env.DISCORD_TOKEN2;
const rb1Group1 = parseChannels(process.env.CHANNEL_ID3);
const rb1Group2 = parseChannels(process.env.CHANNEL_ID4);

const PREFIX = "!";

// --- BROADCAST STATE TRACKING ---
const state = {
    rb1: { isBlasting: false, stopBlast: false },
    rb2: { isBlasting: false, stopBlast: false }
};

// --- AD MESSAGES ---
const messageGroup1 = `
# ORCA Development
At ORCA Development, we offer a wide range of Roblox military assets, games, scripts, guns, and more to improve your military gaming experience and bring a modern touch to your games.
# What We Sell at ORCA Development
At ORCA Development, we offer a variety of high-quality and medium-quality assets for Roblox at affordable prices. Here’s what we sell:
- **Maps:** High-quality and medium-quality maps.
- **Gun Systems:** R6 and mobile-supported gun systems that receive regular updates.
- **Military Assets:** Uniforms and maps for the British Army and Philippine Army.
- **Additional Assets:** Overheads, buildings, aircraft, motorcycles, vehicles, game scripts, and more.

**ORCA DEVELOPMENT LINKS**
- Public Marketplace https://clearlydev.com/store/orca-development
- Discord https://discord.com/invite/TYxR8APGMd

**Advertisements:**

https://media.discordapp.net/attachments/1211045069411324005/1397751478114062387/ORCA_20250724_082416_0000.png?ex=688628c1&is=6884d741&hm=82b99d94fa0ba484858b7868fbb368a20ec9c2d83815885bc88fe3ce2690c28c&format=webp&quality=lossless&

https://cdn.discordapp.com/attachments/1233783999189487706/1398819775400116375/copy_12DBBF0E-241F-43BC-AF7A-3BB84FFE3201.gif?ex=6886bfef&is=68856e6f&hm=33126490cdcd9c4444b4a1dcb391a7ae72db736fd2353ea45596e21d083601a5&
`;

const messageGroup2 = `
# ORCA Development

Level up your Roblox games with **ORCA Development**! We offer a wide range of **high-quality and medium-quality assets** at prices that won’t break the bank.

**What we offer:**
* **Maps:** Detailed, immersive worlds ready for any game.
* **Gun Systems:** Smooth, R6 and mobile-compatible systems with regular updates.
* **Military Assets:** Authentic uniforms and maps for the British Army and Philippine Army.
* **Extras:** Vehicles, aircraft, motorcycles, buildings, overheads, scripts, and more!

**Check out our top products:**
https://orcadev.net/b/sfGNq
https://orcadev.net/b/c9jho
https://orcadev.net/b/alphacore
https://orcadev.net/b/rUltP
https://orcadev.net/b/0KlWT

Bring your Roblox projects to life with ORCA Development – quality assets, made easy!
`;

// --- DISCORD REST API HELPERS ---
async function getServerName(channelId, token) {
    try {
        const res = await webFetch(`https://discord.com/api/v10/channels/${channelId}`, {
            headers: { "Authorization": token }
        });
        if (!res.ok) return "Unknown Server";
        const channelData = await res.json();
        return channelData.guild_id || "Unknown Server";
    } catch {
        return "Unknown Server";
    }
}

async function getGuildName(guildId, token) {
    if (guildId === "Unknown Server") return guildId;
    try {
        const res = await webFetch(`https://discord.com/api/v10/guilds/${guildId}`, {
            headers: { "Authorization": token }
        });
        if (!res.ok) return "Unknown Server";
        const guildData = await res.json();
        return guildData.name || "Unknown Server";
    } catch {
        return "Unknown Server";
    }
}

async function sendAd(channelId, content, token) {
    const now = new Date().toLocaleTimeString();
    const guildId = await getServerName(channelId, token);
    const guildName = await getGuildName(guildId, token);

    try {
        const res = await webFetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: "POST",
            headers: {
                "Authorization": token,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ content }),
        });

        if (res.ok) {
            console.log(`✅ [${now}] Sent to ${channelId} - ${guildName}`);
            return { success: true, time: now, guildName, channelId };
        } else {
            let errorMsg = res.statusText;
            try {
                const errorData = await res.json();
                if (errorData.message) errorMsg = errorData.message;
            } catch (e) {}

            console.error(`❌ [${now}] Failed to send to ${channelId} - ${guildName}: ${errorMsg}`);
            return { success: false, time: now, guildName, channelId, errorMsg };
        }
    } catch (err) {
        console.error(`❌ [${now}] Error sending to ${channelId} - ${guildName}:`, err.message);
        return { success: false, time: now, guildName, channelId, errorMsg: err.message };
    }
}

// --- CORE BLAST CONTROLLER (WITH DUAL EMBED LIVE UPDATES) ---
async function executeBlast({ systemName, statusMsg, successEmbed, failEmbed, groups, token, controlState }) {
    let successCount = 0;
    let failCount = 0;
    const totalChannels = groups.reduce((acc, g) => acc + g.channels.length, 0);

    const successLogs = [];
    const failLogs = [];

    const updateLiveStatus = async (isFinished = false, isStopped = false) => {
        const successRate = totalChannels > 0 ? ((successCount / totalChannels) * 100).toFixed(1) : 0;

        // Update Success Embed
        const successText = successLogs.length > 0 ? successLogs.join("\n") : "*No dispatches sent yet.*";
        successEmbed.setTitle(
            isStopped ? `🛑 [${systemName}] Success Log (Stopped)` : 
            isFinished ? `✅ [${systemName}] Broadcast Completed - Success Log` : 
            `🚀 [${systemName}] Live Success Log`
        );
        successEmbed.setDescription(
            `**Success Rate:** \`${successCount}/${totalChannels}\` (${successRate}%)\n\n${successText}`
        );

        // Update Failure Embed
        const failText = failLogs.length > 0 ? failLogs.join("\n") : "*No dispatches failed.*";
        failEmbed.setTitle(
            isStopped ? `🛑 [${systemName}] Failure Log (Stopped)` : 
            isFinished ? `❌ [${systemName}] Broadcast Completed - Failure Log` : 
            `⚠️ [${systemName}] Live Error Log`
        );
        failEmbed.setDescription(
            `**Failed Rate:** \`${failCount}/${totalChannels}\` Errors\n\n${failText}`
        );

        if (isFinished && !isStopped) {
            successEmbed.setColor("#00FF00");
            failEmbed.setColor(failCount > 0 ? "#FF0000" : "#2F3136");
        } else if (isStopped) {
            successEmbed.setColor("#FFA500");
            failEmbed.setColor("#FF0000");
        }

        await statusMsg.edit({ embeds: [successEmbed, failEmbed] }).catch(() => {});
    };

    for (const group of groups) {
        for (const channelId of group.channels) {
            if (controlState.stopBlast) {
                await updateLiveStatus(false, true);
                controlState.isBlasting = false;
                return;
            }

            if (!channelId) continue;
            const result = await sendAd(channelId, group.message, token);

            if (result.success) {
                successCount++;
                successLogs.push(`✅ \`[${result.time}]\` **${result.guildName}** (\`${result.channelId}\`)`);
                if (successLogs.length > 12) successLogs.shift();
            } else {
                failCount++;
                failLogs.push(`❌ \`[${result.time}]\` **${result.guildName}** - *${result.errorMsg}*`);
                if (failLogs.length > 12) failLogs.shift();
            }

            await updateLiveStatus(false, false);
            await new Promise(r => setTimeout(r, 2500 + Math.random() * 1000));
        }
    }

    await updateLiveStatus(true, false);
    controlState.isBlasting = false;
}

// --- DISCORD CLIENT ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once("clientReady", () => {
    console.log(`✅ Command Bot active as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === "ping") return message.reply("🏓 Pong!");
    if (command === "hello") return message.reply(`👋 Hello, ${message.author.username}!`);

    // Helper to create template embeds
    const createEmbedPair = (systemName) => {
        const successEmbed = new EmbedBuilder()
            .setTitle(`🚀 [${systemName}] Live Success Log`)
            .setDescription("Initializing success tracking...")
            .setColor("#00FF88")
            .setTimestamp();

        const failEmbed = new EmbedBuilder()
            .setTitle(`⚠️ [${systemName}] Live Error Log`)
            .setDescription("Initializing error tracking...")
            .setColor("#FF3366")
            .setFooter({ text: "ORCA Development Broadcast System" })
            .setTimestamp();

        return { successEmbed, failEmbed };
    };

    // --- RB1 COMMANDS ---
    if (command === "rb1") {
        if (state.rb1.isBlasting) return message.reply("⚠️ RB1 broadcast is already running! Use `!rb1forcestop` first.");
        state.rb1.isBlasting = true;
        state.rb1.stopBlast = false;

        const { successEmbed, failEmbed } = createEmbedPair("RB1 System");
        const statusMsg = await message.reply({ embeds: [successEmbed, failEmbed] });

        executeBlast({
            systemName: "RB1 System",
            statusMsg,
            successEmbed,
            failEmbed,
            groups: [
                { channels: rb1Group1, message: messageGroup1 },
                { channels: rb1Group2, message: messageGroup2 }
            ],
            token: RB1_TOKEN,
            controlState: state.rb1
        });
    }

    if (command === "rb1forcestop") {
        if (!state.rb1.isBlasting) return message.reply("⚠️ No RB1 broadcast is running.");
        state.rb1.stopBlast = true;
        return message.reply("🛑 Force stopping RB1 broadcast...");
    }

    // --- RB2 COMMANDS ---
    if (command === "rb2") {
        if (state.rb2.isBlasting) return message.reply("⚠️ RB2 broadcast is already running! Use `!rb2forcestop` first.");
        state.rb2.isBlasting = true;
        state.rb2.stopBlast = false;

        const { successEmbed, failEmbed } = createEmbedPair("RB2 System");
        const statusMsg = await message.reply({ embeds: [successEmbed, failEmbed] });

        executeBlast({
            systemName: "RB2 System",
            statusMsg,
            successEmbed,
            failEmbed,
            groups: [
                { channels: rb2Group1, message: messageGroup1 },
                { channels: rb2Group2, message: messageGroup2 }
            ],
            token: RB2_TOKEN,
            controlState: state.rb2
        });
    }

    if (command === "rb2forcestop") {
        if (!state.rb2.isBlasting) return message.reply("⚠️ No RB2 broadcast is running.");
        state.rb2.stopBlast = true;
        return message.reply("🛑 Force stopping RB2 broadcast...");
    }

    // --- UNIVERSAL COMMANDS ---
    if (command === "rbplayall") {
        let triggeredAny = false;

        if (!state.rb1.isBlasting) {
            state.rb1.isBlasting = true;
            state.rb1.stopBlast = false;
            triggeredAny = true;

            const { successEmbed, failEmbed } = createEmbedPair("RB1 System");
            message.reply({ embeds: [successEmbed, failEmbed] }).then(statusMsg => {
                executeBlast({
                    systemName: "RB1 System",
                    statusMsg,
                    successEmbed,
                    failEmbed,
                    groups: [
                        { channels: rb1Group1, message: messageGroup1 },
                        { channels: rb1Group2, message: messageGroup2 }
                    ],
                    token: RB1_TOKEN,
                    controlState: state.rb1
                });
            });
        }

        if (!state.rb2.isBlasting) {
            state.rb2.isBlasting = true;
            state.rb2.stopBlast = false;
            triggeredAny = true;

            const { successEmbed, failEmbed } = createEmbedPair("RB2 System");
            message.reply({ embeds: [successEmbed, failEmbed] }).then(statusMsg => {
                executeBlast({
                    systemName: "RB2 System",
                    statusMsg,
                    successEmbed,
                    failEmbed,
                    groups: [
                        { channels: rb2Group1, message: messageGroup1 },
                        { channels: rb2Group2, message: messageGroup2 }
                    ],
                    token: RB2_TOKEN,
                    controlState: state.rb2
                });
            });
        }

        if (!triggeredAny) {
            return message.reply("⚠️ All broadcast systems (RB1 & RB2) are already running!");
        }
    }

    if (command === "rbstopall") {
        let stoppedAny = false;
        if (state.rb1.isBlasting) { state.rb1.stopBlast = true; stoppedAny = true; }
        if (state.rb2.isBlasting) { state.rb2.stopBlast = true; stoppedAny = true; }

        if (!stoppedAny) return message.reply("⚠️ No active broadcasts are currently running.");
        return message.reply("🛑 Force stop signal sent to all active broadcast sessions!");
    }
});

client.login(MAIN_TOKEN);
