# AirShare

![Beta](https://img.shields.io/badge/status-beta-orange?style=for-the-badge&logo=github&logoColor=white)
![Tauri](https://img.shields.io/badge/Tauri-%23FFC131.svg?style=for-the-badge&logo=tauri&logoColor=black)
![Rust](https://img.shields.io/badge/Rust-DEA584.svg?style=for-the-badge&logo=rust&logoColor=black)
![React](https://img.shields.io/badge/React-61DAFB.svg?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6.svg?style=for-the-badge&logo=typescript&logoColor=white)

---

##  What is AirShare?

**AirShare** is an open-source desktop app for **instant file transfer** between devices on the same local network (LAN) — no cloud, no size limits, no quality loss.  
Fast, private, cross-platform, and super easy to use.

---

##  Key Features

- **Ultra-fast file transfer** between PC, Mac, and mobile devices on the same WiFi or Ethernet network
- **No external servers**: your files never leave your local network
- **Modern, intuitive interface** with drag & drop and notifications
- **Automatic device discovery** on your LAN
- **Transfer history** and real-time statistics
- **Multi-language support** (English, Italian, German, French, Spanish, Chinese)
- **Trusted devices management** and auto-accept for known devices
- **End-to-end encryption** (AES-256) for maximum security
- **Cross-platform**: works on Windows, macOS, and Linux

---

##  How does it work?

1. **Start AirShare** on all devices you want to connect (they must be on the same local network).
2. Devices are discovered automatically and appear in the list.
3. **Drag and drop one or more files** into the app, select the destination devices, and click "Send".
4. Files are transferred directly, never passing through the Internet or any external server.
5. You get a **notification** when the transfer is complete, both on the sender and receiver.

---

##  Installation

### Requirements

- Windows 10/11, macOS, or Linux
- Local network (WiFi or Ethernet)
- [Rust toolchain](https://rustup.rs/) (only for manual build)

### Download

- **[Download the latest release](https://github.com/Gecko129/AirShare/releases)** for your OS  
  *(or build from source as below)*

### Manual Build

```bash
git clone https://github.com/Gecko129/AirShare.git
cd AirShare
cargo tauri build
```

The executable will be in `src-tauri/target/release/`.

---

##  Privacy & Security

- **No data ever leaves your LAN**: everything stays local
- **AES-256 encryption** during transfer
- **No tracking, no cloud, no ads**
- **Open source code**: audit everything

---

##  How to use

1. **Open AirShare** on all your devices (PC, Mac, Linux, etc.)
2. **Select files** to send (drag & drop or use the button)
3. **Choose destination devices** from the list
4. **Click "Send"** and watch the progress bar
5. **Get notifications** when the transfer completes

You can also:
- Manage your trusted devices (for auto-accepting files)
- Change language and theme (dark mode coming soon!)
- View transfer history and statistics

---

##  Architecture

- **Backend**: Rust + Tauri (local TCP server, UDP discovery, encryption, file management)
- **Frontend**: React + TypeScript (modern UI, notifications, drag & drop)
- **Communication**: Direct peer-to-peer over LAN, no external servers

