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
    // High resolution QR: large scale, high error correction, pure black/white
    currentQR = await qrcode.toDataURL(qr, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      scale: 12,           // bigger = easier to scan
      margin: 3,
      color: { dark: '#000000', light: '#ffffff' }
    });
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
    return res.send('<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f0f2f5"><div style="text-align:center"><div style="font-size:64px">✅</div><h2 style="color:#128C7E">Bot is logged in and ready!</h2></div></body></html>');
  }
  if (!currentQR) {
    return res.send('<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f0f2f5"><div style="text-align:center"><div style="font-size:48px">⏳</div><h2>Generating QR code...</h2><p style="color:#667781">This page will refresh automatically</p></div></body></html><script>setTimeout(()=>location.reload(),3000)</script>');
  }
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>WhatsApp Bot Login</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, sans-serif; background: #f0f2f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: white; border-radius: 20px; padding: 36px 32px; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.12); max-width: 480px; width: 100%; }
    h1 { color: #128C7E; font-size: 22px; margin-bottom: 6px; }
    .sub { color: #667781; font-size: 14px; margin-bottom: 28px; }
    .qr-wrap { background: #fff; border: 3px solid #128C7E; border-radius: 16px; display: inline-block; padding: 12px; margin-bottom: 20px; }
    .qr-wrap img { display: block; width: 320px; height: 320px; image-rendering: pixelated; }
    .btn { display: inline-block; margin-top: 4px; padding: 10px 24px; background: #128C7E; color: white; border-radius: 99px; font-size: 14px; font-weight: 600; text-decoration: none; cursor: pointer; border: none; }
    .btn:hover { background: #0e6b63; }
    .steps { text-align: left; margin-top: 24px; background: #f0f2f5; border-radius: 12px; padding: 16px 20px; font-size: 13px; color: #3b4a54; line-height: 2.2; }
    .steps b { color: #128C7E; }
    .expire { font-size: 12px; color: #aaa; margin-top: 16px; }
  </style>
  <script>setTimeout(() => location.reload(), 55000)</script>
</head>
<body>
  <div class="card">
    <h1>📱 WhatsApp Bot Login</h1>
    <p class="sub">Scan with your phone to connect</p>
    <div class="qr-wrap">
      <img src="${currentQR}" alt="QR Code" />
    </div>
    <br>
    <a href="${currentQR}" download="whatsapp-qr.png" class="btn">⬇️ Download QR Image</a>
    <div class="steps">
      <b>How to scan:</b><br>
      1. Open <b>WhatsApp</b> on your phone<br>
      2. Tap <b>⋮ Menu → Linked Devices</b><br>
      3. Tap <b>"Link a Device"</b><br>
      4. Point camera at the QR code above<br>
      💡 <i>Or download the image and scan it</i>
    </div>
    <p class="expire">⏱ QR expires in ~60s — page auto-refreshes</p>
  </div>
</body>
</html>`);
});

// Raw PNG endpoint — open this directly on your phone browser
app.get('/qr.png', (req, res) => {
  if (!currentQR) return res.status(404).send('QR not ready yet');
  const base64 = currentQR.replace(/^data:image\/png;base64,/, '');
  const buf = Buffer.from(base64, 'base64');
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-store');
  res.send(buf);
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
