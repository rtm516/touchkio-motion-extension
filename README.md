# TouchKio Motion Extension

A [TouchKio](https://github.com/leukipp/touchkio) extension that adds a **Motion** binary sensor to Home Assistant via MQTT. Motion detection comes from the [motion](https://motion-project.github.io) daemon, which runs fine on its default config.

## Requirements
- A TouchKio version with extension support and MQTT configured
- A camera, plus `motion` installed and running:
  ```bash
  sudo apt install motion && sudo systemctl enable --now motion.service
  ```

## Installation
```bash
mkdir -p ~/.config/touchkio/extensions
curl -fsSL -o ~/.config/touchkio/extensions/motion.js https://raw.githubusercontent.com/rtm516/touchkio-motion-extension/master/motion.js
systemctl --user restart touchkio.service
```

The **Motion** entity appears under the TouchKio device in Home Assistant.

## How it works
The extension reads events from `log_file` in `/etc/motion/motion.conf` if it is set. If the file isn't readable it uses `sudo tail` instead. With no `log_file`, it reads from `journalctl -u motion.service`. Detection sensitivity and how quickly the sensor resets are set in `motion.conf` (e.g. `threshold`, `event_gap`).

To disable it, use `--app-disable=ext_motion` or delete `motion.js`.
