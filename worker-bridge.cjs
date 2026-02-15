const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { parentPort } = require("worker_threads");
const { performance } = require("perf_hooks");

const POWER2B_WORKER_PATH = path.resolve(__dirname, "..", "public", "power2b.worker.js");

function resolveImportPath(scriptPath) {
    if (/^https?:\/\//i.test(scriptPath)) {
        throw new Error(`importScripts URL is not supported in CLI mode: ${scriptPath}`);
    }

    if (scriptPath.startsWith("/")) {
        return path.resolve(__dirname, "..", "public", scriptPath.slice(1));
    }

    if (path.isAbsolute(scriptPath)) {
        return scriptPath;
    }

    return path.resolve(path.dirname(POWER2B_WORKER_PATH), scriptPath);
}

function importScriptsShim(...scripts) {
    for (const script of scripts) {
        const absolute = resolveImportPath(script);
        const source = fs.readFileSync(absolute, "utf8");
        vm.runInThisContext(source, { filename: absolute });
    }
}

globalThis.self = globalThis;
globalThis.location = {
    href: `file://${POWER2B_WORKER_PATH.replace(/\\/g, "/")}`
};
globalThis.performance = globalThis.performance || performance;
globalThis.importScripts = importScriptsShim;
globalThis.atob = globalThis.atob || ((value) => Buffer.from(value, "base64").toString("binary"));
globalThis.btoa = globalThis.btoa || ((value) => Buffer.from(value, "binary").toString("base64"));
globalThis.postMessage = (message) => parentPort.postMessage(message);
globalThis.onmessage = null;

// Force the bundled worker to run its browser-worker code path instead of Node path.
globalThis.process = undefined;

parentPort.on("message", (data) => {
    if (typeof globalThis.onmessage === "function") {
        globalThis.onmessage({ data });
    }
});

const workerSource = fs.readFileSync(POWER2B_WORKER_PATH, "utf8");
vm.runInThisContext(workerSource, { filename: POWER2B_WORKER_PATH });
