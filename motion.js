/**
 * TouchKio extension that adds a motion sensor fed by the motion daemon (https://motion-project.github.io).
 *
 * Motion events are read from `log_file` in /etc/motion/motion.conf if set (falls back to
 * `sudo tail` when unreadable), otherwise from `journalctl -u motion.service`.
 */
const fs = require("fs");
const cpr = require("child_process");

const CONF = "/etc/motion/motion.conf";

const state = {
  command: null,
  active: false,
  process: null,
};

/**
 * Gets the motion log file path from the motion config.
 *
 * @param {Object} api - The extension api object.
 * @returns {string|null} The log file path or null if logs are written to the journal.
 */
const getLogFile = (api) => {
  if (!api.utils.readRights(CONF)) {
    return null;
  }
  const match = fs.readFileSync(CONF, "utf8").match(/^\s*log_file\s+(\S+)/m);
  return match && fs.existsSync(match[1]) ? match[1] : null;
};

/**
 * Gets the command used to follow motion events.
 *
 * @param {Object} api - The extension api object.
 * @returns {Array|null} The [cmd, args] pair or null if not supported.
 */
const getCommand = (api) => {
  const { commandExists, readRights, sudoRights } = api.utils;
  if (!commandExists("motion")) {
    return null;
  }
  const file = getLogFile(api);
  if (file) {
    if (readRights(file)) {
      return ["tail", ["-F", "-n", "0", file]];
    }
    return sudoRights() ? ["sudo", ["-n", "tail", "-F", "-n", "0", file]] : null;
  }
  return commandExists("journalctl") ? ["journalctl", ["-u", "motion.service", "-f", "-n", "0", "-o", "cat"]] : null;
};

/**
 * Publishes the motion state if MQTT is connected.
 *
 * @param {Object} api - The extension api object.
 * @returns {void}
 */
const publish = (api) => {
  if (api.integration.client && api.integration.node) {
    api.integration.publishState("motion", state.active ? "ON" : "OFF", true);
  }
};

/**
 * Spawns the monitor process and parses motion events.
 *
 * @param {Object} api - The extension api object.
 * @returns {void}
 */
const monitor = (api) => {
  const [cmd, args] = state.command;
  state.process = cpr.spawn(cmd, args);
  state.process.stdout.on("data", (data) => {
    for (const line of data.toString().split("\n")) {
      let active = null;
      if (/Motion detected - starting event/i.test(line)) {
        active = true;
      } else if (/End of event/i.test(line)) {
        active = false;
      }
      if (active !== null && active !== state.active) {
        state.active = active;
        console.info("Update Motion Detection:", active ? "ON" : "OFF");
        publish(api);
      }
    }
  });
  state.process.on("exit", (code) => {
    state.process = null;
    if (!api.app.exiting) {
      console.warn(`Motion monitor exited (${code}), restarting in 10s`);
      setTimeout(() => monitor(api), 10 * 1000);
    }
  });
};

module.exports = {
  init: async (api) => {
    state.command = getCommand(api);
    console.info(`Motion Detection [${state.command ? state.command.flat().join(" ") : "unsupported"}]`);
    if (!state.command) {
      return;
    }
    monitor(api);
    process.on("exit", () => state.process?.kill());
  },

  initIntegration: async (api) => {
    if (!state.command) {
      api.integration.removeConfig("binary_sensor", "motion");
      return;
    }
    api.integration.publishConfig("binary_sensor", "motion", { name: "Motion", device_class: "motion" });
    publish(api);
  },
};
