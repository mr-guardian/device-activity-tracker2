<h1 align="center">Device Activity Tracker</h1>
<p align="center">WhatsApp & Signal Activity Tracker via RTT Analysis</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-339933?style=flat&logo=node.js&logoColor=white" alt="Node.js"/>
  <img src="https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/React-18+-61DAFB?style=flat&logo=react&logoColor=black" alt="React"/>
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License MIT"/>
</p>

> ⚠️ **DISCLAIMER**: Proof-of-concept for educational and security research purposes only. Demonstrates privacy vulnerabilities in WhatsApp and Signal.

## Overview

This project implements the research from the paper **"Careless Whisper: Exploiting Silent Delivery Receipts to Monitor Users on Mobile Instant Messengers"** by Gabriel K. Gegenhuber, Maximilian Günther, Markus Maier, Aljosha Judmayer, Florian Holzbauer, Philipp É. Frenzel, and Johanna Ullrich (University of Vienna & SBA Research).

**What it does:** By measuring Round-Trip Time (RTT) of message delivery receipts, this tool can detect:
- When a user is actively using their device (low RTT)
- When the device is in standby/idle mode (higher RTT)
- Potential location changes (mobile data vs. WiFi)
- Activity patterns over time

**Supported Services:**
- **WhatsApp**: Full support (CLI, Web, Docker)
- **Signal**: Experimental support (Web interface only, requires Signal API)

**Security implications:** This demonstrates a significant privacy vulnerability in messaging apps that can be exploited for surveillance.

## Example

![WhatsApp Activity Tracker Interface](example.png)

The web interface shows real-time RTT measurements, device state detection, and activity patterns.

## Installation

```bash
# Clone repository
git clone https://github.com/guberm/device-activity-tracker.git
cd device-activity-tracker

# Install dependencies
npm install
cd client && npm install && cd ..
```

**Requirements:** Node.js 20+, npm, WhatsApp account

## Usage

### Docker (Recommended)

The easiest way to run the application is using Docker:

```bash
# Copy environment template
cp .env.example .env

# (Optional) Customize ports in .env file
# BACKEND_PORT=3001
# CLIENT_PORT=3000

# Build and start containers
docker compose up --build
```

The application will be available at:
- Frontend: [http://localhost:3000](http://localhost:3000) (or your configured `CLIENT_PORT`)
- Backend: [http://localhost:3001](http://localhost:3001) (or your configured `BACKEND_PORT`)

To stop the containers:
```bash
docker compose down
```

### Manual Setup

#### Environment Configuration (Optional)

Create a `.env` file to customize ports and API settings (defaults provided):

```bash
cp .env.example .env
# Edit .env to customize BACKEND_PORT, CLIENT_PORT, SIGNAL_API_URL, etc.
```

#### Web Interface

```bash
# Terminal 1: Start backend (includes Signal API initialization)
npm run dev

# Terminal 2 (in separate terminal): Start frontend
npm run start:client
```

Open `http://localhost:3000` (or your configured `CLIENT_PORT`), scan QR code with WhatsApp, then select the contact or enter phone number to track.

### CLI Interface (WhatsApp)

```bash
npm start
```

Or run with command line parameters:

```bash
npx tsx src/index.ts --phone +1XXXXXXXXXX --service whatsapp
```

**CLI Options:**
- `--phone <number>`: Phone number to track (includes country code, e.g., `+1234567890`)
- `--service <service>`: Service to use (currently only `whatsapp` is supported)
- `--debug` or `-d`: Enable detailed debug output

Without parameters, you'll be prompted to enter the phone number interactively after WhatsApp authentication.

**Example Output:**

```
╔════════════════════════════════════════════════════════════════╗
║ 🟡 Device Status Update - 09:41:51                             ║
╠════════════════════════════════════════════════════════════════╣
║ JID:        ***********@lid                                    ║
║ Status:     Standby                                            ║
║ RTT:        1104ms                                             ║
║ Avg (3):    1161ms                                             ║
║ Median:     1195ms                                             ║
║ Threshold:  1075ms                                             ║
╚════════════════════════════════════════════════════════════════╝
```

- **🟢 Online**: Device is actively being used (RTT below threshold)
- **🟡 Standby**: Device is idle/locked (RTT above threshold)
- **🔴 Offline**: Device is offline or unreachable (no CLIENT ACK received)

## How It Works

The tracker sends probe messages and measures the Round-Trip Time (RTT) to detect device activity. Two probe methods are available:

### Probe Methods

| Method | Description                                                                                                     |
|--------|-----------------------------------------------------------------------------------------------------------------|
| **Delete** (Default) | Sends a "delete" request for a non-existent message ID.                                                         |
| **Reaction** | Sends a reaction emoji to a non-existent message ID. |

### Detection Logic

The time between sending the probe message and receiving the CLIENT ACK (Status 3) is measured as RTT. Device state is detected using a dynamic threshold calculated as 90% of the median RTT: values below the threshold indicate active usage, values above indicate standby mode. Measurements are stored in a history and the median is continuously updated to adapt to different network conditions.

### Switching Probe Methods

In the web interface, you can switch between probe methods using the dropdown in the control panel. In CLI mode, the delete method is used by default.

## Common Issues

- **Not Connecting to WhatsApp**: Delete the `auth_info_baileys/` folder and re-scan the QR code.
- **Signal API Not Starting**: Ensure Docker is running if using the `signal-api` service from docker-compose. For manual setup, you need to have signal-cli-rest-api running on port 8080.
- **Port Already in Use**: Change ports in `.env` file (or pass environment variables: `BACKEND_PORT=3002 npm run dev`).
- **Module Not Found Errors**: Run `npm install` to ensure all dependencies are installed.

## Project Structure

```
device-activity-tracker/
├── src/
│   ├── index.ts           # CLI interface (WhatsApp)
│   ├── tracker.ts         # WhatsApp RTT analysis logic
│   ├── signal-tracker.ts  # Signal RTT analysis logic
│   ├── server.ts          # Backend API server (WebSocket + REST)
│   └── scripts/
│       └── init-signal.ts # Signal API initialization script
├── client/                # React web interface (Tailwind CSS)
│   ├── src/
│   │   ├── components/    # React components (Login, Dashboard, ContactCard)
│   │   ├── App.tsx        # Main app component
│   │   └── index.tsx      # Entry point
│   └── public/            # Static assets
├── Dockerfile             # Backend container
├── docker-compose.yml     # Multi-container orchestration
├── .env.example           # Environment configuration template
├── package.json           # Dependencies & scripts
└── README.md             # This file
```

## How to Protect Yourself

The most effective mitigation is to enable “Block unknown account messages” in WhatsApp under
Settings → Privacy → Advanced.

This setting may reduce an attacker’s ability to spam probe reactions from unknown numbers, because WhatsApp blocks high-volume messages from unknown accounts.
However, WhatsApp does not disclose what “high volume” means, so this does not fully prevent an attacker from sending a significant number of probe reactions before rate-limiting kicks in.

Disabling read receipts helps with regular messages but does not protect against this specific attack. As of December 2025, this vulnerability remains exploitable in WhatsApp and Signal.

## Ethical & Legal Considerations

⚠️ For research and educational purposes only. Never track people without explicit consent - this may violate privacy laws. Authentication data (`auth_info_baileys/`) is stored locally and must never be committed to version control.

## Citation

Based on research by Gegenhuber et al., University of Vienna & SBA Research:

```bibtex
@inproceedings{gegenhuber2024careless,
  title={Careless Whisper: Exploiting Silent Delivery Receipts to Monitor Users on Mobile Instant Messengers},
  author={Gegenhuber, Gabriel K. and G{\"u}nther, Maximilian and Maier, Markus and Judmayer, Aljosha and Holzbauer, Florian and Frenzel, Philipp {\'E}. and Ullrich, Johanna},
  year={2024},
  organization={University of Vienna, SBA Research}
}
```

## License

MIT License - See LICENSE file.

Built with [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys)

---

**Use responsibly. This tool demonstrates real security vulnerabilities that affect millions of users.**


## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=gommzystudio/device-activity-tracker&type=date&legend=top-left)](https://www.star-history.com/#gommzystudio/device-activity-tracker&type=date&legend=top-left)
