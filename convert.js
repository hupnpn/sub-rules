/*!
powerfullz 的 Substore 订阅转换脚本
https://github.com/powerfullz/override-rules
*/

const NODE_SUFFIX = "节点";

function parseBool(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        return value.toLowerCase() === "true" || value === "1";
    }
    return false;
}

function parseNumber(value, defaultValue = 0) {
    if (value === null || typeof value === "undefined") {
        return defaultValue;
    }
    const num = parseInt(value, 10);
    return isNaN(num) ? defaultValue : num;
}

function buildFeatureFlags(args) {
    const spec = {
        loadbalance: "loadBalance",
        landing: "landing",
        ipv6: "ipv6Enabled",
        full: "fullConfig",
        keepalive: "keepAliveEnabled",
        fakeip: "fakeIPEnabled",
        quic: "quicEnabled",
        regex: "regexFilter",
    };

    const flags = Object.entries(spec).reduce((acc, [sourceKey, targetKey]) => {
        acc[targetKey] = parseBool(args[sourceKey]) || false;
        return acc;
    }, {});

    flags.countryThreshold = parseNumber(args.threshold, 0);

    return flags;
}

const rawArgs = typeof $arguments !== "undefined" ? $arguments : {};
const {
    loadBalance,
    landing,
    ipv6Enabled,
    fullConfig,
    keepAliveEnabled,
    fakeIPEnabled,
    quicEnabled,
    regexFilter,
    countryThreshold,
} = buildFeatureFlags(rawArgs);

function getCountryGroupNames(countryInfo, minCount) {
    const filtered = countryInfo.filter((item) => item.nodes.length >= minCount);
    filtered.sort((a, b) => {
        const wa = countriesMeta[a.country]?.weight ?? Infinity;
        const wb = countriesMeta[b.country]?.weight ?? Infinity;
        return wa - wb;
    });
    return filtered.map((item) => item.country + NODE_SUFFIX);
}

function stripNodeSuffix(groupNames) {
    const suffixPattern = new RegExp(`${NODE_SUFFIX}$`);
    return groupNames.map((name) => name.replace(suffixPattern, ""));
}

// ====== 关键修改 ======
const PROXY_GROUPS = {
    SELECT: "全球加速",
    MANUAL: "手动选择",
    FALLBACK: "故障转移",
    DIRECT: "直连",
    LANDING: "落地节点",
    LOW_COST: "低倍率节点",
};

// ====== 添加“全球加速”到其他组 ======
function addGlobal(list) {
    const GLOBAL = PROXY_GROUPS.SELECT;
    return [GLOBAL, ...new Set(list.flat())];
}

const buildList = (...elements) => elements.flat().filter(Boolean);

function buildBaseLists({ landing, lowCostNodes, countryGroupNames }) {
    const lowCost = lowCostNodes.length > 0 || regexFilter;

    const defaultSelector = buildList(
        PROXY_GROUPS.FALLBACK,
        landing && PROXY_GROUPS.LANDING,
        countryGroupNames,
        lowCost && PROXY_GROUPS.LOW_COST,
        PROXY_GROUPS.MANUAL,
        "DIRECT"
    );

    const defaultProxies = buildList(
        PROXY_GROUPS.SELECT,
        countryGroupNames,
        lowCost && PROXY_GROUPS.LOW_COST,
        PROXY_GROUPS.MANUAL,
        PROXY_GROUPS.DIRECT
    );

    const defaultProxiesDirect = buildList(
        PROXY_GROUPS.DIRECT,
        countryGroupNames,
        lowCost && PROXY_GROUPS.LOW_COST,
        PROXY_GROUPS.SELECT,
        PROXY_GROUPS.MANUAL
    );

    const defaultFallback = buildList(
        landing && PROXY_GROUPS.LANDING,
        countryGroupNames,
        lowCost && PROXY_GROUPS.LOW_COST,
        PROXY_GROUPS.MANUAL,
        "DIRECT"
    );

    return { defaultProxies, defaultProxiesDirect, defaultSelector, defaultFallback };
}

// ====== 原有 ruleProviders/baseRules/dns/sniffer/countriesMeta 不变 ======
// 这里保持和你原脚本一样，我省略展示以节省篇幅
// 你可以直接保留原来的 ruleProviders、baseRules、dnsConfig、countriesMeta 等

// ====== 修改 buildProxyGroups ======
function buildProxyGroups({
    landing,
    countries,
    countryProxyGroups,
    lowCostNodes,
    landingNodes,
    defaultProxies,
    defaultProxiesDirect,
    defaultSelector,
    defaultFallback,
}) {
    const hasTW = countries.includes("台湾");
    const hasHK = countries.includes("香港");
    const hasUS = countries.includes("美国");

    const frontProxySelector = landing
        ? defaultSelector.filter(
              (name) => name !== PROXY_GROUPS.LANDING && name !== PROXY_GROUPS.FALLBACK
          )
        : [];

    return [
        {
            name: PROXY_GROUPS.SELECT,
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Global.png",
            type: "select",
            proxies: [ "香港节点", "台湾节点", "日本节点", "韩国节点", "新加坡节点", "美国节点", "手动选择", "故障转移", "DIRECT" ] // 第一个组不加自己
        },
        {
            name: PROXY_GROUPS.MANUAL,
            icon: "https://gcore.jsdelivr.net/gh/shindgewongxj/WHATSINStash@master/icon/select.png",
            "include-all": true,
            type: "select",
        },
        landing
            ? {
                  name: "前置代理",
                  icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Area.png",
                  type: "select",
                  ...(regexFilter
                      ? {
                            "include-all": true,
                            "exclude-filter": LANDING_PATTERN,
                            proxies: frontProxySelector,
                        }
                      : { proxies: frontProxySelector }),
              }
            : null,
        landing
            ? {
                  name: PROXY_GROUPS.LANDING,
                  icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Airport.png",
                  type: "select",
                  ...(regexFilter
                      ? { "include-all": true, filter: LANDING_PATTERN }
                      : { proxies: landingNodes }),
              }
            : null,
        {
            name: PROXY_GROUPS.FALLBACK,
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Bypass.png",
            type: "fallback",
            url: "https://cp.cloudflare.com/generate_204",
            proxies: defaultFallback,
            interval: 180,
            tolerance: 20,
            lazy: false,
            hidden: true,
        },
        {
            name: "YouTube",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/YouTube.png",
            type: "select",
            proxies: addGlobal([ "香港节点", "台湾节点", "日本节点", "韩国节点", "新加坡节点", "美国节点", "手动选择", "故障转移", "DIRECT" ])
        },
        {
            name: "Netflix",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Netflix.png",
            type: "select",
            proxies: addGlobal([ "香港节点", "台湾节点", "日本节点", "韩国节点", "新加坡节点", "美国节点", "手动选择", "故障转移", "DIRECT" ])
        },
        {
            name: "AI服务",
            icon: "https://gcore.jsdelivr.net/gh/powerfullz/override-rules@master/icons/chatgpt.png",
            type: "select",
            proxies: addGlobal([ "香港节点", "台湾节点", "日本节点", "韩国节点", "新加坡节点", "美国节点", "手动选择", "故障转移", "DIRECT" ])
        },
        {
            name: "Telegram",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Telegram.png",
            type: "select",
            proxies: addGlobal([ "香港节点", "台湾节点", "日本节点", "韩国节点", "新加坡节点", "美国节点", "手动选择", "故障转移", "DIRECT" ])
        },
        {
            name: "哔哩哔哩",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/bilibili.png",
            type: "select",
            proxies: addGlobal([ "香港节点", "台湾节点", "DIRECT" ])
        },
        {
            name: "巴哈姆特",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Bahamut.png",
            type: "select",
            proxies: addGlobal([ "香港节点", "台湾节点", "DIRECT" ])
        },
        {
            name: "TikTok",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/TikTok.png",
            type: "select",
            proxies: addGlobal([ "香港节点", "台湾节点", "日本节点", "韩国节点", "新加坡节点", "美国节点", "手动选择", "故障转移", "DIRECT" ])
        },
        {
            name: "Spotify",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Spotify.png",
            type: "select",
            proxies: addGlobal([ "香港节点", "台湾节点", "日本节点", "韩国节点", "新加坡节点", "美国节点", "手动选择", "故障转移", "DIRECT" ])
        },
        {
            name: "Apple",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Apple.png",
            type: "select",
            proxies: addGlobal([ "香港节点", "台湾节点", "日本节点", "韩国节点", "新加坡节点", "美国节点", "手动选择", "故障转移", "DIRECT" ])
        },
        {
            name: "Google",
            icon: "https://gcore.jsdelivr.net/gh/powerfullz/override-rules@master/icons/Google.png",
            type: "select",
            proxies: addGlobal([ "香港节点", "台湾节点", "日本节点", "韩国节点", "新加坡节点", "美国节点", "手动选择", "故障转移", "DIRECT" ])
        },
        {
            name: "微软服务",
            icon: "https://gcore.jsdelivr.net/gh/powerfullz/override-rules@master/icons/Microsoft_Copilot.png",
            type: "select",
            proxies: addGlobal([ "香港节点", "台湾节点", "日本节点", "韩国节点", "新加坡节点", "美国节点", "手动选择", "故障转移", "DIRECT" ])
        },
        {
            name: PROXY_GROUPS.DIRECT,
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Direct.png",
            type: "select",
            proxies: ["DIRECT"],
        },
        {
            name: "广告拦截",
            icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/AdBlack.png",
            type: "select",
            proxies: ["REJECT", "REJECT-DROP", PROXY_GROUPS.DIRECT],
        },
        lowCostNodes.length > 0 || regexFilter
            ? {
                  name: PROXY_GROUPS.LOW_COST,
                  icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Lab.png",
                  type: "select",
                  url: "https://cp.cloudflare.com/generate_204",
                  ...(!regexFilter
                      ? { proxies: lowCostNodes }
                      : { "include-all": true, filter: "(?i)0\\.[0-5]|低倍率|省流|大流量|实验性" }),
              }
            : null,
        ...countryProxyGroups,
    ].filter(Boolean);
}

// ===== main 函数保持原有逻辑，只是生成的 proxyGroups 已经加了“全球加速”
function main(config) {
    const resultConfig = { proxies: config.proxies };
    const countryInfo = parseCountries(resultConfig);
    const lowCostNodes = parseLowCost(resultConfig);
    const landingNodes = landing ? parseLandingNodes(resultConfig) : [];
    const countryGroupNames = getCountryGroupNames(countryInfo, countryThreshold);
    const countries = stripNodeSuffix(countryGroupNames);
    const { defaultProxies, defaultProxiesDirect, defaultSelector, defaultFallback } =
        buildBaseLists({ landing, lowCostNodes, countryGroupNames });

    const countryProxyGroups = buildCountryProxyGroups({
        countries,
        landing,
        loadBalance,
        regexFilter,
        countryInfo,
    });

    const proxyGroups = buildProxyGroups({
        landing,
        countries,
        countryProxyGroups,
        lowCostNodes,
        landingNodes,
        defaultProxies,
        defaultProxiesDirect,
        defaultSelector,
        defaultFallback,
    });

    const globalProxies = proxyGroups.map((item) => item.name);
    proxyGroups.push({
        name: "GLOBAL",
        icon: "https://gcore.jsdelivr.net/gh/Koolson/Qure@master/IconSet/Color/Proxy.png",
        "include-all": true,
        type: "select",
        proxies: globalProxies,
    });

    const finalRules = buildRules({ quicEnabled });

    if (fullConfig)
        Object.assign(resultConfig, {
            "mixed-port": 7890,
            "redir-port": 7892,
            "tproxy-port": 7893,
            "routing-mark": 7894,
            "allow-lan": true,
            "bind-address": "*",
            ipv6: ipv6Enabled,
            mode: "rule",
            "unified-delay": true,
            "tcp-concurrent": true,
            "find-process-mode": "off",
            "log-level": "info",
            "geodata-loader": "standard",
            "external-controller": ":9999",
            "disable-keep-alive": !keepAliveEnabled,
            profile: { "store-selected": true },
        });

    Object.assign(resultConfig, {
        "proxy-groups": proxyGroups,
        "rule-providers": ruleProviders,
        rules: finalRules,
        sniffer: snifferConfig,
        dns: fakeIPEnabled ? dnsConfigFakeIp : dnsConfig,
        "geodata-mode": true,
        "geox-url": geoxURL,
    });

    return resultConfig;
}
