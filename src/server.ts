/**
 * Device Activity Tracker - Web Server
 *
 * HTTP server with Socket.IO for real-time tracking visualization.
 * Provides REST API and WebSocket interface for the React frontend.
 *
 * For educational and research purposes only.
 */

import path from 'path';
import fs from 'fs';
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
const ENABLE_SIGNAL = process.env.ENABLE_SIGNAL === 'true'; // Signal sadece açıkça istendiğinde çalışsın

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let sock: any;
let isWhatsAppConnected = false;
let isSignalConnected = false;
let signalAccountNumber: string | null = null;
let globalProbeMethod: ProbeMethod = 'delete';
let currentWhatsAppQr: string | null = null;

// Platform type for contacts
type Platform = 'whatsapp' | 'signal';

interface TrackerEntry {
    tracker: WhatsAppTracker | SignalTracker;
    platform: Platform;
}

const trackers: Map<string, TrackerEntry> = new Map();

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'debug' }),
        markOnlineOnConnect: true,
        printQRInTerminal: false,
    });

    sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('QR Code generated');
            currentWhatsAppQr = qr;
            io.emit('qr', qr);
        }

        if (connection === 'close') {
            isWhatsAppConnected = false;
            currentWhatsAppQr = null;
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('connection closed, reconnecting ', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            isWhatsAppConnected = true;
            currentWhatsAppQr = null;
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

async function checkSignalApiAvailable(): Promise<boolean> {
    if (!ENABLE_SIGNAL) return false;
    try {
        const response = await fetch(`${SIGNAL_API_URL}/v1/about`, {
            signal: AbortSignal.timeout(2000)
        });
        return response.ok;
    } catch {
        return false;
    }
}

async function checkSignalConnection() {
    if (!ENABLE_SIGNAL) return;

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
            if (!signalLinkingInProgress) {
                startSignalLinking();
            }
        }
    } catch (err) {
        if (isSignalConnected) {
            isSignalConnected = false;
            signalAccountNumber = null;
            io.emit('signal-disconnected');
        }
    }
}

async function startSignalLinking() {
    if (!ENABLE_SIGNAL || signalLinkingInProgress || isSignalConnected) return;

    signalLinkingInProgress = true;
    console.log('[SIGNAL] Starting device linking...');

    try {
        const response = await fetch(`${SIGNAL_API_URL}/v1/qrcodelink?device_name=activity-tracker`);
        if (!response.ok) {
            signalLinkingInProgress = false;
            return;
        }

        currentSignalQrUrl = `${SIGNAL_API_URL}/v1/qrcodelink?device_name=activity-tracker&t=${Date.now()}`;
        io.emit('signal-qr-image', currentSignalQrUrl);
        pollSignalLinkingStatus();
    } catch (err) {
        signalLinkingInProgress = false;
    }
}

async function pollSignalLinkingStatus() {
    if (!ENABLE_SIGNAL) return;

    const checkInterval = setInterval(async () => {
        try {
            const accounts = await getSignalAccounts(SIGNAL_API_URL);
            if (accounts.length > 0) {
                clearInterval(checkInterval);
                signalLinkingInProgress = false;
                currentSignalQrUrl = null;
                isSignalConnected = true;
                signalAccountNumber = accounts[0];
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

// Signal sadece ENABLE_SIGNAL=true ise yoklansın
if (ENABLE_SIGNAL) {
    checkSignalConnection();
    setInterval(checkSignalConnection, 5000);
}

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
            if (!ENABLE_SIGNAL || !isSignalConnected || !signalAccountNumber) {
                socket.emit('error', { message: 'Signal servisi aktif değil veya bağlı değil.' });
                return;
            }

            const signalId = `signal:${cleanNumber}`;
            if (trackers.has(signalId)) {
                socket.emit('error', { jid: signalId, message: 'Already tracking this contact on Signal' });
                return;
            }

            try {
                const targetNumber = cleanNumber.startsWith('+') ? cleanNumber : `+${cleanNumber}`;
                const checkResult = await checkSignalNumber(SIGNAL_API_URL, signalAccountNumber, targetNumber);

                if (!checkResult.registered) {
                    socket.emit('error', {
                        jid: signalId,
                        message: checkResult.error || 'Number is not registered on Signal'
                    });
                    return;
                }

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
            // WhatsApp tracking
            const targetJid = cleanNumber + '@s.whatsapp.net';

            // Önceden asılı kalmış bir tracker varsa önce onu tamamen temizle (Yeniden ekleme hatasını çözer)
            if (trackers.has(targetJid)) {
                try {
                    trackers.get(targetJid)?.tracker.stopTracking();
                } catch (e) {}
                trackers.delete(targetJid);
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
            try {
                entry.tracker.stopTracking();
            } catch (err) {
                console.error('Error stopping tracker:', err);
            }
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
    });
});

const possibleClientPaths = [
    path.resolve(process.cwd(), 'client/build'),
    path.resolve(process.cwd(), 'client/dist'),
    path.resolve(process.cwd(), 'build'),
    path.resolve(process.cwd(), 'dist')
];

const clientPath = possibleClientPaths.find((p) => fs.existsSync(p)) || possibleClientPaths[0];

app.use(express.static(clientPath));

app.use((req: any, res: any) => {
    const indexPath = path.join(clientPath, 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.send('Tracker Backend Calisiyor. Frontend dosyalari derleniyor...');
    }
});

const PORT = parseInt(process.env.PORT || '3001', 10);
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
