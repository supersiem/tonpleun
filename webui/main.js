import { getService, initializeClient, ws } from "./clientLib.js";

const state = {
    connected: false,
    pollTimer: null
};

const MAX_LOG_LINES = 5;
const MAX_LOG_CHARS_PER_LINE = 500;

function byId(id) {
    const el = document.getElementById(id);
    if (!el) {
        throw new Error(`Missing element: ${id}`);
    }
    return el;
}

function pretty(value) {
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

function log(message, type = "info") {
    const stamp = new Date().toISOString();
    const safeMessage = String(message).slice(0, MAX_LOG_CHARS_PER_LINE);
    const line = `[${stamp}] [${type}] ${safeMessage}`;
    const logsOut = byId("logsOut");
    const previousLines = logsOut.textContent ? logsOut.textContent.trimEnd().split("\n") : [];
    previousLines.push(line);
    if (previousLines.length > MAX_LOG_LINES) {
        previousLines.splice(0, previousLines.length - MAX_LOG_LINES);
    }
    logsOut.textContent = `${previousLines.join("\n")}\n`;
    logsOut.scrollTop = logsOut.scrollHeight;
    if (type === "error") {
        console.error(line);
    } else {
        console.log(line);
    }
}

function setStatus(text, mode) {
    const status = byId("status");
    status.textContent = text;
    status.className = `status ${mode}`;
}

function parseJsonArray(raw) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
        throw new Error("Args must be a JSON array.");
    }
    return parsed;
}

async function ensureConnected() {
    if (!state.connected) {
        throw new Error("Not connected. Press Connect first.");
    }
}

async function connect() {
    if (state.connected) {
        log("Already connected.", "warn");
        return;
    }
    const clientId = byId("clientId").value.trim() || "webUI";
    setStatus("Connecting...", "warn");
    await initializeClient(clientId);
    state.connected = true;
    setStatus(`Connected as ${clientId}`, "ok");
    log(`Connected as ${clientId}`);
}

function disconnect() {
    if (!state.connected) {
        log("Already disconnected.", "warn");
        return;
    }
    if (state.pollTimer) {
        clearInterval(state.pollTimer);
        state.pollTimer = null;
    }
    if (ws) {
        try {
            ws.close();
        } catch {
            // noop
        }
    }
    state.connected = false;
    setStatus("Disconnected", "warn");
    log("Disconnected from server", "warn");
}

async function fetchConfigs() {
    await ensureConnected();
    const data = await getService("getConfigs", "tonpleun", []);
    byId("configsOut").textContent = pretty(data);
    log("Fetched getConfigs");
    return data;
}

async function fetchServices() {
    await ensureConnected();
    const data = await getService("getServices", "tonpleun", []);
    byId("servicesOut").textContent = pretty(data);
    log("Fetched getServices");
    return data;
}

async function callServiceFromForm() {
    await ensureConnected();
    const targetClient = byId("targetClient").value.trim();
    const serviceId = byId("serviceId").value.trim();
    const argsRaw = byId("serviceArgs").value;
    if (!targetClient || !serviceId) {
        throw new Error("Target Client and Service ID are required.");
    }
    const args = parseJsonArray(argsRaw);
    const result = await getService(serviceId, targetClient, args);
    byId("callOut").textContent = pretty(result);
    log(`Called ${serviceId} on ${targetClient}`);
}

async function safeRun(actionName, fn) {
    try {
        await fn();
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log(`${actionName} failed: ${msg}`, "error");
        setStatus(`Error: ${msg}`, "err");
    }
}

function startPolling() {
    if (state.pollTimer) {
        clearInterval(state.pollTimer);
    }
    const pollMsRaw = Number(byId("pollMs").value);
    const pollMs = Number.isFinite(pollMsRaw) && pollMsRaw >= 100 ? pollMsRaw : 1000;
    byId("pollMs").value = String(pollMs);
    state.pollTimer = setInterval(() => {
        safeRun("poll fetch", async () => {
            await fetchConfigs();
            await fetchServices();
        });
    }, pollMs);
    log(`Polling started every ${pollMs}ms`);
}

function stopPolling() {
    if (state.pollTimer) {
        clearInterval(state.pollTimer);
        state.pollTimer = null;
        log("Polling stopped", "warn");
    }
}

function bindEvents() {
    byId("connectBtn").addEventListener("click", () => safeRun("connect", connect));
    byId("disconnectBtn").addEventListener("click", disconnect);
    byId("fetchConfigsBtn").addEventListener("click", () => safeRun("fetch configs", fetchConfigs));
    byId("fetchServicesBtn").addEventListener("click", () => safeRun("fetch services", fetchServices));
    byId("callServiceBtn").addEventListener("click", () => safeRun("call service", callServiceFromForm));
    byId("startPollingBtn").addEventListener("click", () => safeRun("start polling", async () => {
        await ensureConnected();
        startPolling();
    }));
    byId("stopPollingBtn").addEventListener("click", stopPolling);
}

function main() {
    bindEvents();
    setStatus("Disconnected", "warn");
    log("Debug UI ready. Press Connect to start.");
}

main();