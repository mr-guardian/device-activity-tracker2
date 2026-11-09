/**
 * Device Activity Tracker - Web Server
 *
 * HTTP server with Socket.IO for real-time tracking visualization.
 * Provides REST API and WebSocket interface for the React frontend.
 *
 * For educational and research purposes only.
 */

import path from 'path';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { pino } from 'pino';
import { Boom } from '@hapi/boom';
import { WhatsAppTracker, ProbeMethod } from './tracker.js';
import { SignalTracker, getSignalAccounts, checkSignalNumber } from './signal-tracker.js';

// Configuration
const SIGNAL_API_URL = process.env.SIGNAL_API_URL || 'http://localhost:8080';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*", // Allow all origins for dev
        methods: ["GET", "POST"]
    }
});

let sock: any;
let isWhatsAppConnected = false;
let isSignalConnected = false;
let signalAccountNumber: string | null = null;
let globalProbeMethod: ProbeMethod = 'delete'; // Default to delete method
let currentWhatsAppQr: string | null = null; // Store current QR code for new clients

// Platform type for contacts
type Platform = 'whatsapp' | 'signal';

interface TrackerEntry {
    tracker: WhatsAppTracker | SignalTracker;
    platform: Platform;
}

const trackers: Map<string, TrackerEntry> = new Map(); // JID/Number -> Tracker entry

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'debug' }),
        markOnlineOnConnect: true,
        printQRInTerminal: true, // QR kodun Railway terminal loglarına kare olarak basılması sağlandı
    });

    sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('QR Code generated');
            currentWhatsAppQr = qr; // Store the QR code
            io.emit('qr', qr);
        }

        if (connection === 'close') {
            isWhatsAppConnected = false;
            currentWhatsAppQr = null; // Clear QR on close
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('connection closed, reconnecting ', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            isWhatsAppConnected = true;
            currentWhatsAppQr = null; // Clear QR on successful connection
            console.log('opened connection');
            io.emit('connection-open');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messaging-history.set', ({ chats, contacts, messages, isLatest }: any) => {
        console.log(`[SESSION] History sync - Chats: ${chats.length}, Contacts: ${contacts.length}, Messages: ${messages.length}, Latest: ${isLatest}`);
    });

    sock.ev.on('messages.update', (updates: any) => {
        for (const update of updates) {
            console.log(`[MSG UPDATE] JID: ${update.key.remoteJid}, ID: ${update.key.id}, Status: ${update.update.status}, FromMe: ${update.key.fromMe}`);
        }
    });
}

connectToWhatsApp();

// Signal linking state
let signalLinkingInProgress = false;
let signalApiAvailable = false;
let currentSignalQrUrl: string | null = null;

// Check Signal API availability
async function checkSignalApiAvailable(): Promise<boolean> {
    try {
        const response = await fetch(`${SIGNAL_API_URL}/v1/about`, {
            signal: AbortSignal.timeout(2000)
        });
        return response.ok;
    } catch {
        return false;
    }
}

// Check Signal connection status
async function checkSignalConnection() {
    try {
        const available = await checkSignalApiAvailable();
        if (available !== signalApiAvailable) {
            signalApiAvailable = available;
            console.log(`[SIGNAL] API available: ${available}`);
            io.emit('signal-api-status', { available });
        }

        if (!available) {
            if (isSignalConnected) {
                isSignalConnected = false;
                signalAccountNumber = null;
                io.emit('signal-disconnected');
            }
            return;
        }

        const accounts = await getSignalAccounts(SIGNAL_API_URL);
        if (accounts.length > 0) {
            if (!isSignalConnected) {
                isSignalConnected = true;
                signalAccountNumber = accounts[0];
                signalLinkingInProgress = false;
                console.log(`[SIGNAL] Connected with account: ${signalAccountNumber}`);
                io.emit('signal-connection-open', { number: signalAccountNumber });
            }
        } else {
            if (isSignalConnected) {
                isSignalConnected = false;
                signalAccountNumber = null;
                console.log('[SIGNAL] Disconnected');
                io.emit('signal-disconnected');
            }
            // No accounts - need to link, start QR code process
            if (!signalLinkingInProgress) {
                startSignalLinking();
            }
        }
    } catch (err) {
        console.log('[SIGNAL] Error checking connection:', err);
        if (isSignalConnected) {
            isSignalConnected = false;
            signalAccountNumber = null;
            io.emit('signal-disconnected');
        }
    }
}

// Start Signal device linking - signal-cli-rest-api returns QR as PNG image
async function startSignalLinking() {
    if (signalLinkingInProgress || isSignalConnected) return;

    signalLinkingInProgress = true;
    console.log('[SIGNAL] Starting device linking...');

    try {
        // Check if the QR endpoint is available
        const response = await fetch(`${SIGNAL_API_URL}/v1/qrcodelink?device_name=activity-tracker`);
        if (!response.ok) {
            console.log('[SIGNAL] Failed to start linking:', response.status);
            signalLinkingInProgress = false;
            return;
        }

        currentSignalQrUrl = `${SIGNAL_API_URL}/v1/qrcodelink?device_name=activity-tracker&t=${Date.now()}`;
        console.log('[SIGNAL] Emitting QR image URL:', currentSignalQrUrl);
        io.emit('signal-qr-image', currentSignalQrUrl);

        pollSignalLinkingStatus();
    } catch (err) {
        console.log('[SIGNAL] Error starting linking:', err);
        signalLinkingInProgress = false;
    }
}

// Poll to check if Signal linking has completed
async function pollSignalLinkingStatus() {
    const checkInterval = setInterval(async () => {
        try {
            const accounts = await getSignalAccounts(SIGNAL_API_URL);
            if (accounts.length > 0) {
                clearInterval(checkInterval);
                signalLinkingInProgress = false;
                currentSignalQrUrl = null;
                isSignalConnected = true;
                signalAccountNumber = accounts[0];
                console.log(`[SIGNAL] Linking completed! Account: ${signalAccountNumber}`);
                io.emit('signal-connection-open', { number: signalAccountNumber });
            }
        } catch (err) {
            // Keep polling
        }
    }, 2000);

    setTimeout(() => {
        clearInterval(checkInterval);
        signalLinkingInProgress = false;
    }, 300000);
}

// Check Signal connection periodically
checkSignalConnection();
setInterval(checkSignalConnection, 5000);

io.on('connection', (socket) => {
    console.log('Client connected');

    if (currentWhatsAppQr) {
        socket.emit('qr', currentWhatsAppQr);
    }

    if (isWhatsAppConnected) {
        socket.emit('connection-open');
    }

    if (isSignalConnected && signalAccountNumber) {
        socket.emit('signal-connection-open', { number: signalAccountNumber });
    }

    socket.emit('signal-api-status', { available: signalApiAvailable });

    if (signalLinkingInProgress && currentSignalQrUrl) {
        socket.emit('signal-qr-image', currentSignalQrUrl);
    }

    socket.emit('probe-method', globalProbeMethod);

    const trackedContacts = Array.from(trackers.entries()).map(([id, entry]) => ({
        id,
        platform: entry.platform
    }));

    socket.on('get-tracked-contacts', () => {
        const trackedContacts = Array.from(trackers.entries()).map(([id, entry]) => ({
            id,
            platform: entry.platform
        }));
        socket.emit('tracked-contacts', trackedContacts);
    });

    socket.on('add-contact', async (data: string | { number: string; platform: Platform }) => {
        const { number, platform } = typeof data === 'string'
            ? { number: data, platform: 'whatsapp' as Platform }
            : data;

        console.log(`Request to track on ${platform}: ${number}`);
        const cleanNumber = number.replace(/\D/g, '');

        if (platform === 'signal') {
            if (!isSignalConnected || !signalAccountNumber) {
                socket.emit('error', { message: 'Signal is not connected. Please link Signal first.' });
                return;
            }

            const signalId = `signal:${cleanNumber}`;
            if (trackers.has(signalId)) {
                socket.emit('error', { jid: signalId, message: 'Already tracking this contact on Signal' });
                return;
            }

            try {
                const targetNumber = cleanNumber.startsWith('+') ? cleanNumber : `+${cleanNumber}`;
                console.log(`[SIGNAL] Checking if ${targetNumber} is registered...`);
                const checkResult = await checkSignalNumber(SIGNAL_API_URL, signalAccountNumber, targetNumber);

                if (!checkResult.registered) {
                    console.log(`[SIGNAL] Number ${targetNumber} is not discoverable: ${checkResult.error}`);
                    socket.emit('error', {
                        jid: signalId,
                        message: checkResult.error || 'Number is not registered on Signal'
                    });
                    return;
                }

                console.log(`[SIGNAL] Number ${targetNumber} is registered, starting tracking...`);
                const tracker = new SignalTracker(SIGNAL_API_URL, signalAccountNumber, targetNumber);

                trackers.set(signalId, { tracker, platform: 'signal' });

                tracker.onUpdate = (updateData) => {
                    io.emit('tracker-update', {
                        jid: signalId,
                        platform: 'signal',
                        ...updateData
                    });
                };

                tracker.startTracking();

                socket.emit('contact-added', {
                    jid: signalId,
                    number: cleanNumber,
                    platform: 'signal'
                });

                io.emit('contact-name', { jid: signalId, name: cleanNumber });
            } catch (err) {
                console.error(err);
                socket.emit('error', { message: 'Failed to start Signal tracking' });
            }
        } else {
            const targetJid = cleanNumber + '@s.whatsapp.net';

            if (trackers.has(targetJid)) {
                socket.emit('error', { jid: targetJid, message: 'Already tracking this contact' });
                return;
            }

            try {
                const results = await sock.onWhatsApp(targetJid);
                const result = results?.[0];

                if (result?.exists) {
                    const tracker = new WhatsAppTracker(sock, result.jid);
                    tracker.setProbeMethod(globalProbeMethod);
                    trackers.set(result.jid, { tracker, platform: 'whatsapp' });

                    tracker.onUpdate = (updateData) => {
                        io.emit('tracker-update', {
                            jid: result.jid,
                            platform: 'whatsapp',
                            ...updateData
                        });
                    };

                    tracker.startTracking();

                    const ppUrl = await tracker.getProfilePicture();

                    let contactName = cleanNumber;
                    try {
                        const contactInfo = await sock.onWhatsApp(result.jid);
                        if (contactInfo && contactInfo[0]?.notify) {
                            contactName = contactInfo[0].notify;
                        }
                    } catch (err) {
                        console.log('[NAME] Could not fetch contact name, using number');
                    }

                    socket.emit('contact-added', {
                        jid: result.jid,
                        number: cleanNumber,
                        platform: 'whatsapp'
                    });

                    io.emit('profile-pic', { jid: result.jid, url: ppUrl });
                    io.emit('contact-name', { jid: result.jid, name: contactName });
                } else {
                    socket.emit('error', { jid: targetJid, message: 'Number not on WhatsApp' });
                }
            } catch (err) {
                console.error(err);
                socket.emit('error', { jid: targetJid, message: 'Verification failed' });
            }
        }
    });

    socket.on('remove-contact', (jid: string) => {
        console.log(`Request to stop tracking: ${jid}`);
        const entry = trackers.get(jid);
        if (entry) {
            entry.tracker.stopTracking();
            trackers.delete(jid);
            socket.emit('contact-removed', jid);
        }
    });

    socket.on('set-probe-method', (method: ProbeMethod) => {
        console.log(`Request to change probe method to: ${method}`);
        if (method !== 'delete' && method !== 'reaction') {
            socket.emit('error', { message: 'Invalid probe method' });
            return;
        }

        globalProbeMethod = method;

        for (const entry of trackers.values()) {
            if (entry.platform === 'whatsapp') {
                (entry.tracker as WhatsAppTracker).setProbeMethod(method);
            }
        }

        io.emit('probe-method', method);
        console.log(`Probe method changed to: ${method}`);
    });
});

// React build klasörünü statik olarak sun
app.use(express.static(path.join(__dirname, '../client/build')));

// API dışındaki tüm GET isteklerini React arayüzüne (index.html) yönlendir
app.get('*', (req: any, res: any) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
});

const PORT = parseInt(process.env.PORT || '3001', 10);
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
