import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Square, Activity, Wifi, Smartphone, Monitor, MessageCircle, Zap, Clock, Navigation } from 'lucide-react';
import clsx from 'clsx';

type Platform = 'whatsapp' | 'signal';

export interface TrackerData {
    rtt: number;
    avg: number;
    median: number;
    threshold: number;
    state: string;
    timestamp: number;
}

interface DeviceInfo {
    jid: string;
    state: string;
    rtt: number;
    avg: number;
}

interface ContactCardProps {
    jid: string;
    displayNumber: string;
    data: TrackerData[];
    devices: DeviceInfo[];
    deviceCount: number;
    presence: string | null;
    profilePic: string | null;
    onRemove: () => void;
    privacyMode?: boolean;
    platform?: Platform;
}

export function ContactCard({
    jid,
    displayNumber,
    data = [],
    devices = [],
    deviceCount = 0,
    presence,
    profilePic,
    onRemove,
    privacyMode = false,
    platform = 'whatsapp'
}: ContactCardProps) {
    const lastData = data.length > 0 ? data[data.length - 1] : null;
    const currentStatus = devices.length > 0
        ? (devices.find(d => d.state === 'OFFLINE')?.state ||
            devices.find(d => d.state.includes('Online'))?.state ||
            devices[0].state)
        : 'Unknown';

    const avgRtt = lastData?.avg || 0;
    const threshold = lastData?.threshold || 0;
    const hasCalibrated = threshold > 0 && avgRtt > 0;
    const delta = avgRtt - threshold;
    const isUnderThreshold = delta < 0;
    const absDelta = Math.abs(Math.round(delta));

    const blurredNumber = privacyMode ? displayNumber.replace(/\d/g, '•') : displayNumber;

    // --- Geofence Analizi (Hafifletilmiş) ---
    const motionAnalysis = useMemo(() => {
        if (!data || data.length < 5) {
            return {
                motionState: 'Kalibre Ediliyor...',
                jitter: 0,
                color: 'text-gray-500 bg-gray-50 border-gray-200',
                indicator: '⚪'
            };
        }

        const recent = data.slice(-8);
        const rttValues = recent.map(d => d.rtt || 0);
        const mean = rttValues.reduce((a, b) => a + b, 0) / rttValues.length;
        const variance = rttValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / rttValues.length;
        const jitter = Math.round(Math.sqrt(variance));

        if (jitter > 350) {
            return {
                motionState: 'Hareket Halinde / Seyahatte',
                jitter,
                color: 'text-rose-700 bg-rose-50 border-rose-200',
                indicator: '🚗'
            };
        } else if (jitter > 180) {
            return {
                motionState: 'Dalgalı Ağ / Hücresel (4.5G)',
                jitter,
                color: 'text-amber-700 bg-amber-50 border-amber-200',
                indicator: '📶'
            };
        } else {
            return {
                motionState: 'Sabit Nokta / Wi-Fi',
                jitter,
                color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
                indicator: '📍'
            };
        }
    }, [data.length]); // Sadece veri boyutu değiştiğinde hesapla

    // --- 24 Saatlik Zaman Çizelgesi (Optimize Flex Blokları) ---
    const timelineBlocks = useMemo(() => {
        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;
        const blockCount = 48; // 30 dakikalık dilimler
        const blockSizeMs = oneDayMs / blockCount;
        const startTime = now - oneDayMs;

        const blocks = [];
        for (let i = 0; i < blockCount; i++) {
            const bStart = startTime + i * blockSizeMs;
            const bEnd = bStart + blockSizeMs;
            const bDate = new Date(bStart);
            const timeLabel = `${bDate.getHours().toString().padStart(2, '0')}:${bDate.getMinutes().toString().padStart(2, '0')}`;

            let hasOnline = false;
            let hasAny = false;

            for (let j = 0; j < data.length; j++) {
                const ts = data[j].timestamp;
                if (ts >= bStart && ts < bEnd) {
                    hasAny = true;
                    if (data[j].state === 'Online' || (data[j].threshold > 0 && data[j].avg < data[j].threshold)) {
                        hasOnline = true;
                        break;
                    }
                }
            }

            const status = !hasAny ? 'empty' : hasOnline ? 'online' : 'standby';
            blocks.push({ label: timeLabel, status });
        }
        return blocks;
    }, [data.length]);

    return (
        <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-lg border border-gray-200 overflow-hidden mb-6">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className={clsx(
                        "px-2 py-1 rounded text-xs font-medium flex items-center gap-1",
                        platform === 'whatsapp' ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                    )}>
                        <MessageCircle size={12} />
                        {platform === 'whatsapp' ? 'WhatsApp' : 'Signal'}
                    </span>
                    <h3 className="text-lg font-semibold text-gray-900">{blurredNumber}</h3>
                </div>
                <button
                    onClick={onRemove}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2 font-medium transition-colors text-sm"
                >
                    <Square size={16} /> Stop
                </button>
            </div>

            <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Status Sol Kolon */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col items-center text-center">
                        <div className="relative mb-4">
                            <div className="w-32 h-32 rounded-full overflow-hidden bg-gray-100 border-4 border-white shadow-md">
                                {profilePic ? (
                                    <img
                                        src={profilePic}
                                        alt="Profile"
                                        className={clsx(
                                            "w-full h-full object-cover transition-all duration-200",
                                            privacyMode && "blur-xl scale-110"
                                        )}
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                                        No Image
                                    </div>
                                )}
                            </div>
                            <div className={clsx(
                                "absolute bottom-2 right-2 w-6 h-6 rounded-full border-2 border-white",
                                currentStatus === 'OFFLINE' ? "bg-red-500" :
                                    currentStatus.includes('Online') ? "bg-green-500" : "bg-gray-400"
                            )} />
                        </div>

                        <h4 className="text-xl font-bold text-gray-900 mb-1">{blurredNumber}</h4>

                        <div className="flex items-center gap-2 mb-3">
                            <span className={clsx(
                                "px-3 py-1 rounded-full text-sm font-medium",
                                currentStatus === 'OFFLINE' ? "bg-red-100 text-red-700" :
                                    currentStatus.includes('Online') ? "bg-green-100 text-green-700" :
                                        currentStatus === 'Standby' ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-700"
                            )}>
                                {currentStatus}
                            </span>
                        </div>

                        {/* Hareket / Jitter Rozeti */}
                        <div className={clsx(
                            "w-full py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-between mb-4",
                            motionAnalysis.color
                        )}>
                            <span className="flex items-center gap-1.5">
                                <Navigation size={13} />
                                {motionAnalysis.indicator} {motionAnalysis.motionState}
                            </span>
                            <span className="text-[10px] opacity-80">±{motionAnalysis.jitter}ms</span>
                        </div>

                        <div className="w-full pt-4 border-t border-gray-100 space-y-2">
                            <div className="flex justify-between items-center text-sm text-gray-600">
                                <span className="flex items-center gap-1"><Wifi size={16} /> Official Status</span>
                                <span className="font-medium">{presence || 'Unknown'}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm text-gray-600">
                                <span className="flex items-center gap-1"><Smartphone size={16} /> Devices</span>
                                <span className="font-medium">{deviceCount || 0}</span>
                            </div>
                        </div>

                        {devices.length > 0 && (
                            <div className="w-full pt-4 border-t border-gray-100 mt-4">
                                <h5 className="text-xs font-semibold text-gray-500 uppercase mb-2">Device States</h5>
                                <div className="space-y-1">
                                    {devices.map((device, idx) => (
                                        <div key={device.jid} className="flex items-center justify-between text-sm py-1">
                                            <div className="flex items-center gap-2">
                                                <Monitor size={14} className="text-gray-400" />
                                                <span className="text-gray-600">Device {idx + 1}</span>
                                            </div>
                                            <span className={clsx(
                                                "px-2 py-0.5 rounded text-xs font-medium",
                                                device.state === 'OFFLINE' ? "bg-red-100 text-red-700" :
                                                    device.state.includes('Online') ? "bg-green-100 text-green-700" :
                                                        device.state === 'Standby' ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-700"
                                            )}>
                                                {device.state}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Sağ Taraf: Metrikler, 24h Çizelge ve Grafik */}
                    <div className="md:col-span-2 space-y-5">
                        {/* 4'lü Metrik Kartları */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="bg-white p-3.5 rounded-xl shadow-sm border border-gray-200">
                                <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                                    <Activity size={13} /> Avg RTT
                                </div>
                                <div className="text-lg font-bold text-gray-900">
                                    {lastData?.avg ? lastData.avg.toFixed(0) : '-'} <span className="text-xs font-normal">ms</span>
                                </div>
                            </div>

                            <div className="bg-white p-3.5 rounded-xl shadow-sm border border-gray-200">
                                <div className="text-xs text-gray-500 mb-1">Median (50)</div>
                                <div className="text-lg font-bold text-gray-900">
                                    {lastData?.median ? lastData.median.toFixed(0) : '-'} <span className="text-xs font-normal">ms</span>
                                </div>
                            </div>

                            <div className="bg-white p-3.5 rounded-xl shadow-sm border border-gray-200">
                                <div className="text-xs text-gray-500 mb-1">Threshold</div>
                                <div className="text-lg font-bold text-blue-600">
                                    {lastData?.threshold ? lastData.threshold.toFixed(0) : '-'} <span className="text-xs font-normal">ms</span>
                                </div>
                            </div>

                            <div className={clsx(
                                "p-3.5 rounded-xl shadow-sm border transition-all",
                                !hasCalibrated
                                    ? "bg-white border-gray-200 text-gray-400"
                                    : isUnderThreshold
                                        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                        : "bg-amber-50 border-amber-200 text-amber-800"
                            )}>
                                <div className="text-xs font-medium mb-1 flex items-center gap-1">
                                    <Zap size={13} className={clsx(
                                        !hasCalibrated ? "text-gray-400" : isUnderThreshold ? "text-emerald-600" : "text-amber-600"
                                    )} />
                                    Fark (Δ RTT)
                                </div>
                                <div className="text-lg font-bold">
                                    {!hasCalibrated ? (
                                        '-'
                                    ) : (
                                        <>
                                            {isUnderThreshold ? `-${absDelta}` : `+${absDelta}`}{' '}
                                            <span className="text-xs font-normal">ms</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 24 Saatlik Çizelge (Çökmeyen Flex Yapısı) */}
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                            <div className="flex justify-between items-center mb-2.5">
                                <h5 className="text-xs font-semibold text-gray-700 uppercase flex items-center gap-1">
                                    <Clock size={13} className="text-blue-600" /> 24 Saatlik Çizelge
                                </h5>
                                <div className="flex items-center gap-2.5 text-[10px] text-gray-500">
                                    <span className="flex items-center gap-1">
                                        <span className="w-2 h-2 bg-emerald-500 rounded-xs inline-block"></span> Aktif
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <span className="w-2 h-2 bg-amber-400 rounded-xs inline-block"></span> Standby
                                    </span>
                                </div>
                            </div>

                            {/* Ekrana göre esneyen 48 blok */}
                            <div className="flex gap-[2px] bg-gray-50 p-1.5 rounded-lg border border-gray-100 overflow-hidden">
                                {timelineBlocks.map((block, idx) => (
                                    <div
                                        key={idx}
                                        title={`${block.label} - ${block.status.toUpperCase()}`}
                                        className={clsx(
                                            "flex-1 h-6 rounded-[2px] transition-colors",
                                            block.status === 'online' && "bg-emerald-500",
                                            block.status === 'standby' && "bg-amber-400",
                                            block.status === 'empty' && "bg-gray-200"
                                        )}
                                    />
                                ))}
                            </div>
                            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                                <span>24 Saat Önce</span>
                                <span>12 Saat Önce</span>
                                <span>Şimdi</span>
                            </div>
                        </div>

                        {/* Recharts Grafiği */}
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 h-[260px]">
                            <h5 className="text-xs font-medium text-gray-500 mb-3">RTT Geçmişi & Eşik</h5>
                            <ResponsiveContainer width="100%" height="88%">
                                <LineChart data={data.slice(-50)}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                    <XAxis dataKey="timestamp" hide />
                                    <YAxis domain={['auto', 'auto']} width={35} />
                                    <Tooltip
                                        labelFormatter={(t: any) => new Date(t).toLocaleTimeString()}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Line type="monotone" dataKey="avg" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
                                    <Line type="step" dataKey="threshold" stroke="#ef4444" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
