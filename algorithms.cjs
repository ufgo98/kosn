const SUPPORTED_ALGOS = [
    "cwm_minotaurx",
    "cwm_yespower",
    "cwm_yespowerR16",
    "cwm_yespowerSUGAR",
    "cwm_yespowerADVC",
    "cwm_ghostrider",
    "cwm_power2B",
    "cwm_yescrypt",
    "cwm_yescryptR8",
    "cwm_yescryptR16",
    "cwm_yescryptR32"
];

const ALGO_LABELS = {
    cwm_minotaurx: "Minotaurx (KEY, PLSR, AVN, ...)",
    cwm_yespower: "YesPower (VISH, SMT, YTN, ...)",
    cwm_yespowerR16: "YesPowerR16 (YTN, ...)",
    cwm_yespowerSUGAR: "YesPowerSUGAR (SUGAR, ...)",
    cwm_yespowerADVC: "YesPowerADVC (ADVC, ...)",
    cwm_ghostrider: "Ghostrider (RTM, ...)",
    cwm_power2B: "Power2B (MicroBitcoin, ...)",
    cwm_yescrypt: "Yescrypt (BSTY, XMY, UIS, ...)",
    cwm_yescryptR8: "YescryptR8 (MBTC, ...)",
    cwm_yescryptR16: "YescryptR16 (GOLD, FENEC, ...)",
    cwm_yescryptR32: "YescryptR32 (UNFY, DMS, ...)"
};

const ALGO_ALIASES = {
    power2b: "cwm_power2B",
    cwm_power2b: "cwm_power2B",
    yespower: "cwm_yespower",
    cpupower: "cwm_yespower"
};

const SUPPORTED_SET = new Set(SUPPORTED_ALGOS);

function normalizeAlgo(input) {
    const raw = String(input || "").trim();
    if (!raw) return SUPPORTED_ALGOS[0];
    if (SUPPORTED_SET.has(raw)) return raw;

    const lowered = raw.toLowerCase();
    if (ALGO_ALIASES[lowered]) {
        return ALGO_ALIASES[lowered];
    }
    return SUPPORTED_ALGOS[0];
}

module.exports = {
    SUPPORTED_ALGOS,
    ALGO_LABELS,
    normalizeAlgo
};
