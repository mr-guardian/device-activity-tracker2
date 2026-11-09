import '@whiskeysockets/baileys';
import { WASocket, proto } from '@whiskeysockets/baileys';
import { pino } from 'pino';

// Suppress Baileys debug output
const logger = pino({
    level: process.argv.includes('--debug') ? 'debug' : 'silent'
});

export type ProbeMethod = 'delete' | 'reaction';

class TrackerLogger {
    private isDebugMode: boolean;

    constructor(debugMode: boolean = false) {
        this.isDebugMode = debugMode;
    }

    setDebugMode(enabled: boolean) {
        this.isDebugMode = enabled;
    }

    debug(...args: any[]) {
        if (this.isDebugMode) {
            console.log(...args);
        }
    }

    info(...args: any[]) {
        console.log(...args);
    }

    formatDeviceState(jid: string, rtt: number, avgRtt: number, median: number, threshold: number, state: string) {
        const stateColor = state === 'Online' ? '🟢' : state === 'Standby' ? '🟡' : state === 'OFFLINE' ? '🔴' : '⚪';
        const timestamp = new Date().toLocaleTimeString('de-DE');
        const boxWidth = 62;

        const header = `${stateColor} Device Status Update - ${timestamp}`;
        const jidLine = `JID:        ${jid}`;
        const statusLine = `Status:     ${state}`;
        const rttLine = `RTT:        ${rtt}ms`;
        const avgLine = `Avg (3):    ${avgRtt.toFixed(0)}ms`;
        const medianLine = `Median:     ${median.toFixed(0)}ms`;
        const thresholdLine = `Threshold:  ${threshold.toFixed(0)}ms`;

        console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
        console.log(`║ ${header.padEnd(boxWidth)} ║`);
        console.log(`╠════════════════════════════════════════════════════════════════╣`);
        console.log(`║ ${jidLine.padEnd(boxWidth)} ║`);
        console.log(`║ ${statusLine.padEnd(boxWidth)} ║`);
        console.log(`║ ${rttLine.padEnd(boxWidth)} ║`);
        console.log(`║ ${avgLine.padEnd(boxWidth)} ║`);
        console.log(`║ ${medianLine.padEnd(boxWidth)} ║`);
        console.log(`║ ${thresholdLine.padEnd(boxWidth)} ║`);
        console.log(`╚════════════════════════════════════════════════════════════════╝\n`);
    }
}

const trackerLogger = new TrackerLogger();

interface DeviceMetrics {
    rttHistory: number[];
    recentRtts: number[];
    state: string;
    lastRtt: number;
    lastUpdate: number;
}

export class WhatsAppTracker {
    private sock: WASocket;
    private targetJid: string;
    private trackedJids: Set<string> = new Set();
    private isTracking: boolean = false;
    private deviceMetrics: Map<string, DeviceMetrics> = new Map();
    private globalRttHistory: number[] = [];
    private probeStartTimes: Map<string, number> = new Map();
    private probeTimeouts: Map<string, NodeJS.Timeout> = new Map();
    private lastPresence: string | null = null;
    private probeMethod: ProbeMethod = 'delete';
    public onUpdate?: (data: any) => void;

    // Dinleyicileri temizleyebilmek için referanslar
    private messagesUpdateHandler?: (updates: any) => void;
    private rawReceiptHandler?: (node: any) => void;
    private presenceUpdateHandler?: (update: any) => void;

    constructor(sock: WASocket, targetJid: string, debugMode: boolean = false) {
        this.sock = sock;
        this.targetJid = targetJid;
        this.trackedJids.add(targetJid);
        trackerLogger.setDebugMode(debugMode);
    }

    public setProbeMethod(method: ProbeMethod) {
        this.probeMethod = method;
        trackerLogger.info(`\n🔄 Probe method changed to: ${method === 'delete' ? 'Silent Delete' : 'Reaction'}\n`);
    }

    public getProbeMethod(): ProbeMethod {
        return this.probeMethod;
    }

    public async startTracking() {
        if (this.isTracking) return;
        this.isTracking = true;
        trackerLogger.info(`\n✅ Tracking started for ${this.targetJid}`);

        // 1. Message update listener
        this.messagesUpdateHandler = (updates: any) => {
            if (!this.isTracking) return;
            for (const update of updates) {
                if (update.key.remoteJid && this.trackedJids.has(update.key.remoteJid) && update.key.fromMe) {
                    this.analyzeUpdate(update);
                }
            }
        };
        this.sock.ev.on('messages.update', this.messagesUpdateHandler);

        // 2. Raw receipt listener
        this.rawReceiptHandler = (node: any) => {
            if (!this.isTracking) return;
            this.handleRawReceipt(node);
        };
        this.sock.ws.on('CB:receipt', this.rawReceiptHandler);

        // 3. Presence update listener
        this.presenceUpdateHandler = (update: any) => {
            if (!this.isTracking) return;
            if (update.presences) {
                for (const [jid, presenceData] of Object.entries(update.presences)) {
                    if (presenceData && (presenceData as any).lastKnownPresence) {
                        this.trackedJids.add(jid);
                        this.lastPresence = (presenceData as any).lastKnownPresence;
                        break;
                    }
                }
            }
        };
        this.sock.ev.on('presence.update', this.presenceUpdateHandler);

        try {
            await this.sock.presenceSubscribe(this.targetJid);
        } catch (err) {
            trackerLogger.debug('[PRESENCE] Error subscribing to presence:', err);
        }

        if (this.onUpdate) {
            this.onUpdate({
                devices: [],
                deviceCount: this.trackedJids.size,
                presence: this.lastPresence,
                median: 0,
                threshold: 0
            });
        }

        this.probeLoop();
    }

    private async probeLoop() {
        while (this.isTracking) {
            try {
                await this.sendProbe();
            } catch (err) {
                logger.error(err, 'Error sending probe');
            }
            const delay = Math.floor(Math.random() * 100) + 2000;
            
            // Bekleme esnasında stopTracking çağrılırsa anında döngüden çık
            await new Promise(resolve => {
                const timer = setTimeout(resolve, delay);
                if (!this.isTracking) {
                    clearTimeout(timer);
                    resolve(null);
                }
            });
        }
    }

    private async sendProbe() {
        if (!this.isTracking) return;
        if (this.probeMethod === 'delete') {
            await this.sendDeleteProbe();
        } else {
            await this.sendReactionProbe();
        }
    }

    private async sendDeleteProbe() {
        try {
            const prefixes = ['3EB0', 'BAE5', 'F1D2', 'A9C4', '7E8B', 'C3F9', '2D6A'];
            const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
            const randomSuffix = Math.random().toString(36).substring(2, 10).toUpperCase();
            const randomMsgId = randomPrefix + randomSuffix;

            const randomDeleteMessage = {
                delete: {
                    remoteJid: this.targetJid,
                    fromMe: true,
                    id: randomMsgId,
                }
            };

            const startTime = Date.now();
            const result = await this.sock.sendMessage(this.targetJid, randomDeleteMessage);

            if (result?.key?.id) {
                this.probeStartTimes.set(result.key.id, startTime);

                const timeoutId = setTimeout(() => {
                    if (this.probeStartTimes.has(result.key.id!)) {
                        const elapsedTime = Date.now() - startTime;
                        this.probeStartTimes.delete(result.key.id!);
                        this.probeTimeouts.delete(result.key.id!);

                        if (result.key.remoteJid) {
                            this.markDeviceOffline(result.key.remoteJid, elapsedTime);
                        }
                    }
                }, 10000);

                this.probeTimeouts.set(result.key.id, timeoutId);
            }
        } catch (err) {
            logger.error(err, '[PROBE-DELETE ERROR] Failed to send delete probe message');
        }
    }

    private async sendReactionProbe() {
        try {
            const prefixes = ['3EB0', 'BAE5', 'F1D2', 'A9C4', '7E8B', 'C3F9', '2D6A'];
            const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
            const randomSuffix = Math.random().toString(36).substring(2, 10).toUpperCase();
            const randomMsgId = randomPrefix + randomSuffix;

            const reactions = ['👍', '❤️', '😂', '😮', '😢', '🙏', '👻', '🔥', '✨', ''];
            const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];

            const reactionMessage = {
                react: {
                    text: randomReaction,
                    key: {
                        remoteJid: this.targetJid,
                        fromMe: false,
                        id: randomMsgId
                    }
                }
            };

            const result = await this.sock.sendMessage(this.targetJid, reactionMessage);
            const startTime = Date.now();

            if (result?.key?.id) {
                this.probeStartTimes.set(result.key.id, startTime);

                const timeoutId = setTimeout(() => {
                    if (this.probeStartTimes.has(result.key.id!)) {
                        const elapsedTime = Date.now() - startTime;
                        this.probeStartTimes.delete(result.key.id!);
                        this.probeTimeouts.delete(result.key.id!);

                        if (result.key.remoteJid) {
                            this.markDeviceOffline(result.key.remoteJid, elapsedTime);
                        }
                    }
                }, 10000);

                this.probeTimeouts.set(result.key.id, timeoutId);
            }
        } catch (err) {
            logger.error(err, '[PROBE-REACTION ERROR] Failed to send probe message');
        }
    }

    private handleRawReceipt(node: any) {
        try {
            const { attrs } = node;
            if (attrs.type === 'inactive') {
                const msgId = attrs.id;
                const fromJid = attrs.from;

                if (!fromJid) return;

                const baseNumber = fromJid.split('@')[0].split(':')[0];
                const isTracked = this.trackedJids.has(fromJid) ||
                                  this.trackedJids.has(`${baseNumber}@s.whatsapp.net`);

                if (isTracked) {
                    this.processAck(msgId, fromJid, 'inactive');
                }
            }
        } catch (err) {
            trackerLogger.debug(`[RAW RECEIPT] Error handling receipt: ${err}`);
        }
    }

    private processAck(msgId: string, fromJid: string, type: string) {
        if (!msgId || !fromJid) return;

        const startTime = this.probeStartTimes.get(msgId);

        if (startTime) {
            const rtt = Date.now() - startTime;

            const timeoutId = this.probeTimeouts.get(msgId);
            if (timeoutId) {
                clearTimeout(timeoutId);
                this.probeTimeouts.delete(msgId);
            }

            this.probeStartTimes.delete(msgId);
            this.addMeasurementForDevice(fromJid, rtt);
        }
    }

    private analyzeUpdate(update: { key: proto.IMessageKey, update: Partial<proto.IWebMessageInfo> }) {
        const status = update.update.status;
        const msgId = update.key.id;
        const fromJid = update.key.remoteJid;

        if (!msgId || !fromJid) return;

        if (status === 3) { // CLIENT ACK
            this.processAck(msgId, fromJid, 'client_ack');
        }
    }

    private markDeviceOffline(jid: string, timeout: number) {
        if (!this.deviceMetrics.has(jid)) {
            this.deviceMetrics.set(jid, {
                rttHistory: [],
                recentRtts: [],
                state: 'OFFLINE',
                lastRtt: timeout,
                lastUpdate: Date.now()
            });
        } else {
            const metrics = this.deviceMetrics.get(jid)!;
            metrics.state = 'OFFLINE';
            metrics.lastRtt = timeout;
            metrics.lastUpdate = Date.now();
        }

        trackerLogger.info(`\n🔴 Device ${jid} marked as OFFLINE\n`);
        this.sendUpdate();
    }

    private addMeasurementForDevice(jid: string, rtt: number) {
        if (!this.deviceMetrics.has(jid)) {
            this.deviceMetrics.set(jid, {
                rttHistory: [],
                recentRtts: [],
                state: 'Calibrating...',
                lastRtt: rtt,
                lastUpdate: Date.now()
            });
        }

        const metrics = this.deviceMetrics.get(jid)!;

        if (rtt <= 5000) {
            metrics.recentRtts.push(rtt);
            if (metrics.recentRtts.length > 3) metrics.recentRtts.shift();

            metrics.rttHistory.push(rtt);
            if (metrics.rttHistory.length > 2000) metrics.rttHistory.shift();

            this.globalRttHistory.push(rtt);
            if (this.globalRttHistory.length > 2000) this.globalRttHistory.shift();

            metrics.lastRtt = rtt;
            metrics.lastUpdate = Date.now();

            this.determineDeviceState(jid);
        }

        this.sendUpdate();
    }

    private determineDeviceState(jid: string) {
        const metrics = this.deviceMetrics.get(jid);
        if (!metrics) return;

        if (metrics.state === 'OFFLINE') {
            if (!(metrics.lastRtt <= 5000 && metrics.recentRtts.length > 0)) {
                return;
            }
        }

        const movingAvg = metrics.recentRtts.reduce((a: number, b: number) => a + b, 0) / metrics.recentRtts.length;
        let median = 0;
        let threshold = 0;

        if (this.globalRttHistory.length >= 3) {
            const sorted = [...this.globalRttHistory].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
            threshold = median * 0.9;

            if (movingAvg < threshold) {
                metrics.state = 'Online';
            } else {
                metrics.state = 'Standby';
            }
        } else {
            metrics.state = 'Calibrating...';
        }

        trackerLogger.formatDeviceState(jid, metrics.lastRtt, movingAvg, median, threshold, metrics.state);
    }

    private sendUpdate() {
        const devices = Array.from(this.deviceMetrics.entries()).map(([jid, metrics]) => ({
            jid,
            state: metrics.state,
            rtt: metrics.lastRtt,
            avg: metrics.recentRtts.length > 0
                ? metrics.recentRtts.reduce((a: number, b: number) => a + b, 0) / metrics.recentRtts.length
                : 0
        }));

        const globalMedian = this.calculateGlobalMedian();
        const globalThreshold = globalMedian * 0.9;

        const data = {
            devices,
            deviceCount: this.trackedJids.size,
            presence: this.lastPresence,
            median: globalMedian,
            threshold: globalThreshold
        };

        if (this.onUpdate) {
            this.onUpdate(data);
        }
    }

    private calculateGlobalMedian(): number {
        if (this.globalRttHistory.length < 3) return 0;
        const sorted = [...this.globalRttHistory].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    public async getProfilePicture() {
        try {
            return await this.sock.profilePictureUrl(this.targetJid, 'image');
        } catch {
            return null;
        }
    }

    /**
     * Stop tracking and clean up ALL listeners and resources
     */
    public stopTracking() {
        this.isTracking = false;

        // 1. Dinleyicileri soketten sök (Memory leak ve kilitlenmeyi önler)
        if (this.messagesUpdateHandler) {
            this.sock.ev.off('messages.update', this.messagesUpdateHandler);
        }
        if (this.rawReceiptHandler) {
            this.sock.ws.off('CB:receipt', this.rawReceiptHandler);
        }
        if (this.presenceUpdateHandler) {
            this.sock.ev.off('presence.update', this.presenceUpdateHandler);
        }

        // 2. Bekleyen zamanlayıcıları temizle
        for (const timeoutId of this.probeTimeouts.values()) {
            clearTimeout(timeoutId);
        }
        this.probeTimeouts.clear();
        this.probeStartTimes.clear();
        this.deviceMetrics.clear();
        this.globalRttHistory = [];

        logger.info(`Tracking stopped and listeners cleaned for ${this.targetJid}`);
    }
}
