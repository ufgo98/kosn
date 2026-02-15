const path = require("path");
const { Worker } = require("worker_threads");
const { EventEmitter } = require("events");
const { normalizeAlgo } = require("./algorithms.cjs");

function resolveWebSocketImpl() {
    if (typeof globalThis.WebSocket === "function") {
        return globalThis.WebSocket;
    }

    try {
        // Node versions without global WebSocket can use ws package.
        // eslint-disable-next-line global-require
        return require("ws");
    } catch (_) {
        throw new Error(
            "WebSocket is not available. Use Node 22+ or install ws: npm i ws"
        );
    }
}

const WebSocketImpl = resolveWebSocketImpl();

function toUtf8(data) {
    if (typeof data === "string") return data;
    if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
    if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
    if (Buffer.isBuffer(data)) return data.toString("utf8");
    return String(data);
}

function encodeTarget(target) {
    return Buffer.from(target, "utf8").toString("base64");
}

function normalizeSocketUrl(config) {
    const host = String(config.host || "").trim();
    if (!host) {
        throw new Error("Missing required config: host");
    }

    // If host is already a full ws:// or wss:// URL, use it directly.
    if (/^wss?:\/\//i.test(host)) {
        return host;
    }

    const proxy = String(config.proxy || "").trim();
    if (!proxy) {
        throw new Error("When host is not a full websocket URL, config.proxy is required.");
    }

    const port = Number(config.port);
    if (!Number.isFinite(port) || port <= 0) {
        throw new Error("Missing or invalid config.port");
    }

    const proxyBase = proxy.replace(/\/+$/, "");
    return `${proxyBase}/${encodeTarget(`${host}:${port}`)}`;
}

class CliMiner extends EventEmitter {
    constructor(config) {
        super();

        this.config = { ...config };
        this.algorithm = normalizeAlgo(this.config.algo || this.config.algorithm);
        const configuredClientVersion = this.config.clientVersion
            ?? this.config.version
            ?? this.config.subscribeVersion
            ?? this.config.minerVersion;
        this.clientVersion = String(configuredClientVersion || "webminer/1.0").trim() || "webminer/1.0";
        this.socketUrl = normalizeSocketUrl(this.config);
        this.socket = null;
        this.connected = false;
        this.running = false;

        this.extraNonce1 = "";
        this.extraNonce2Size = 0;
        this.difficulty = 0.01;
        this.job = null;
        this.jobGeneration = 0;

        this.msgId = 1;
        this.pendingRequests = new Map();

        const requestedThreads = Number(this.config.threads ?? this.config.workers ?? 1);
        this.threads = Number.isFinite(requestedThreads) && requestedThreads > 0
            ? Math.floor(requestedThreads)
            : 1;

        this.workerBridgePath = path.resolve(__dirname, "worker-bridge.cjs");
        this.workers = [];
        this.workerHashrates = [];

        this.accepted = 0;
        this.rejected = 0;
        this.hashrate = 0;
    }

    setStatus(status) {
        this.status = status;
        this.emit("status", status);
    }

    emitStats() {
        this.emit("stats", {
            hashrate: this.hashrate,
            accepted: this.accepted,
            rejected: this.rejected
        });
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.accepted = 0;
        this.rejected = 0;
        this.hashrate = 0;
        this.workerHashrates = new Array(this.threads).fill(0);
        this.emitStats();
        this.connect();
    }

    stop() {
        this.running = false;
        this.connected = false;
        this.jobGeneration++;

        if (this.socket) {
            try {
                this.socket.close();
            } catch (_) {
                // Ignore close errors during shutdown.
            }
            this.socket = null;
        }

        this.terminateWorkers();
        this.setStatus("Stopped");
    }

    connect() {
        this.setStatus("Connecting...");
        this.socket = new WebSocketImpl(this.socketUrl);
        this.socket.binaryType = "arraybuffer";

        this.socket.onopen = () => {
            this.connected = true;
            this.setStatus("Connected, Authenticating...");
            this.emit("connect");
            this.startStratum();
        };

        this.socket.onmessage = (event) => {
            this.handleSocketMessage(event.data);
        };

        this.socket.onerror = (event) => {
            const err = event && event.error ? event.error : new Error("WebSocket error");
            this.setStatus("Error");
            this.emit("error", err);
        };

        this.socket.onclose = () => {
            this.connected = false;
            this.terminateWorkers();
            if (this.running) {
                this.setStatus("Disconnected");
                this.emit("close");
            }
        };
    }

    handleSocketMessage(rawData) {
        const payload = toUtf8(rawData);
        const lines = payload.split("\n");
        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const message = JSON.parse(line);
                this.processStratumMessage(message);
            } catch (_) {
                // Ignore invalid chunks from proxy.
            }
        }
    }

    processStratumMessage(msg) {
        const pendingType = msg && msg.id != null ? this.pendingRequests.get(msg.id) : null;
        if (pendingType) {
            this.pendingRequests.delete(msg.id);

            if (pendingType === "submit") {
                const ok = msg.result === true && !msg.error;
                if (ok) {
                    this.accepted += 1;
                    this.emit("accepted", this.accepted);
                } else {
                    this.rejected += 1;
                    this.emit("rejected", this.rejected);
                }
                this.emitStats();
            }

            if (pendingType === "authorize" && (msg.result !== true || msg.error)) {
                this.emit("error", new Error("Worker authorization failed"));
            }
        }

        if (msg.id !== null && Array.isArray(msg.result) && msg.result.length >= 2 && typeof msg.result[1] === "string") {
            this.extraNonce1 = msg.result[1];
            this.extraNonce2Size = msg.result[2] || 4;
            this.emit("subscribe", {
                extraNonce1: this.extraNonce1,
                extraNonce2Size: this.extraNonce2Size
            });
            return;
        }

        if (msg.method === "mining.set_difficulty") {
            this.difficulty = msg.params?.[0] || this.difficulty;
            this.emit("difficulty", this.difficulty);
            return;
        }

        if (msg.method === "mining.notify") {
            const params = msg.params || [];
            this.job = {
                extraNonce1: this.extraNonce1,
                extraNonce2Size: this.extraNonce2Size || 4,
                miningDiff: this.difficulty || 0.01,
                jobId: params[0],
                prevhash: params[1],
                coinb1: params[2],
                coinb2: params[3],
                merkle_branch: params[4],
                version: params[5],
                nbits: params[6],
                ntime: params[7],
                clean_jobs: params[8],
                nonce: 0,
                arg: "0607"
            };

            this.setStatus("Mining");
            this.emit("job", this.job);
            this.notifyWorkers(this.job);
        }
    }

    sendJson(method, params, requestType = "generic") {
        if (!this.connected || !this.socket || this.socket.readyState !== WebSocketImpl.OPEN) return null;
        const id = this.msgId++;
        const message = {
            id,
            method,
            params
        };
        this.pendingRequests.set(id, requestType);
        this.socket.send(`${JSON.stringify(message)}\n`);
        return id;
    }

    startStratum() {
        this.sendJson("mining.subscribe", [this.clientVersion], "subscribe");
        setTimeout(() => {
            if (!this.running) return;
            this.sendJson("mining.authorize", [this.config.user, this.config.pass || "x"], "authorize");
        }, 700);
    }

    terminateWorkers() {
        for (const worker of this.workers) {
            worker.terminate();
        }
        this.workers = [];
        this.workerHashrates = new Array(this.threads).fill(0);
        this.hashrate = 0;
        this.emit("hashrate", 0);
        this.emitStats();
    }

    notifyWorkers(job) {
        this.terminateWorkers();
        const generation = ++this.jobGeneration;
        this.workerHashrates = new Array(this.threads).fill(0);

        for (let index = 0; index < this.threads; index++) {
            this.createWorker(index, job, generation);
        }
    }

    createWorker(index, job, generation) {
        const worker = new Worker(this.workerBridgePath);
        this.workers.push(worker);

        worker.on("message", (data) => {
            if (generation !== this.jobGeneration || !this.running) return;
            this.handleWorkerMessage(index, data);
        });

        worker.on("error", (err) => {
            this.emit("error", err);
        });

        worker.postMessage({
            algo: this.algorithm,
            work: job
        });
    }

    handleWorkerMessage(workerIndex, data) {
        if (!data || typeof data !== "object") return;

        if (data.type === "hashrate") {
            const value = Number(data.value) || 0;
            this.workerHashrates[workerIndex] = value * 1000;
            this.hashrate = this.workerHashrates.reduce((sum, current) => sum + current, 0);
            this.emit("hashrate", this.hashrate);
            this.emitStats();
            return;
        }

        if (data.type === "submit" || data.type === "share") {
            if (data.hashrate != null) {
                // The extracted worker often reports hashrate with submit events.
                const workerHashrate = Number(data.hashrate) || 0;
                this.workerHashrates[workerIndex] = workerHashrate * 1000;
                this.hashrate = this.workerHashrates.reduce((sum, current) => sum + current, 0);
                this.emit("hashrate", this.hashrate);
                this.emitStats();
            }

            const share = data.data || data.share;
            if (share && share.job_id && share.extranonce2 && share.ntime && share.nonce) {
                this.sendJson("mining.submit", [
                    this.config.user,
                    share.job_id,
                    share.extranonce2,
                    share.ntime,
                    share.nonce
                ], "submit");
                this.emit("share_submitted", share);
            }
            return;
        }

        if (data.type === "log" && data.message) {
            this.emit("worker_log", String(data.message));
        }
    }
}

module.exports = CliMiner;
