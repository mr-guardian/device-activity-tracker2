import React, { useState, useEffect } from 'react';
import { socket, ConnectionState, Platform } from '../App';
import { ContactCard, TrackerData } from './ContactCard';
import { UserPlus, Shield, ShieldOff, Trash2 } from 'lucide-react';

interface ContactInfo {
    id: string;
    platform: Platform;
    name?: string;
    profilePic?: string | null;
    presence?: string | null;
    devices?: any[];
    deviceCount?: number;
}

export function Dashboard({ connectionState }: { connectionState: ConnectionState }) {
    const [targetNumber, setTargetNumber] = useState('');
    const [selectedPlatform, setSelectedPlatform] = useState<Platform>('whatsapp');
    const [contacts, setContacts] = useState>(new Map());
    
    // LocalStorage'dan geçmişi yükle
    const [historyData, setHistoryData] = useState>(() => {
        try {
            const saved = localStorage.getItem('tracker_history_data');
            if (saved) {
                const parsed = JSON.parse(saved);
                return new Map(Object.entries(parsed));
            }
        } catch (e) {
            console.error('LocalStorage okunamadı:', e);
        }
        return new Map();
    });

    const [privacyMode, setPrivacyMode] = useState(false);

    // Veri değiştikçe localStorage'a yaz
    useEffect(() => {
        try {
            const obj: Record<string, TrackerData[]> = {};
            historyData.forEach((val, key) => {
                obj[key] = val.slice(-2000);
            });
            localStorage.setItem('tracker_history_data', JSON.stringify(obj));
        } catch (e) {
            console.error('LocalStorage yazılamadı:', e);
        }
    }, [historyData]);

    useEffect(() => {
        socket.emit('get-tracked-contacts');

        const onTrackedContacts = (list: { id: string; platform: Platform }[]) => {
            setContacts(prev => {
                const next = new Map(prev);
                list.forEach(c => {
                    if (!next.has(c.id)) {
                        next.set(c.id, { id: c.id, platform: c.platform, devices: [] });
                    }
                });
                return next;
            });
        };

        const onContactAdded = (data: { jid: string; number: string; platform: Platform }) => {
            setContacts(prev => {
                const next = new Map(prev);
                next.set(data.jid, { id: data.jid, platform: data.platform, name: data.number, devices: [] });
                return next;
            });
        };

        const onContactRemoved = (jid: string) => {
            setContacts(prev => {
                const next = new Map(prev);
                next.delete(jid);
                return next;
            });
        };

        const onTrackerUpdate = (update: any) => {
            const jid = update.jid;
            const now = Date.now();

            setContacts(prev => {
                const contact = prev.get(jid);
                if (!contact) return prev;
                const next = new Map(prev);
                next.set(jid, {
                    ...contact,
                    devices: update.devices || [],
                    deviceCount: update.deviceCount || 0,
                    presence: update.presence
                });
                return next;
            });

            if (update.devices && update.devices.length > 0) {
                const primaryDevice = update.devices[0];
                const newPoint: TrackerData = {
                    rtt: primaryDevice.rtt,
                    avg: primaryDevice.avg,
                    median: update.median,
                    threshold: update.threshold,
                    state: primaryDevice.state,
                    timestamp: now
                };

                setHistoryData(prev => {
                    const next = new Map(prev);
                    const currentList = next.get(jid) || [];
                    next.set(jid, [...currentList.slice(-2000), newPoint]);
                    return next;
                });
            }
        };

        const onProfilePic = (data: { jid: string; url: string | null }) => {
            setContacts(prev => {
                const contact = prev.get(data.jid);
                if (!contact) return prev;
                const next = new Map(prev);
                next.set(data.jid, { ...contact, profilePic: data.url });
                return next;
            });
        };

        socket.on('tracked-contacts', onTrackedContacts);
        socket.on('contact-added', onContactAdded);
        socket.on('contact-removed', onContactRemoved);
        socket.on('tracker-update', onTrackerUpdate);
        socket.on('profile-pic', onProfilePic);

        return () => {
            socket.off('tracked-contacts', onTrackedContacts);
            socket.off('contact-added', onContactAdded);
            socket.off('contact-removed', onContactRemoved);
            socket.off('tracker-update', onTrackerUpdate);
            socket.off('profile-pic', onProfilePic);
        };
    }, []);

    const handleAddContact = (e: React.FormEvent) => {
        e.preventDefault();
        if (!targetNumber.trim()) return;
        socket.emit('add-contact', { number: targetNumber, platform: selectedPlatform });
        setTargetNumber('');
    };

    const handleRemoveContact = (jid: string) => {
        socket.emit('remove-contact', jid);
    };

    const clearLocalHistory = () => {
        if (window.confirm('Tüm geçmiş grafik ve hareket verilerini temizlemek istiyor musunuz?')) {
            localStorage.removeItem('tracker_history_data');
            setHistoryData(new Map());
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-wrap items-center justify-between gap-4">
                <form onSubmit={handleAddContact} className="flex flex-wrap items-center gap-3">
                    <select
                        value={selectedPlatform}
                        onChange={(e) => setSelectedPlatform(e.target.value as Platform)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                    >
                        <option value="whatsapp">WhatsApp</option>
                        <option value="signal">Signal</option>
                    </select>
                    <input
                        type="text"
                        placeholder="Telefon Numarası (örn. 905xxxxxxxxx)"
                        value={targetNumber}
                        onChange={(e) => setTargetNumber(e.target.value)}
                        className="px-4 py-2 border border-gray-300 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-1.5"
                    >
                        <UserPlus size={16} /> Takip Başlat
                    </button>
                </form>

                <div className="flex items-center gap-2">
                    <button
                        onClick={clearLocalHistory}
                        title="Grafik hafızasını temizle"
                        className="px-3 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 text-xs font-medium flex items-center gap-1.5"
                    >
                        <Trash2 size={14} /> Geçmişi Temizle
                    </button>
                    <button
                        onClick={() => setPrivacyMode(!privacyMode)}
                        className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                            privacyMode ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
                        }`}
                    >
                        {privacyMode ? <Shield size={14} /> : <ShieldOff size={14} />}
                        {privacyMode ? 'Gizlilik Açık' : 'Gizlilik Kapalı'}
                    </button>
                </div>
            </div>

            <div className="space-y-6">
                {Array.from(contacts.values()).map(contact => (
                    <ContactCard
                        key={contact.id}
                        jid={contact.id}
                        displayNumber={contact.name || contact.id.replace(/\D/g, '')}
                        data={historyData.get(contact.id) || []}
                        devices={contact.devices || []}
                        deviceCount={contact.deviceCount || 0}
                        presence={contact.presence || null}
                        profilePic={contact.profilePic || null}
                        onRemove={() => handleRemoveContact(contact.id)}
                        privacyMode={privacyMode}
                        platform={contact.platform}
                    />
                ))}
            </div>
        </div>
    );
}
