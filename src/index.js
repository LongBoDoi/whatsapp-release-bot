const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const API_SECRET = process.env.API_SECRET || 'change-this-secret';
const GROUP_NAME = process.env.WHATSAPP_GROUP_NAME || '';

let client;
let isReady = false;
let currentQR = null;
let targetGroupId = null;

// ─── WhatsApp Client Setup ────────────────────────────────────────────────────

function initClient() {
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: '/data/.wwebjs_auth' }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    }
  });

  client.on('qr', async (qr) => {
    console.log('\n📱 Scan this QR code with WhatsApp to log in:\n');
    qrcodeTerminal.generate(qr, { small: true });
    currentQR = await qrcode.toDataURL(qr);
    isReady = false;
  });

  client.on('authenticated', () => {
    console.log('✅ WhatsApp authenticated!');
    currentQR = null;
  });

  client.on('ready', async () => {
    console.log('🚀 WhatsApp client is ready!');
    isReady = true;
    currentQR = null;
    await findTargetGroup();
  });

  client.on('disconnected', (reason) => {
    console.log('❌ WhatsApp disconnected:', reason);
    isReady = false;
    setTimeout(() => {
      console.log('🔄 Reconnecting...');
      initClient();
    }, 5000);
  });

  client.initialize();
}

async function findTargetGroup() {
  if (!GROUP_NAME) {
    console.log('⚠️  No WHATSAPP_GROUP_NAME set. Group ID must be passed per request.');
    return;
  }
  try {
    const chats = await client.getChats();
    const group = chats.find(c => c.isGroup && c.name === GROUP_NAME);
    if (group) {
      targetGroupId = group.id._serialized;
      console.log(`✅ Found group "${GROUP_NAME}" → ${targetGroupId}`);
    } else {
      console.log(`⚠️  Group "${GROUP_NAME}" not found. Available groups:`);
      chats.filter(c => c.isGroup).forEach(g => console.log(`   - ${g.name}`));
    }
  } catch (err) {
    console.error('Error finding group:', err.message);
  }
}

// ─── Middleware ────────────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const secret = req.headers['x-api-secret'] || req.query.secret;
  if (secret !== API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check — no auth needed
app.get('/', (req, res) => {
  res.json({
    status: isReady ? 'ready' : 'not_ready',
    hasQR: !!currentQR,
    group: targetGroupId || 'not set'
  });
});

// QR code page — scan this in browser to log in
app.get('/qr', (req, res) => {
  if (isReady) {
    return res.send('<h2 style="font-family:sans-serif;color:green">✅ Already logged in! Bot is ready.</h2>');
  }
  if (!currentQR) {
    return res.send('<h2 style="font-family:sans-serif">⏳ Generating QR code, refresh in a few seconds...</h2><script>setTimeout(()=>location.reload(),3000)</script>');
  }
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>WhatsApp Bot Login</title>
      <style>
        body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; padding: 40px; background: #f0f2f5; }
        .card { background: white; border-radius: 16px; padding: 32px; text-align: center; box-shadow: 0 2px 16px rgba(0,0,0,0.1); max-width: 400px; }
        h1 { color: #128C7E; margin-bottom: 8px; }
        p { color: #667781; margin-bottom: 24px; }
        img { width: 260px; height: 260px; border: 3px solid #128C7E; border-radius: 12px; }
        .steps { text-align: left; margin-top: 24px; color: #3b4a54; font-size: 14px; line-height: 2; }
      </style>
      <script>setTimeout(() => location.reload(), 30000)</script>
    </head>
    <body>
      <div class="card">
        <h1>📱 WhatsApp Bot</h1>
        <p>Scan this QR code to connect your WhatsApp</p>
        <img src="${currentQR}" alt="QR Code" />
        <div class="steps">
          <b>How to scan:</b><br>
          1. Open WhatsApp on your phone<br>
          2. Tap ⋮ Menu → Linked Devices<br>
          3. Tap "Link a Device"<br>
          4. Point your camera at the QR above
        </div>
      </div>
    </body>
    </html>
  `);
});

// List all groups — useful to find your group name
app.get('/groups', requireAuth, async (req, res) => {
  if (!isReady) return res.status(503).json({ error: 'Client not ready' });
  try {
    const chats = await client.getChats();
    const groups = chats
      .filter(c => c.isGroup)
      .map(g => ({ id: g.id._serialized, name: g.name, participants: g.participants?.length }));
    res.json({ groups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send notification — called by GitHub Actions
app.post('/notify', requireAuth, async (req, res) => {
  if (!isReady) return res.status(503).json({ error: 'WhatsApp client not ready' });

  const { message, groupId } = req.body;

  if (!message) return res.status(400).json({ error: 'message is required' });

  const sendTo = groupId || targetGroupId;
  if (!sendTo) return res.status(400).json({ error: 'No group configured. Pass groupId or set WHATSAPP_GROUP_NAME.' });

  try {
    await client.sendMessage(sendTo, message);
    console.log(`📨 Message sent to ${sendTo}`);
    res.json({ success: true, sentTo: sendTo });
  } catch (err) {
    console.error('Send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
  console.log(`📋 Visit /qr to scan the WhatsApp QR code`);
  initClient();
});
